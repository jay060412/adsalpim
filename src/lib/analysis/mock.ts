/**
 * 개발용 모의(Mock) 분석 모드.
 *
 * Gemini API 키 없이 진행 화면과 결과 화면을 확인하기 위한 것으로,
 * ADSALPIM_MOCK=1 이고 NODE_ENV가 production이 아닐 때만 켜진다.
 * 여기서 만드는 페이지·응답·출처는 모두 가상의 데이터이며, 결과에는 mock=true가 붙어
 * 화면에 "테스트용 모의 데이터"라고 표시된다. 실제 Gemini API는 호출하지 않는다.
 */
import type { FetchedPage } from "@/lib/security/safe-fetch";
import type { GeminiOutput, GeminiPort } from "./gemini";
import type { ClaimExtraction, ReportDraft } from "./schema";

export function isMockMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ADSALPIM_MOCK === "1" && env.NODE_ENV !== "production";
}

const MOCK_AD_HTML = `<!doctype html>
<html lang="ko">
<head><title>[모의 광고] 뷰티핏 콜라겐 젤리</title></head>
<body>
  <h1>뷰티핏 콜라겐 젤리</h1>
  <p>하루 한 포로 충분해요. 단 2주 만에 피부 나이 10년 젊어지는 변화를 경험하세요.</p>
  <p>피부과 전문의 97%가 추천한 저분자 콜라겐 성분을 담았습니다.</p>
  <p>식약처 인증 완료! 부작용이 전혀 없는 100% 천연 원료만 사용합니다.</p>
  <p>누적 판매 1위, 고객 만족도 99.8%의 이유를 직접 확인해 보세요.</p>
  <p>지금 신청하면 첫 달 무료 체험. 무료 체험 종료 후에는 정기결제로 자동 전환됩니다.</p>
  <footer><p>본 제품은 질병의 예방 및 치료를 위한 의약품이 아닙니다. 개인에 따라 차이가 있을 수 있습니다.</p></footer>
</body>
</html>`;

/** 어떤 URL을 입력해도 같은 가상 광고 페이지를 돌려준다. 네트워크 요청은 하지 않는다. */
export async function mockFetchPage(url: URL): Promise<FetchedPage> {
  await delay(900);
  return { finalUrl: url.toString(), html: MOCK_AD_HTML, contentType: "text/html", truncated: false };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extraction: ClaimExtraction = {
  pageReadable: true,
  pageTitle: "[모의 광고] 뷰티핏 콜라겐 젤리",
  productType: "food",
  hasAdContent: true,
  noContentReason: "",
  injectionSuspected: false,
  claims: [
    {
      originalText: "단 2주 만에 피부 나이 10년 젊어지는 변화를 경험하세요.",
      category: "exaggeration",
      whyCheck: "짧은 기간에 큰 효과를 약속하지만 근거가 되는 시험 결과가 제시되어 있지 않습니다.",
    },
    {
      originalText: "피부과 전문의 97%가 추천",
      category: "statistics",
      whyCheck: "조사 기관, 대상 인원, 조사 시점이 표시되어 있지 않습니다.",
    },
    {
      originalText: "식약처 인증 완료!",
      category: "authority",
      whyCheck: "무엇에 대한 어떤 인증인지 범위가 밝혀져 있지 않습니다.",
    },
    {
      originalText: "부작용이 전혀 없는 100% 천연 원료만 사용합니다.",
      category: "absolute",
      whyCheck: "부작용이 전혀 없다고 단정하는 표현입니다.",
    },
    {
      originalText: "지금 신청하면 첫 달 무료 체험.",
      category: "misleading",
      whyCheck: "무료 체험 뒤 정기결제로 자동 전환되는 조건이 함께 인식되지 않을 수 있습니다.",
    },
    {
      // 페이지에 없는 문구: 서버의 원문 대조 단계에서 걸러지는지 확인하기 위한 항목
      originalText: "미국 FDA가 승인한 유일한 콜라겐 제품",
      category: "authority",
      whyCheck: "원문에 없는 문구입니다.",
    },
  ],
};

const VERIFY_TEXT = `### C1
- 확인된 사실: (모의 데이터) 일반식품은 질병 예방·치료나 신체 기능 개선 효과를 표방하는 광고가 제한됩니다.
- 주장과의 비교: 관련 자료 없음
- 남은 의문: 2주 효과를 뒷받침하는 인체적용시험 결과가 있는지 확인이 필요합니다.

### C2
- 확인된 사실: 확인된 자료 없음
- 주장과의 비교: 관련 자료 없음

### C3
- 확인된 사실: (모의 데이터) 식품의약품안전처는 건강기능식품의 기능성 원료를 인정하며, 2024년 기준 인정 현황을 공개하고 있습니다.
- 주장과의 비교: 일부만 뒷받침함

### C4
- 확인된 사실: (모의 데이터) 한국소비자원은 건강식품 섭취 후 이상 사례가 접수되고 있다고 안내합니다.
- 주장과의 비교: 충돌함

### C5
- 확인된 사실: (모의 데이터) 공정거래위원회는 무료 체험 후 유료 전환 조건을 명확히 알리도록 안내하고 있습니다.
- 주장과의 비교: 일부만 뒷받침함

### LAW
- (모의 데이터) 「식품 등의 표시·광고에 관한 법률」은 소비자를 기만하는 표시·광고를 금지합니다.
`;

const byteIndexOf = (marker: string) =>
  Buffer.byteLength(VERIFY_TEXT.slice(0, VERIFY_TEXT.indexOf(marker)), "utf8");

const draft: ReportDraft = {
  summary:
    "(모의 데이터) 효과 기간과 추천 비율 등 구체적인 수치가 여러 번 등장하지만 근거가 함께 제시되지 않았습니다. 인증과 무료 체험 관련 표현은 범위와 조건을 직접 확인해 보시길 권합니다.",
  claims: [
    {
      id: "C1",
      verificationStatus: "insufficient",
      concern: "짧은 기간의 큰 변화를 약속하지만 이를 뒷받침할 자료가 제시되어 있지 않습니다.",
      explanation:
        "(모의 데이터) 검색에서 이 제품의 2주 효과를 입증하는 시험 결과를 찾지 못했습니다. 일반식품의 효능 표현은 범위가 제한된다는 일반 기준만 확인했습니다.",
      evidenceSummary: "(모의 데이터) 일반식품은 신체 기능 개선 효과를 표방하는 광고가 제한됩니다.",
      sourceIds: ["S1"],
      recommendedAction: "판매자에게 인체적용시험 결과 등 근거 자료를 요청해 보세요.",
      legalNote: "(모의 데이터) 식품 등의 표시·광고에 관한 법률상 확인이 필요한 표현에 해당할 소지가 있습니다.",
    },
    {
      id: "C2",
      verificationStatus: "supported",
      concern: "수치의 출처와 조사 조건이 표시되어 있지 않습니다.",
      explanation: "(모의 데이터) 출처 없이 '근거 확인'으로 응답한 경우 서버가 판정을 낮추는지 확인하기 위한 항목입니다.",
      evidenceSummary: "",
      sourceIds: ["S99"],
      recommendedAction: "조사 기관과 조사 대상, 시점을 판매자에게 문의해 보세요.",
      legalNote: "",
    },
    {
      id: "C3",
      verificationStatus: "needs_verification",
      concern: "어떤 인증인지 범위가 불분명합니다.",
      explanation:
        "(모의 데이터) 원료의 기능성 인정과 제품 자체의 인증은 서로 다릅니다. 이 제품이 어떤 인증을 받았는지는 확인되지 않았습니다.",
      evidenceSummary: "(모의 데이터) 식품의약품안전처는 기능성 원료 인정 현황을 공개하고 있습니다.",
      sourceIds: ["S1"],
      recommendedAction: "식품안전나라에서 제품명으로 건강기능식품 신고 여부를 조회해 보세요.",
      legalNote: "",
    },
    {
      id: "C4",
      verificationStatus: "contradicted",
      concern: "부작용이 전혀 없다고 단정합니다.",
      explanation: "(모의 데이터) 건강식품 섭취 후 이상 사례가 접수된다는 안내와 맞지 않습니다.",
      evidenceSummary: "(모의 데이터) 한국소비자원은 건강식품 섭취 후 이상 사례가 접수되고 있다고 안내합니다.",
      sourceIds: ["S2"],
      recommendedAction: "원재료와 알레르기 유발 성분 표시를 확인해 보세요.",
      legalNote: "",
    },
    {
      id: "C5",
      verificationStatus: "needs_verification",
      concern: "무료 체험 뒤 자동 결제 조건이 눈에 잘 띄지 않을 수 있습니다.",
      explanation: "(모의 데이터) 페이지 하단에 자동 전환 조건이 있으나 무료 문구와 떨어져 있습니다.",
      evidenceSummary: "(모의 데이터) 공정거래위원회는 유료 전환 조건을 명확히 알리도록 안내합니다.",
      sourceIds: ["S3"],
      recommendedAction: "결제 전 정기결제 금액과 해지 방법을 확인해 보세요.",
      legalNote: "",
    },
  ],
  relevantLaws: [
    { name: "식품 등의 표시·광고에 관한 법률", note: "(모의 데이터) 소비자를 기만하는 표시·광고 금지" },
  ],
  sourceDates: [{ sourceId: "S1", publishedAt: "2024" }],
  limitations: ["(모의 데이터) 실제 검색과 AI 분석은 수행되지 않았습니다."],
};

const json = (value: unknown): GeminiOutput => {
  const text = JSON.stringify(value);
  return { status: "completed", text, blocks: [{ text, citations: [] }], urlContext: [], searchQueries: [] };
};

/** 요청 종류에 맞는 고정 응답을 약간의 지연과 함께 돌려주는 가짜 Gemini */
export function createMockGeminiPort(): GeminiPort {
  return {
    model: "mock (모의 데이터)",
    async generate(request) {
      await delay(1500);

      if (request.tools?.some((tool) => tool.type === "google_search")) {
        return {
          status: "completed",
          text: VERIFY_TEXT,
          blocks: [
            {
              text: VERIFY_TEXT,
              citations: [
                { url: "https://www.mfds.go.kr/", title: "[모의 출처] 식품의약품안전처", startIndex: byteIndexOf("(모의 데이터) 식품의약품안전처는") },
                { url: "https://www.mfds.go.kr/", title: "[모의 출처] 식품의약품안전처", startIndex: byteIndexOf("(모의 데이터) 일반식품은") },
                { url: "https://www.kca.go.kr/", title: "[모의 출처] 한국소비자원", startIndex: byteIndexOf("(모의 데이터) 한국소비자원은") },
                { url: "https://www.ftc.go.kr/", title: "[모의 출처] 공정거래위원회", startIndex: byteIndexOf("(모의 데이터) 공정거래위원회는") },
                { url: "https://www.law.go.kr/", title: "[모의 출처] 국가법령정보센터", startIndex: byteIndexOf("(모의 데이터) 「식품 등의") },
              ],
            },
          ],
          urlContext: [],
          searchQueries: ["(모의) 식약처 콜라겐 기능성 인정", "(모의) 무료 체험 자동결제 공정위"],
        };
      }

      const isClaimsRequest = JSON.stringify(request.jsonSchema ?? {}).includes("pageReadable");
      if (isClaimsRequest) {
        const regions = [
          { x: 5, y: 85, width: 730, height: 28 },
          { x: 5, y: 125, width: 450, height: 28 },
          { x: 5, y: 163, width: 120, height: 28 },
          { x: 130, y: 163, width: 570, height: 28 },
          { x: 5, y: 238, width: 720, height: 28 },
        ];
        const response = request.images?.length ? {
          ...extraction,
          claims: extraction.claims.map((claim, index) => ({ ...claim, sourceType: "text", visualRegion: regions[index] ? { frameId: "V1", ...regions[index] } : null })),
        } : extraction;
        return {
          ...json(response),
          urlContext: request.tools?.length ? [{ url: "mock", status: "success" }] : [],
        };
      }
      return json(draft);
    },
  };
}
