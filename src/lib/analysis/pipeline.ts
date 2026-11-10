import { randomBytes } from "node:crypto";
import { extractPage } from "@/lib/extract/html";
import { fetchPublicPage, type FetchedPage } from "@/lib/security/safe-fetch";
import { assertPublicHost, parsePublicHttpUrl } from "@/lib/security/ssrf";
import { AnalysisError, type ErrorCode } from "./errors";
import type { AnalyzeEvent, StageId } from "./events";
import { finalizeReport, type ExtractedClaim } from "./finalize";
import { generateJson, type GeminiOutput, type GeminiPort } from "./gemini";
import { buildSources, parseVerification, type RedirectResolver } from "./grounding";
import {
  claimsInput,
  claimsSystemPrompt,
  reportInput,
  reportSystemPrompt,
  verifyInput,
  verifySystemPrompt,
} from "./prompts";
import { locateQuote, normalizeForMatch } from "./quote";
import {
  AnalysisResultSchema,
  ClaimExtractionSchema,
  MAX_CLAIMS,
  ReportDraftSchema,
  type AnalysisResult,
  type ClaimExtraction,
  VisualClaimExtractionSchema,
  type VisualClaimExtraction,
} from "./schema";
import { validVisualRegion, type PageVisual } from "./visual-schema";

/** 직접 수집한 본문이 이보다 짧으면 "본문 없음"으로 보고 URL Context에 맡긴다 */
const MIN_DIRECT_TEXT_CHARS = 120;

/**
 * 서버 직접 수집이 이 사유로 실패했을 때만 Gemini URL Context로 다시 읽어 본다.
 * 존재하지 않는 페이지, 차단된 주소 등 결과가 달라질 수 없는 실패는 즉시 중단한다.
 */
const URL_CONTEXT_FALLBACK_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "PAGE_FORBIDDEN",
  "PAGE_UNREACHABLE",
  "PAGE_TIMEOUT",
  "PAGE_TOO_LARGE",
  "UNSUPPORTED_CONTENT",
  "NO_CONTENT",
]);

/** URL Context를 붙인 요청이 이 사유로 실패하면, 직접 수집한 본문만으로 한 번 더 시도한다 */
const RETRY_WITHOUT_URL_CONTEXT: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "AI_BAD_REQUEST",
  "AI_BAD_RESPONSE",
  "AI_BLOCKED",
]);

export type PageReader = "url-context" | "direct";

export interface PipelineDeps {
  gemini: GeminiPort;
  /**
   * url-context: Gemini URL Context로 페이지를 읽고, 서버 수집 본문으로 인용문을 대조한다 (기본값).
   * direct: 서버 수집 본문만 사용하고, 수집에 실패했을 때만 URL Context를 쓴다.
   */
  pageReader?: PageReader;
  signal?: AbortSignal;
  fetchPage?: (url: URL, options: { signal?: AbortSignal }) => Promise<FetchedPage>;
  checkHost?: (url: URL) => Promise<void>;
  resolveRedirect?: RedirectResolver;
  now?: () => Date;
  /** 개발용 모의 분석 모드 여부. 결과에 그대로 표시된다. */
  mock?: boolean;
  capturePage?: (page: FetchedPage, options: { signal?: AbortSignal; onQueued?: () => void }) => Promise<PageVisual>;
}

interface DirectPage {
  title: string;
  text: string;
  truncated: boolean;
}

function urlContextStatus(output: GeminiOutput): "success" | "paywall" | "unsafe" | "failed" {
  const statuses = output.urlContext.map((entry) => entry.status.toLowerCase());
  if (statuses.some((status) => status.includes("success"))) return "success";
  if (statuses.some((status) => status.includes("paywall"))) return "paywall";
  if (statuses.some((status) => status.includes("unsafe"))) return "unsafe";
  return "failed";
}

/** 운영 환경의 로그에는 오류 종류만 남긴다. 입력 URL이나 광고 내용이 로그에 섞이지 않게 하기 위해서다. */
function logUnexpected(err: unknown): void {
  if (process.env.NODE_ENV === "production") {
    console.error("[analyze] unexpected error:", err instanceof Error ? err.name : typeof err);
  } else {
    console.error("[analyze] unexpected error", err);
  }
}

/**
 * 광고 URL 하나를 분석한다. 진행 상황과 결과는 모두 emit으로 내보낸다.
 * 각 단계 이벤트는 해당 작업이 실제로 시작되고 끝난 시점에만 발생한다.
 */
export async function runAnalysis(
  rawUrl: string,
  deps: PipelineDeps,
  emit: (event: AnalyzeEvent) => void,
): Promise<void> {
  const { gemini, signal } = deps;
  const fetchPage = deps.fetchPage ?? fetchPublicPage;
  const checkHost = deps.checkHost ?? ((url: URL) => assertPublicHost(url));
  const pageReader = deps.pageReader ?? "url-context";
  const now = deps.now ?? (() => new Date());

  let stage: StageId = "validate";
  const begin = (next: StageId, detail?: string) => {
    if (signal?.aborted) throw new AnalysisError("ABORTED");
    stage = next;
    emit({ type: "stage", stage: next, status: "active", detail });
  };
  const done = (id: StageId, detail?: string) =>
    emit({ type: "stage", stage: id, status: "done", detail });
  const skip = (id: StageId, detail: string) =>
    emit({ type: "stage", stage: id, status: "skipped", detail });

  try {
    /* 1. 링크 확인 ---------------------------------------------------- */
    begin("validate");
    const url = parsePublicHttpUrl(rawUrl);
    await checkHost(url);
    const domain = url.hostname.replace(/^www\./, "");
    done("validate", `${domain} 주소를 확인했어요.`);

    /* 2. 광고 내용 수집 ------------------------------------------------ */
    begin("collect");
    let direct: DirectPage | null = null;
    let directFailure: AnalysisError | null = null;
    let finalUrl = url.toString();
    let collectedTitle = "";
    let visual: PageVisual | null = null;
    let captureFailed = false;

    try {
      const page = await fetchPage(url, { signal });
      const extracted = extractPage(page.html);
      finalUrl = page.finalUrl;
      collectedTitle = extracted.title;
      if (deps.capturePage) {
        emit({ type: "stage", stage: "collect", status: "active", detail: "광고 화면과 이미지 문구를 읽기 위해 화면을 캡처하고 있어요." });
        try {
          visual = await deps.capturePage(page, { signal, onQueued: () => emit({ type: "stage", stage: "collect", status: "active", detail: "다른 광고 화면을 처리하고 있어요. 차례가 되면 이미지도 함께 분석해요." }) });
        } catch (error) {
          if (signal?.aborted) throw new AnalysisError("ABORTED");
          if (error instanceof AnalysisError && error.code === "SERVER_BUSY") throw error;
          captureFailed = true;
          emit({ type: "stage", stage: "collect", status: "active", detail: "광고 화면을 가져오지 못해 텍스트로만 분석하고 있어요. 이번 결과에는 이미지 문구가 포함되지 않아요." });
        }
      }
      if (extracted.text.length >= MIN_DIRECT_TEXT_CHARS) {
        direct = {
          title: extracted.title,
          text: extracted.text,
          truncated: extracted.truncated || page.truncated,
        };
      } else {
        directFailure = new AnalysisError("NO_CONTENT");
      }
    } catch (err) {
      const error =
        err instanceof AnalysisError ? err : new AnalysisError("PAGE_UNREACHABLE", { cause: err });
      if (!URL_CONTEXT_FALLBACK_CODES.has(error.code)) throw error;
      directFailure = error;
    }

    const useUrlContext = !visual && (!direct || pageReader === "url-context");
    if (direct || visual) {
      done("collect", visual ? `광고 화면 ${visual.frames.length}장을 수집했어요. 이미지 속 글자도 함께 분석해요.` : `본문 ${direct!.text.length.toLocaleString("ko-KR")}자를 수집했어요.`);
    } else {
      emit({
        type: "stage",
        stage: "collect",
        status: "active",
        detail: "서버에서 본문을 직접 읽지 못해 Gemini URL Context로 읽고 있어요.",
      });
    }

    /* 3. AI 핵심 주장 분석 --------------------------------------------- */
    if (direct || visual) begin("claims");
    const nonce = randomBytes(8).toString("hex");
    const claimsRequest = (withUrlContext: boolean) =>
      generateJson(
        gemini,
        {
          system: claimsSystemPrompt(),
          input: claimsInput({
            url: finalUrl,
            pageText: direct?.text ?? null,
            pageTitle: direct?.title ?? "",
            useUrlContext: withUrlContext,
            nonce,
            visual: Boolean(visual),
          }),
          images: visual?.frames.map((frame) => ({ label: frame.id, data: frame.image.split(",")[1], mimeType: "image/jpeg" as const })),
          tools: withUrlContext ? [{ type: "url_context" }] : undefined,
          timeoutMs: 90_000,
          signal,
        },
        visual ? VisualClaimExtractionSchema : ClaimExtractionSchema,
      );

    let extraction: ClaimExtraction;
    let urlContext: ReturnType<typeof urlContextStatus> = "failed";
    try {
      const response = await claimsRequest(useUrlContext);
      extraction = response.data;
      if (useUrlContext) urlContext = urlContextStatus(response.output);
    } catch (err) {
      const canRetry =
        useUrlContext &&
        direct &&
        err instanceof AnalysisError &&
        RETRY_WITHOUT_URL_CONTEXT.has(err.code);
      if (!canRetry) throw err;
      extraction = (await claimsRequest(false)).data;
    }

    if (!direct && visual && !extraction.pageReadable) throw new AnalysisError("NO_CONTENT");

    if (!direct && !visual) {
      // 서버도 Gemini도 페이지를 읽지 못했다면, 모델이 무엇을 돌려줬든 사용하지 않는다.
      if (urlContext !== "success" || !extraction.pageReadable) {
        if (urlContext === "paywall") throw new AnalysisError("PAGE_FORBIDDEN");
        if (urlContext === "unsafe") {
          throw new AnalysisError("BLOCKED_URL", {
            userMessage: "안전하지 않은 페이지로 분류되어 분석할 수 없어요.",
          });
        }
        throw directFailure ?? new AnalysisError("NO_CONTENT");
      }
      done("collect", "Gemini URL Context로 페이지를 읽었어요.");
      begin("claims");
    }

    const limitations: string[] = [];
    const pageIndex = direct ? normalizeForMatch(direct.text) : null;
    const claims: ExtractedClaim[] = [];
    const seen = new Set<string>();
    let unmatched = 0;

    for (const candidate of extraction.claims) {
      if (claims.length >= MAX_CLAIMS) break;
      const text = candidate.originalText.replace(/\s+/g, " ").trim().slice(0, 400);
      const key = normalizeForMatch(text).norm;
      if (key.length < 4 || seen.has(key)) continue;

      let position: ExtractedClaim["position"] = null;
      const visualCandidate = candidate as Partial<VisualClaimExtraction["claims"][number]>;
      const visualRegion = validVisualRegion(visualCandidate.visualRegion, visual);
      if (direct && pageIndex) {
        // 수집한 원문에 없는 문구는 광고 문구로 인정하지 않는다.
        position = locateQuote(direct.text, pageIndex, text);
        if (!position && !visualRegion) {
          unmatched += 1;
          continue;
        }
      }
      // A screenshot-only claim needs an actual bounded region, not just model text.
      if (visual && !position && !visualRegion) { unmatched += 1; continue; }

      seen.add(key);
      claims.push({
        id: `C${claims.length + 1}`,
        originalText:
          direct && position
            ? direct.text.slice(position.start, position.end).replace(/\s+/g, " ").trim()
            : text,
        category: candidate.category,
        whyCheck: candidate.whyCheck,
        quoteVerified: Boolean(position),
        position,
        sourceType: visualRegion && visualCandidate.sourceType === "image" ? "image" : position ? "text" : visualRegion ? "image" : "text",
        visualRegion,
      });
    }

    if (direct?.truncated) {
      limitations.push("페이지 본문이 길어 앞부분만 분석했습니다. 뒷부분의 문구는 포함되지 않았을 수 있습니다.");
    }
    if (unmatched > 0) {
      limitations.push(
        `AI가 제시한 문구 중 수집한 원문에서 확인되지 않은 ${unmatched}건은 결과에서 제외했습니다.`,
      );
    }
    if (!direct && !visual) {
      limitations.push(
        "서버가 원문을 직접 수집하지 못해 Gemini URL Context가 읽은 내용을 기준으로 분석했습니다. 인용 문구를 원문과 대조하지 못했습니다.",
      );
    }
    if (extraction.injectionSuspected) {
      limitations.push("페이지 안에서 AI에게 지시하려는 문구가 감지되어 이를 무시하고 분석했습니다.");
    }
    if (visual) {
      limitations.push("광고 화면에서 읽은 이미지 문구와 표시 위치는 AI가 인식한 결과이므로 오독이나 위치 오차가 있을 수 있습니다.");
      limitations.push("공개 HTML과 이미지로 만든 분석 당시 화면입니다. 스크립트 실행·로그인·펼치기 후 나타나는 내용과 동영상은 포함되지 않습니다.");
      if (visual.truncated) limitations.push("페이지가 길어 캡처한 앞부분만 이미지 분석에 포함했습니다. 아래쪽 화면은 누락될 수 있습니다.");
    } else {
      limitations.push(captureFailed ? "화면 캡처를 준비하지 못해 텍스트로만 분석했습니다. 이미지 문구와 화면 하이라이트는 제공하지 못했습니다." : "화면을 확보하지 못해 이미지 속 글자와 동영상은 분석에 포함되지 않았습니다.");
    }

    const contentSource: AnalysisResult["contentSource"] = !direct && !visual
      ? "url_context"
      : urlContext === "success"
        ? "both"
        : "direct";
    const title = collectedTitle || extraction.pageTitle || domain;

    done(
      "claims",
      claims.length > 0
        ? `확인이 필요한 주장 ${claims.length}개를 찾았어요.`
        : "확인이 필요한 주장을 찾지 못했어요.",
    );

    if (claims.length === 0) {
      skip("verify", "검증할 주장이 없어 건너뛰었어요.");
      skip("report", "검증할 주장이 없어 건너뛰었어요.");
      const reason = extraction.noContentReason.replace(/\s+/g, " ").trim().slice(0, 400);
      const result: AnalysisResult = {
        url: url.toString(),
        finalUrl,
        title,
        domain,
        category: extraction.productType,
        analyzedAt: now().toISOString(),
        outcome: "no_claims",
        contentSource,
        summary:
          unmatched > 0
            ? "AI가 제시한 문구를 수집한 원문에서 확인하지 못해 분석 결과에서 제외했습니다."
            : reason || "이 페이지에서 확인이 필요한 광고 주장을 찾지 못했습니다.",
        claims: [],
        sources: [],
        relevantLaws: [],
        searchQueries: [],
        limitations,
        pageText: direct?.text ?? null,
        pageTextTruncated: direct?.truncated ?? false,
        visual,
        model: gemini.model,
        mock: deps.mock ?? false,
      };
      emit({ type: "result", result: AnalysisResultSchema.parse(result) });
      return;
    }

    /* 4. 검증 자료 검색 ------------------------------------------------ */
    begin("verify");
    const search = await gemini.generate({
      system: verifySystemPrompt(),
      input: verifyInput({ url: finalUrl, productType: extraction.productType, claims, nonce }),
      tools: [{ type: "google_search" }],
      timeoutMs: 120_000,
      signal,
    });
    const verification = parseVerification(search.blocks);
    // 출처는 검색 도구가 돌려준 인용에서만 만든다. 모델이 본문에 적은 URL은 쓰지 않는다.
    const sources = await buildSources(verification.citations, deps.resolveRedirect);
    const officialCount = sources.filter((source) => source.isOfficial).length;
    done(
      "verify",
      sources.length > 0
        ? `출처 ${sources.length}건을 확인했어요${officialCount ? ` (공공기관 자료 ${officialCount}건)` : ""}.`
        : "인용할 수 있는 검색 출처를 찾지 못했어요.",
    );

    /* 5. 분석 보고서 생성 ---------------------------------------------- */
    begin("report");
    const { data: draft } = await generateJson(
      gemini,
      {
        system: reportSystemPrompt(),
        input: reportInput({
          productType: extraction.productType,
          claims,
          sections: verification.sections,
          fallbackText: verification.text.slice(0, 12_000),
          sources,
          nonce,
        }),
        timeoutMs: 90_000,
        signal,
      },
      ReportDraftSchema,
    );

    const result = finalizeReport({
      url: url.toString(),
      finalUrl,
      title,
      domain,
      productType: extraction.productType,
      analyzedAt: now(),
      contentSource,
      model: gemini.model,
      mock: deps.mock ?? false,
      pageText: direct?.text ?? null,
      pageTextTruncated: direct?.truncated ?? false,
      visual,
      claims,
      sources,
      searchQueries: search.searchQueries,
      draft,
      limitations,
    });

    done("report");
    emit({ type: "result", result: AnalysisResultSchema.parse(result) });
  } catch (err) {
    const error =
      err instanceof AnalysisError
        ? err
        : new AnalysisError(signal?.aborted ? "ABORTED" : "INTERNAL", { cause: err });
    if (error.code === "INTERNAL") logUnexpected(err);
    emit({
      type: "error",
      stage: error.stage ?? stage,
      code: error.code,
      message: error.userMessage,
      retryable: error.retryable,
    });
  }
}
