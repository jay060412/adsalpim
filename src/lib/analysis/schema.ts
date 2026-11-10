import { z } from "zod";
import { PageVisualSchema, VisualRegionSchema } from "./visual-schema";

import {
  CLAIM_CATEGORIES,
  MAX_CLAIMS,
  PRODUCT_TYPES,
  VERIFICATION_STATUSES,
} from "./constants";

export * from "./constants";

/* ------------------------------------------------------------------ */
/* Gemini가 반환해야 하는 구조 (서버에서 Zod로 다시 검증한다)            */
/* ------------------------------------------------------------------ */

/** 3단계: 광고 핵심 주장 추출 결과 */
export const ClaimExtractionSchema = z.object({
  pageReadable: z
    .boolean()
    .describe("광고 페이지 본문을 실제로 읽을 수 있었는지 여부"),
  pageTitle: z
    .string()
    .describe("페이지에 실제로 표시된 제목 또는 상품명. 알 수 없으면 빈 문자열"),
  productType: z.enum(PRODUCT_TYPES).describe("광고 대상의 업종 분류"),
  hasAdContent: z
    .boolean()
    .describe("상품·서비스를 홍보하는 광고성 내용이 있는지 여부"),
  noContentReason: z
    .string()
    .describe("분석할 주장을 찾지 못했다면 그 이유. 해당 없으면 빈 문자열"),
  injectionSuspected: z
    .boolean()
    .describe("페이지 안에 AI에게 지시하려는 문구가 포함되어 있었는지 여부"),
  claims: z
    .array(
      z.object({
        originalText: z
          .string()
          .describe("페이지에서 글자 그대로 옮긴 광고 문구. 요약·의역·번역 금지"),
        category: z.enum(CLAIM_CATEGORIES),
        whyCheck: z
          .string()
          .describe("소비자가 이 문구를 확인해 봐야 하는 이유 (1~2문장)"),
      }),
    )
    .max(MAX_CLAIMS),
});
export type ClaimExtraction = z.infer<typeof ClaimExtractionSchema>;

/** Multimodal extraction is separate so text-only responses remain compatible. */
export const VisualClaimExtractionSchema = ClaimExtractionSchema.extend({
  claims: z.array(ClaimExtractionSchema.shape.claims.element.extend({
    sourceType: z.enum(["text", "image"]),
    visualRegion: VisualRegionSchema.nullable().describe("문구가 보이는 캡처 영역. 위치를 확인할 수 없으면 null"),
  })).max(MAX_CLAIMS),
});
export type VisualClaimExtraction = z.infer<typeof VisualClaimExtractionSchema>;

/** 5단계: 검증 내용을 구조화한 보고서 초안 */
export const ReportDraftSchema = z.object({
  summary: z.string().describe("전체 분석을 2~3문장으로 요약"),
  claims: z.array(
    z.object({
      id: z.string().describe("주장 ID (예: C1)"),
      verificationStatus: z.enum(VERIFICATION_STATUSES),
      concern: z.string().describe("문제가 될 수 있는 이유"),
      explanation: z.string().describe("AI 분석 설명"),
      evidenceSummary: z
        .string()
        .describe("검색으로 확인된 객관적 근거. 없으면 빈 문자열"),
      sourceIds: z.array(z.string()).describe("이 주장과 관련된 출처 ID 목록"),
      recommendedAction: z.string().describe("소비자가 추가로 확인할 사항"),
      legalNote: z
        .string()
        .describe("관련 법령상 유의점. 위반 여부를 단정하지 않는다. 없으면 빈 문자열"),
    }),
  ),
  relevantLaws: z
    .array(
      z.object({
        name: z.string().describe("법령명"),
        note: z.string().describe("이 광고와 관련되는 이유"),
      }),
    )
    .max(5),
  sourceDates: z
    .array(
      z.object({
        sourceId: z.string(),
        publishedAt: z
          .string()
          .describe("검증 내용에 명시된 발행일 (YYYY, YYYY-MM 또는 YYYY-MM-DD)"),
      }),
    )
    .describe("검증 내용에 발행일이 명시된 출처만 포함"),
  limitations: z.array(z.string()).max(5).describe("이번 분석의 한계"),
});
export type ReportDraft = z.infer<typeof ReportDraftSchema>;

/* ------------------------------------------------------------------ */
/* 클라이언트로 전달되는 최종 결과                                       */
/* ------------------------------------------------------------------ */

export const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  organization: z.string(),
  url: z.string(),
  domain: z.string(),
  publishedAt: z.string().nullable(),
  /** 정부·공공기관 등 공신력 있는 기관 자료인지 */
  isOfficial: z.boolean(),
  /** 이 출처가 인용된 주장 ID */
  claimIds: z.array(z.string()),
});
export type Source = z.infer<typeof SourceSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  originalText: z.string(),
  category: z.enum(CLAIM_CATEGORIES),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  concern: z.string(),
  explanation: z.string(),
  evidenceSummary: z.string().nullable(),
  sourceIds: z.array(z.string()),
  recommendedAction: z.string(),
  legalNote: z.string().nullable(),
  /** 서버가 수집한 원문에서 이 문구를 찾았는지 */
  quoteVerified: z.boolean(),
  /** pageText 안에서의 위치 (하이라이트용) */
  position: z.object({ start: z.number(), end: z.number() }).nullable(),
  sourceType: z.enum(["text", "image"]).optional(),
  visualRegion: VisualRegionSchema.nullable().optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const AnalysisResultSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  title: z.string(),
  domain: z.string(),
  category: z.enum(PRODUCT_TYPES),
  analyzedAt: z.string(),
  /** complete: 검색 근거까지 확인 / partial: 검색 근거 없이 완료 / no_claims: 분석할 주장 없음 */
  outcome: z.enum(["complete", "partial", "no_claims"]),
  /** 광고 본문을 읽은 경로 */
  contentSource: z.enum(["direct", "url_context", "both"]),
  summary: z.string(),
  claims: z.array(ClaimSchema),
  sources: z.array(SourceSchema),
  relevantLaws: z.array(z.object({ name: z.string(), note: z.string() })),
  searchQueries: z.array(z.string()),
  limitations: z.array(z.string()),
  pageText: z.string().nullable(),
  pageTextTruncated: z.boolean(),
  visual: PageVisualSchema.nullable().optional(),
  model: z.string(),
  /** 개발용 모의 분석 모드에서 만든 결과인지. true면 실제 Gemini 분석 결과가 아니다. */
  mock: z.boolean(),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/** Gemini response_format에 넣을 JSON Schema로 변환한다. */
export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
