import type { GroundedSource } from "./grounding";
import type {
  AnalysisResult,
  Claim,
  ClaimCategory,
  ProductType,
  ReportDraft,
  Source,
  VerificationStatus,
} from "./schema";
import type { QuotePosition } from "./quote";
import type { PageVisual, VisualRegion } from "./visual-schema";

/** 3단계에서 확정된(원문 대조를 마친) 주장 */
export interface ExtractedClaim {
  id: string;
  originalText: string;
  category: ClaimCategory;
  whyCheck: string;
  quoteVerified: boolean;
  position: QuotePosition | null;
  sourceType?: "text" | "image";
  visualRegion?: VisualRegion | null;
}

export interface FinalizeInput {
  url: string;
  finalUrl: string;
  title: string;
  domain: string;
  productType: ProductType;
  analyzedAt: Date;
  contentSource: AnalysisResult["contentSource"];
  model: string;
  mock: boolean;
  pageText: string | null;
  pageTextTruncated: boolean;
  claims: ExtractedClaim[];
  /** 실제 검색 결과에서 나온 출처 */
  sources: GroundedSource[];
  searchQueries: string[];
  draft: ReportDraft;
  /** 서버가 파악한 분석 한계 */
  limitations: string[];
  visual?: PageVisual | null;
}

const MAX_TEXT = 1_200;
const NEEDS_SOURCE: ReadonlySet<VerificationStatus> = new Set(["supported", "contradicted"]);

function clean(value: string, max = MAX_TEXT): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * 모델이 작성한 보고서 초안을 서버가 가진 사실(추출된 주장, 실제 검색 출처)과 대조해
 * 최종 결과로 확정한다. 모델의 출력은 여기서 통과한 것만 사용자에게 전달된다.
 */
export function finalizeReport(input: FinalizeInput): AnalysisResult {
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const draftById = new Map(input.draft.claims.map((claim) => [claim.id.trim().toUpperCase(), claim]));
  const claimLinks = new Map<string, Set<string>>(
    input.sources.map((source) => [source.id, new Set(source.claimIds)]),
  );

  let downgraded = 0;
  let missing = 0;

  const claims: Claim[] = input.claims.map((claim) => {
    const draft = draftById.get(claim.id);
    if (!draft) {
      missing += 1;
      return {
        id: claim.id,
        originalText: claim.originalText,
        category: claim.category,
        verificationStatus: "undetermined",
        concern: clean(claim.whyCheck),
        explanation: "이 주장에 대한 검증 결과를 정리하지 못했습니다.",
        evidenceSummary: null,
        sourceIds: [],
        recommendedAction: "판매자에게 이 주장의 근거 자료를 요청해 직접 확인해 보세요.",
        legalNote: null,
        quoteVerified: claim.quoteVerified,
        position: claim.position,
        sourceType: claim.sourceType,
        visualRegion: claim.visualRegion,
      };
    }

    // 출처 연결: 검색 응답의 인용 위치로 확인된 출처를 우선하고,
    // 없을 때만 모델이 고른 ID 중 실제 검색 출처에 있는 것을 쓴다.
    const cited = input.sources
      .filter((source) => source.claimIds.includes(claim.id))
      .map((source) => source.id);
    const proposed = [...new Set(draft.sourceIds.map((id) => id.trim().toUpperCase()))].filter(
      (id) => sourceById.has(id),
    );
    const overlap = proposed.filter((id) => cited.includes(id));
    const sourceIds = overlap.length ? overlap : cited.length ? cited : proposed;
    for (const id of sourceIds) claimLinks.get(id)?.add(claim.id);

    let status = draft.verificationStatus;
    if (NEEDS_SOURCE.has(status) && sourceIds.length === 0) {
      // 출처 없이 "확인됨"이나 "불일치"로 표시하지 않는다.
      status = status === "supported" ? "insufficient" : "needs_verification";
      downgraded += 1;
    }

    const evidence = clean(draft.evidenceSummary);
    const legalNote = clean(draft.legalNote);

    return {
      id: claim.id,
      originalText: claim.originalText,
      category: claim.category,
      verificationStatus: status,
      concern: clean(draft.concern) || clean(claim.whyCheck),
      explanation: clean(draft.explanation),
      evidenceSummary: evidence || null,
      sourceIds,
      recommendedAction: clean(draft.recommendedAction),
      legalNote: legalNote || null,
      quoteVerified: claim.quoteVerified,
      position: claim.position,
      sourceType: claim.sourceType,
      visualRegion: claim.visualRegion,
    };
  });

  const claimOrder = new Map(input.claims.map((claim, index) => [claim.id, index]));
  const sources: Source[] = input.sources.map((source) => ({
    id: source.id,
    title: clean(source.title, 200),
    organization: clean(source.organization, 80),
    url: source.url,
    domain: source.domain,
    // 현재 인용 메타데이터에는 발행일이 없다. 모델이 제안한 날짜나 본문 속 연도를
    // 해당 출처의 발행일로 간주하지 않는다. 출처별 원문 메타데이터 확보 전에는 생략한다.
    publishedAt: null,
    isOfficial: source.isOfficial,
    claimIds: [...(claimLinks.get(source.id) ?? [])]
      .filter((id) => claimOrder.has(id))
      .sort((a, b) => (claimOrder.get(a) ?? 0) - (claimOrder.get(b) ?? 0)),
  }));

  const limitations = [...input.limitations];
  if (sources.length === 0) {
    limitations.push(
      "Google 검색에서 인용할 수 있는 출처를 확보하지 못해 '근거 확인'과 '사실 불일치' 판정은 내리지 않았습니다.",
    );
  }
  if (downgraded > 0) {
    limitations.push(
      `출처가 연결되지 않은 판정 ${downgraded}건은 한 단계 보수적으로 조정해 표시했습니다.`,
    );
  }
  if (missing > 0) {
    limitations.push(`주장 ${missing}건은 검증 결과가 정리되지 않아 '판단 불가'로 표시했습니다.`);
  }
  for (const item of input.draft.limitations.slice(0, 3)) {
    const text = clean(item, 300);
    if (text && !limitations.includes(text)) limitations.push(text);
  }

  return {
    url: input.url,
    finalUrl: input.finalUrl,
    title: clean(input.title, 200) || input.domain,
    domain: input.domain,
    category: input.productType,
    analyzedAt: input.analyzedAt.toISOString(),
    outcome: sources.length > 0 ? "complete" : "partial",
    contentSource: input.contentSource,
    summary: clean(input.draft.summary),
    claims,
    sources,
    relevantLaws: input.draft.relevantLaws
      .map((law) => ({ name: clean(law.name, 120), note: clean(law.note, 400) }))
      .filter((law) => law.name),
    searchQueries: input.searchQueries.slice(0, 12).map((query) => clean(query, 120)),
    limitations,
    pageText: input.pageText,
    pageTextTruncated: input.pageTextTruncated,
    visual: input.visual,
    model: input.model,
    mock: input.mock,
  };
}
