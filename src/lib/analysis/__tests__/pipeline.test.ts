/**
 * 분석 파이프라인 테스트.
 * 여기서 쓰는 Gemini 응답과 웹페이지는 모두 테스트용 모의 데이터이며 실제 API를 호출하지 않는다.
 */
import { describe, expect, it } from "vitest";
import type { FetchedPage } from "@/lib/security/safe-fetch";
import { AnalysisError } from "../errors";
import type { AnalyzeEvent } from "../events";
import type { GeminiOutput, GeminiPort, GeminiRequest } from "../gemini";
import { runAnalysis, type PipelineDeps } from "../pipeline";
import type { AnalysisResult, ClaimExtraction, ReportDraft } from "../schema";

const AD_HTML = `<html><head><title>슬림핏 다이어트 보조제</title></head><body>
<h1>단 2주 만에 -10kg, 100% 효과 보장</h1>
<p>식약처 인증을 받은 체지방 감소 원료를 사용했습니다.</p>
<p>고객 만족도 98%, 부작용이 전혀 없는 천연 성분입니다.</p>
<p>지금 주문하면 무료 체험! 개인에 따라 효과에 차이가 있을 수 있습니다. 정기배송 조건이 적용됩니다.</p>
</body></html>`;

const extraction = (overrides: Partial<ClaimExtraction> = {}): ClaimExtraction => ({
  pageReadable: true,
  pageTitle: "슬림핏 다이어트 보조제",
  productType: "health_functional_food",
  hasAdContent: true,
  noContentReason: "",
  injectionSuspected: false,
  claims: [
    { originalText: "단 2주 만에 -10kg, 100% 효과 보장", category: "absolute", whyCheck: "효과를 단정합니다." },
    { originalText: "식약처 인증을 받은 체지방 감소 원료", category: "authority", whyCheck: "인증 범위 확인이 필요합니다." },
    { originalText: "고객 만족도 98%", category: "statistics", whyCheck: "조사 조건이 없습니다." },
  ],
  ...overrides,
});

const VERIFY_TEXT = `### C1
- 확인된 사실: 확인된 자료 없음

### C2
- 확인된 사실: 식품의약품안전처는 2023년 고시에서 체지방 감소 기능성 원료 목록을 공개했습니다.

### C3
- 확인된 사실: 확인된 자료 없음

### LAW
- 「식품 등의 표시·광고에 관한 법률」은 부당한 표시·광고를 금지합니다.
`;

const byteIndexOf = (text: string, marker: string) =>
  Buffer.byteLength(text.slice(0, text.indexOf(marker)), "utf8");

const verifyOutput = (withCitations: boolean): GeminiOutput => ({
  status: "completed",
  text: VERIFY_TEXT,
  blocks: [
    {
      text: VERIFY_TEXT,
      citations: withCitations
        ? [
            { url: "https://www.mfds.go.kr/notice/1", title: "기능성 원료 고시", startIndex: byteIndexOf(VERIFY_TEXT, "식품의약품안전처는") },
            { url: "https://www.law.go.kr/law/1", title: "식품표시광고법", startIndex: byteIndexOf(VERIFY_TEXT, "「식품 등의") },
          ]
        : [],
    },
  ],
  urlContext: [],
  searchQueries: withCitations ? ["식약처 체지방 감소 기능성 원료"] : [],
});

const draft = (overrides: Partial<ReportDraft> = {}): ReportDraft => ({
  summary: "일부 주장은 추가 검증이 필요합니다.",
  claims: [
    { id: "C1", verificationStatus: "insufficient", concern: "효과 보장", explanation: "근거를 찾지 못했습니다.", evidenceSummary: "", sourceIds: [], recommendedAction: "근거 자료를 요청하세요.", legalNote: "부당한 표시·광고에 해당할 소지가 있어 확인이 필요합니다." },
    { id: "C2", verificationStatus: "needs_verification", concern: "인증 범위", explanation: "원료 인정과 제품 인증은 다릅니다.", evidenceSummary: "식약처가 원료 목록을 공개하고 있습니다.", sourceIds: ["S1"], recommendedAction: "식품안전나라에서 조회하세요.", legalNote: "" },
    { id: "C3", verificationStatus: "supported", concern: "수치 근거", explanation: "확인되었습니다.", evidenceSummary: "", sourceIds: ["S9"], recommendedAction: "조사 조건을 확인하세요.", legalNote: "" },
  ],
  relevantLaws: [{ name: "식품 등의 표시·광고에 관한 법률", note: "부당한 표시·광고 금지" }],
  sourceDates: [
    { sourceId: "S1", publishedAt: "2023" },
    { sourceId: "S2", publishedAt: "2019-05-01" },
  ],
  limitations: [],
  ...overrides,
});

const json = (value: unknown, extra: Partial<GeminiOutput> = {}): GeminiOutput => ({
  status: "completed",
  text: JSON.stringify(value),
  blocks: [{ text: JSON.stringify(value), citations: [] }],
  urlContext: [],
  searchQueries: [],
  ...extra,
});

type Reply = GeminiOutput | Error;

function mockGemini(replies: Reply[]): GeminiPort & { requests: GeminiRequest[] } {
  const requests: GeminiRequest[] = [];
  return {
    model: "mock-model",
    requests,
    async generate(request) {
      requests.push(request);
      const reply = replies.shift();
      if (!reply) throw new Error("no more mock replies");
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

const okPage = async (url: URL): Promise<FetchedPage> => ({
  finalUrl: url.toString(),
  html: AD_HTML,
  contentType: "text/html",
  truncated: false,
});

async function run(gemini: GeminiPort, overrides: Partial<PipelineDeps> = {}, url = "https://shop.example.com/item") {
  const events: AnalyzeEvent[] = [];
  await runAnalysis(
    url,
    {
      gemini,
      pageReader: "direct",
      fetchPage: okPage,
      checkHost: async () => undefined,
      resolveRedirect: async () => null,
      now: () => new Date("2026-11-10T03:00:00Z"),
      ...overrides,
    },
    (event) => events.push(event),
  );
  const result = events.find((event) => event.type === "result")?.result as AnalysisResult | undefined;
  const error = events.find((event) => event.type === "error");
  const stages = events.flatMap((event) => (event.type === "stage" ? [`${event.stage}:${event.status}`] : []));
  return { events, result, error, stages };
}

describe("runAnalysis", () => {
  const visual = { frames: [{ id: "V1", image: "data:image/jpeg;base64,AA==", width: 1200, height: 1600, offsetY: 0 }], capturedAt: "2026-11-10T03:00:00Z", mode: "static" as const, truncated: false };

  it("analyzes image-only advertisements and preserves the screenshot location", async () => {
    const region = { frameId: "V1", x: 100, y: 200, width: 500, height: 100 };
    const imageClaims = extraction({ claims: [] });
    const gemini = mockGemini([json({ ...imageClaims, claims: [{ originalText: "첫 구매 최대 30% 할인", category: "statistics", whyCheck: "적용 조건 확인", sourceType: "image", visualRegion: region }] }), verifyOutput(false), json(draft())]);
    const { result, error } = await run(gemini, {
      fetchPage: async () => ({ finalUrl: "https://shop.example.com/ad", html: '<html><body><img src="ad.png"></body></html>', contentType: "text/html", truncated: false }),
      capturePage: async () => visual,
    });
    expect(error).toBeUndefined();
    expect(result?.claims[0]).toMatchObject({ originalText: "첫 구매 최대 30% 할인", sourceType: "image", visualRegion: region, quoteVerified: false, position: null });
    expect(result?.visual).toEqual(visual);
    expect(gemini.requests[0].images).toEqual([{ label: "V1", data: "AA==", mimeType: "image/jpeg" }]);
    expect(gemini.requests[0].tools).toBeUndefined();
  });

  it("drops image-only claims pointing outside a captured screen", async () => {
    const gemini = mockGemini([json({ ...extraction({ claims: [] }), claims: [{ originalText: "존재하지 않는 할인 문구", category: "statistics", whyCheck: "test", sourceType: "image", visualRegion: { frameId: "V99", x: 10, y: 10, width: 20, height: 20 } }] })]);
    const { result, error } = await run(gemini, { capturePage: async () => visual });
    expect(error).toBeUndefined();
    expect(result?.claims).toEqual([]);
  });

  it("does not silently skip image analysis when the capture queue is full", async () => {
    const gemini = mockGemini([]);
    const { result, error } = await run(gemini, {
      capturePage: async () => { throw new AnalysisError("SERVER_BUSY"); },
    });
    expect(result).toBeUndefined();
    expect(error).toMatchObject({ code: "SERVER_BUSY", retryable: true });
    expect(gemini.requests).toHaveLength(0);
  });

  it("rejects an unreadable image-only page before evidence search", async () => {
    const gemini = mockGemini([json(extraction({ pageReadable: false, claims: [] }))]);
    const { result, error } = await run(gemini, {
      fetchPage: async () => ({ finalUrl: "https://shop.example.com/ad", html: '<html><body><img src="ad.png"></body></html>', contentType: "text/html", truncated: false }),
      capturePage: async () => visual,
    });
    expect(result).toBeUndefined();
    expect(error).toMatchObject({ code: "NO_CONTENT" });
    expect(gemini.requests).toHaveLength(1);
  });

  it("keeps text analysis available when the capture runtime cannot start", async () => {
    const gemini = mockGemini([json(extraction()), verifyOutput(false), json(draft())]);
    const { result, error } = await run(gemini, { capturePage: async () => { throw new Error("browser unavailable"); } });
    expect(error).toBeUndefined();
    expect(result?.claims.length).toBe(3);
    expect(result?.visual).toBeNull();
    expect(result?.limitations.join(" ")).toContain("화면 캡처를 준비하지 못해");
  });

  it("runs all five stages in order and returns a validated report", async () => {
    const gemini = mockGemini([json(extraction()), verifyOutput(true), json(draft())]);
    const { result, stages, error } = await run(gemini);

    expect(error).toBeUndefined();
    expect(stages).toEqual([
      "validate:active", "validate:done",
      "collect:active", "collect:done",
      "claims:active", "claims:done",
      "verify:active", "verify:done",
      "report:active", "report:done",
    ]);

    expect(result).toMatchObject({
      url: "https://shop.example.com/item",
      domain: "shop.example.com",
      title: "슬림핏 다이어트 보조제",
      category: "health_functional_food",
      analyzedAt: "2026-11-10T03:00:00.000Z",
      outcome: "complete",
      contentSource: "direct",
      model: "mock-model",
      searchQueries: ["식약처 체지방 감소 기능성 원료"],
    });
    expect(result?.claims.map((claim) => claim.id)).toEqual(["C1", "C2", "C3"]);
    expect(result?.claims.every((claim) => claim.quoteVerified && claim.position)).toBe(true);

    // 하이라이트 위치는 화면에 보여 줄 원문과 정확히 대응한다.
    const first = result!.claims[0];
    expect(result!.pageText!.slice(first.position!.start, first.position!.end)).toBe(first.originalText);
  });

  it("only uses tools where they belong and wraps page text as untrusted data", async () => {
    const gemini = mockGemini([json(extraction()), verifyOutput(true), json(draft())]);
    await run(gemini);
    const [claims, verify, report] = gemini.requests;

    expect(claims.tools).toBeUndefined();
    expect(claims.jsonSchema).toBeDefined();
    expect(claims.input).toMatch(/<<<PAGE_TEXT:[0-9a-f]{16}>>>/);
    expect(claims.system).toContain("신뢰할 수 없는 데이터");

    expect(verify.tools).toEqual([{ type: "google_search" }]);
    expect(verify.jsonSchema).toBeUndefined();
    expect(verify.system).toContain("mfds.go.kr");

    expect(report.tools).toBeUndefined();
    expect(report.jsonSchema).toBeDefined();
  });

  it("links sources from real citations and never trusts unknown source IDs", async () => {
    const gemini = mockGemini([json(extraction()), verifyOutput(true), json(draft())]);
    const { result } = await run(gemini);

    expect(result?.sources).toEqual([
      expect.objectContaining({ id: "S1", url: "https://www.mfds.go.kr/notice/1", organization: "식품의약품안전처", isOfficial: true, claimIds: ["C2"], publishedAt: null }),
      // 검색 본문의 연도는 출처별 발행일 증명이 아니므로 날짜를 표시하지 않는다.
      expect.objectContaining({ id: "S2", organization: "국가법령정보센터", claimIds: [], publishedAt: null }),
    ]);
    expect(result?.claims[1]).toMatchObject({ verificationStatus: "needs_verification", sourceIds: ["S1"] });
    // C3: 존재하지 않는 출처 S9만 제시한 "근거 확인"은 인정하지 않는다.
    expect(result?.claims[2]).toMatchObject({ verificationStatus: "insufficient", sourceIds: [] });
    expect(result?.limitations.join(" ")).toContain("보수적으로 조정");
  });

  it("drops quotes that are not on the page", async () => {
    const gemini = mockGemini([
      json(
        extraction({
          claims: [
            { originalText: "FDA가 승인한 유일한 다이어트 제품", category: "authority", whyCheck: "x" },
            { originalText: "고객 만족도 98%", category: "statistics", whyCheck: "조사 조건 없음" },
            { originalText: "고객  만족도 98%", category: "statistics", whyCheck: "중복" },
          ],
        }),
      ),
      verifyOutput(false),
      json(draft({ claims: [draft().claims[0]], sourceDates: [] })),
    ]);
    const { result } = await run(gemini);

    expect(result?.claims.map((claim) => claim.originalText)).toEqual(["고객 만족도 98%"]);
    expect(result?.limitations.join(" ")).toContain("원문에서 확인되지 않은 1건");
  });

  it.each(["2023-12-31", "2023-99-99", "2023"])("omits model-proposed source date %s without source publication metadata", async (date) => {
    const gemini = mockGemini([
      json(extraction()), verifyOutput(true),
      json(draft({ sourceDates: [{ sourceId: "S1", publishedAt: date }, { sourceId: "S2", publishedAt: date }] })),
    ]);
    const { result } = await run(gemini);
    expect(result?.sources.map((source) => source.publishedAt)).toEqual([null, null]);
  });

  it("reports a partial result when search grounding returns no sources", async () => {
    const gemini = mockGemini([
      json(extraction()),
      verifyOutput(false),
      json(
        draft({
          claims: draft().claims.map((claim) => ({ ...claim, verificationStatus: "contradicted" as const, sourceIds: ["S1"] })),
        }),
      ),
    ]);
    const { result, events } = await run(gemini);

    expect(result?.outcome).toBe("partial");
    expect(result?.sources).toEqual([]);
    expect(result?.claims.every((claim) => claim.sourceIds.length === 0)).toBe(true);
    expect(result?.claims.map((claim) => claim.verificationStatus)).toEqual([
      "needs_verification", "needs_verification", "needs_verification",
    ]);
    expect(result?.limitations.join(" ")).toContain("출처를 확보하지 못해");
    expect(events).toContainEqual(expect.objectContaining({ stage: "verify", status: "done", detail: expect.stringContaining("찾지 못했어요") }));
  });

  it("marks claims the model forgot as undetermined", async () => {
    const gemini = mockGemini([json(extraction()), verifyOutput(true), json(draft({ claims: draft().claims.slice(0, 1) }))]);
    const { result } = await run(gemini);
    expect(result?.claims.map((claim) => claim.verificationStatus)).toEqual(["insufficient", "undetermined", "undetermined"]);
  });

  it("skips verification when the page has no claims", async () => {
    const gemini = mockGemini([
      json(extraction({ hasAdContent: false, claims: [], noContentReason: "회사 소개 페이지로 광고 주장이 없습니다." })),
    ]);
    const { result, stages } = await run(gemini);

    expect(result).toMatchObject({ outcome: "no_claims", claims: [], sources: [], summary: "회사 소개 페이지로 광고 주장이 없습니다." });
    expect(stages.slice(-2)).toEqual(["verify:skipped", "report:skipped"]);
    expect(gemini.requests).toHaveLength(1);
  });

  it("notes a suspected prompt injection without obeying it", async () => {
    const gemini = mockGemini([json(extraction({ injectionSuspected: true })), verifyOutput(true), json(draft())]);
    const { result } = await run(gemini);
    expect(result?.limitations.join(" ")).toContain("AI에게 지시하려는 문구");
  });

  describe("input and page failures", () => {
    it.each([
      ["", "EMPTY_URL"],
      ["not a url", "INVALID_URL"],
      ["http://localhost:3000/", "BLOCKED_URL"],
      ["http://169.254.169.254/latest/meta-data/", "BLOCKED_URL"],
      ["ftp://example.com/a", "UNSUPPORTED_PROTOCOL"],
    ])("rejects %j at the validate stage without calling Gemini", async (url, code) => {
      const gemini = mockGemini([]);
      const { error, result } = await run(gemini, {}, url);
      expect(error).toMatchObject({ stage: "validate", code });
      expect(result).toBeUndefined();
      expect(gemini.requests).toHaveLength(0);
    });

    it("stops at the validate stage when the host resolves to a private address", async () => {
      const gemini = mockGemini([]);
      const { error } = await run(gemini, {
        checkHost: async () => {
          throw new AnalysisError("BLOCKED_URL");
        },
      });
      expect(error).toMatchObject({ stage: "validate", code: "BLOCKED_URL", retryable: false });
    });

    it("fails immediately for a page that does not exist", async () => {
      const gemini = mockGemini([]);
      const { error } = await run(gemini, {
        fetchPage: async () => {
          throw new AnalysisError("PAGE_NOT_FOUND");
        },
      });
      expect(error).toMatchObject({ stage: "collect", code: "PAGE_NOT_FOUND" });
      expect(gemini.requests).toHaveLength(0);
    });

    it("falls back to Gemini URL Context when the server cannot read the page", async () => {
      const gemini = mockGemini([
        json(extraction(), { urlContext: [{ url: "https://shop.example.com/item", status: "success" }] }),
        verifyOutput(true),
        json(draft()),
      ]);
      const { result, stages } = await run(gemini, {
        fetchPage: async () => {
          throw new AnalysisError("PAGE_FORBIDDEN");
        },
      });

      expect(gemini.requests[0].tools).toEqual([{ type: "url_context" }]);
      expect(gemini.requests[0].input).not.toContain("PAGE_TEXT");
      expect(stages.slice(0, 6)).toEqual([
        "validate:active", "validate:done", "collect:active", "collect:active", "collect:done", "claims:active",
      ]);
      expect(result).toMatchObject({ contentSource: "url_context", pageText: null });
      expect(result?.claims.every((claim) => !claim.quoteVerified && claim.position === null)).toBe(true);
      expect(result?.limitations.join(" ")).toContain("원문과 대조하지 못했습니다");
    });

    it("never shows model output when neither the server nor Gemini read the page", async () => {
      const gemini = mockGemini([
        // 모델이 페이지를 읽지 못하고도 그럴듯한 주장을 지어낸 상황
        json(extraction(), { urlContext: [{ url: "https://shop.example.com/item", status: "error" }] }),
      ]);
      const { error, result } = await run(gemini, {
        fetchPage: async () => {
          throw new AnalysisError("PAGE_FORBIDDEN");
        },
      });
      expect(result).toBeUndefined();
      expect(error).toMatchObject({ stage: "collect", code: "PAGE_FORBIDDEN" });
    });

    it("treats a page with almost no text as having no content", async () => {
      const gemini = mockGemini([json(extraction({ pageReadable: false, claims: [] }))]);
      const { error } = await run(gemini, {
        fetchPage: async (url) => ({ finalUrl: url.toString(), html: "<body><p>짧음</p></body>", contentType: "text/html", truncated: false }),
      });
      expect(error).toMatchObject({ stage: "collect", code: "NO_CONTENT" });
    });
  });

  describe("url-context reader mode", () => {
    it("reads with URL Context and cross-checks quotes against the server copy", async () => {
      const gemini = mockGemini([
        json(extraction(), { urlContext: [{ url: "https://shop.example.com/item", status: "success" }] }),
        verifyOutput(true),
        json(draft()),
      ]);
      const { result } = await run(gemini, { pageReader: "url-context" });

      expect(gemini.requests[0].tools).toEqual([{ type: "url_context" }]);
      expect(gemini.requests[0].input).toContain("PAGE_TEXT");
      expect(result?.contentSource).toBe("both");
      expect(result?.claims.every((claim) => claim.quoteVerified)).toBe(true);
    });

    it("retries with the server copy alone when the tool request is rejected", async () => {
      const gemini = mockGemini([
        new AnalysisError("AI_BAD_REQUEST", { httpStatus: 400 }), // 도구 + 구조화 출력
        new AnalysisError("AI_BAD_REQUEST", { httpStatus: 400 }), // 도구 + 프롬프트 JSON
        json(extraction()), // 도구 없이
        verifyOutput(true),
        json(draft()),
      ]);
      const { result, error } = await run(gemini, { pageReader: "url-context" });

      expect(error).toBeUndefined();
      expect(gemini.requests[2].tools).toBeUndefined();
      expect(result?.contentSource).toBe("direct");
    });
  });

  describe("Gemini failures", () => {
    it.each([
      [0, "claims", "AI_QUOTA", true],
      [0, "claims", "AI_AUTH", false],
      [1, "verify", "AI_UNAVAILABLE", true],
      [2, "report", "AI_TIMEOUT", true],
    ] as const)("reports a failure in call %i at the %s stage as %s", async (failAt, stage, code, retryable) => {
      const replies: Reply[] = [json(extraction()), verifyOutput(true), json(draft())];
      replies[failAt] = new AnalysisError(code);
      const { error, result } = await run(mockGemini(replies));

      expect(result).toBeUndefined();
      expect(error).toMatchObject({ stage, code, retryable });
      expect(error && "message" in error ? error.message : "").toMatch(/[가-힣]/);
    });

    it("reports unparseable responses as AI_BAD_RESPONSE", async () => {
      const bad: GeminiOutput = { status: "completed", text: "죄송합니다.", blocks: [], urlContext: [], searchQueries: [] };
      const { error } = await run(mockGemini([bad, bad]));
      expect(error).toMatchObject({ stage: "claims", code: "AI_BAD_RESPONSE" });
    });

    it("turns unexpected exceptions into a generic error instead of crashing", async () => {
      const { error } = await run(mockGemini([new Error("boom")]));
      expect(error).toMatchObject({ code: "INTERNAL", stage: "claims" });
    });
  });

  it("stops when the request is cancelled", async () => {
    const controller = new AbortController();
    const gemini = mockGemini([json(extraction())]);
    const { error } = await run(gemini, {
      signal: controller.signal,
      fetchPage: async (url) => {
        controller.abort();
        return okPage(url);
      },
    });
    expect(error).toMatchObject({ code: "ABORTED" });
    expect(gemini.requests).toHaveLength(0);
  });

  it("passes cancellation to every AI stage", async () => {
    const controller = new AbortController();
    const gemini = mockGemini([json(extraction()), verifyOutput(true), json(draft())]);
    const { result } = await run(gemini, { signal: controller.signal });
    expect(result?.outcome).toBe("complete");
    expect(gemini.requests).toHaveLength(3);
    expect(gemini.requests.every((request) => request.signal === controller.signal)).toBe(true);
  });

  it("never emits success if cancellation arrives during report generation", async () => {
    const controller = new AbortController();
    const replies = [json(extraction()), verifyOutput(true), json(draft())];
    const gemini: GeminiPort = {
      model: "mock-model",
      async generate() {
        if (replies.length === 1) controller.abort();
        return replies.shift()!;
      },
    };
    const { result, error } = await run(gemini, { signal: controller.signal });
    expect(result).toBeUndefined();
    expect(error).toMatchObject({ code: "ABORTED", stage: "report" });
  });
});
