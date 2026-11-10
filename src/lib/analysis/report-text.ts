import {
  CATEGORY_LABELS,
  CONTENT_SOURCE_LABELS,
  PRODUCT_TYPE_LABELS,
  STATUS_LABELS,
} from "./labels";
import { VERIFICATION_STATUSES, type VerificationStatus } from "./constants";
import type { AnalysisResult, Claim } from "./schema";

export const OUTCOME_LABELS: Record<AnalysisResult["outcome"], string> = {
  complete: "분석 완료",
  partial: "부분 완료 · 검색 근거 미확보",
  no_claims: "분석 완료 · 확인할 주장 없음",
};

export const LEGAL_DISCLAIMER =
  "본 서비스는 AI 기반 정보 분석 도구이며, 법적인 허위·과장광고 판정을 대신하지 않습니다.";

export function countByStatus(claims: Claim[]): Record<VerificationStatus, number> {
  const counts = Object.fromEntries(VERIFICATION_STATUSES.map((status) => [status, 0])) as Record<
    VerificationStatus,
    number
  >;
  for (const claim of claims) counts[claim.verificationStatus] += 1;
  return counts;
}

/** 보고서 맨 위에 보여 줄 한 문장 요약. 실제 판정 개수로만 만든다. */
export function buildHeadline(claims: Claim[]): string {
  const total = claims.length;
  if (total === 0) return "이 페이지에서 확인이 필요한 광고 주장을 찾지 못했습니다.";

  const counts = countByStatus(claims);
  const needsCheck = counts.needs_verification + counts.insufficient + counts.undetermined;
  const lead = `총 ${total}개의 주요 주장을 분석했으며, 이 중 `;

  if (counts.contradicted > 0 && needsCheck > 0) {
    return `${lead}${counts.contradicted}개는 연결된 자료와 일치하지 않고 ${needsCheck}개는 추가 검증이 필요합니다.`;
  }
  if (counts.contradicted > 0) {
    return `${lead}${counts.contradicted}개는 연결된 자료와 일치하지 않습니다.`;
  }
  if (needsCheck > 0) {
    return `${lead}${needsCheck}개는 추가 검증이 필요합니다.`;
  }
  return `총 ${total}개의 주요 주장을 분석했으며, 모두 뒷받침하는 근거를 확인했습니다.`;
}

export function formatAnalyzedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

/** "결과 복사하기"용 일반 텍스트 보고서 */
export function buildReportText(result: AnalysisResult): string {
  const lines: string[] = [
    "[광고살핌 분석 보고서]",
    `광고 제목: ${result.title}`,
    `분석 대상: ${result.finalUrl}`,
    `도메인: ${result.domain}`,
    `분석 일시: ${formatAnalyzedAt(result.analyzedAt)}`,
    `광고 유형: ${PRODUCT_TYPE_LABELS[result.category]}`,
    `분석 상태: ${OUTCOME_LABELS[result.outcome]}`,
    `본문 수집: ${CONTENT_SOURCE_LABELS[result.contentSource]}`,
    "",
    "■ 종합 분석 결과",
    buildHeadline(result.claims),
    result.summary,
  ];

  result.claims.forEach((claim, index) => {
    lines.push(
      "",
      `■ 주장 ${index + 1} — ${STATUS_LABELS[claim.verificationStatus]} (${CATEGORY_LABELS[claim.category]})`,
      `광고 원문: “${claim.originalText}”`,
      `문제가 될 수 있는 이유: ${claim.concern}`,
      `AI 분석: ${claim.explanation}`,
      `확인된 객관적 근거: ${claim.evidenceSummary ?? "확인된 근거 없음"}`,
    );
    const sources = result.sources.filter((source) => claim.sourceIds.includes(source.id));
    if (sources.length > 0) {
      lines.push("출처:");
      for (const source of sources) lines.push(`  - ${source.organization} · ${source.title} (${source.url})`);
    } else {
      lines.push("출처: 연결된 출처 없음");
    }
    lines.push(`추가 확인이 필요한 사항: ${claim.recommendedAction}`);
    if (claim.legalNote) lines.push(`법령 관련 유의점: ${claim.legalNote}`);
  });

  if (result.sources.length > 0) {
    lines.push("", "■ 검증 출처");
    for (const source of result.sources) {
      const date = source.publishedAt ? ` · ${source.publishedAt}` : "";
      lines.push(`- [${source.id}] ${source.organization} · ${source.title}${date}`, `  ${source.url}`);
    }
  }

  if (result.limitations.length > 0) {
    lines.push("", "■ 분석의 한계");
    for (const limitation of result.limitations) lines.push(`- ${limitation}`);
  }

  lines.push("", LEGAL_DISCLAIMER);
  return lines.filter((line, index) => !(line === "" && lines[index - 1] === "")).join("\n");
}
