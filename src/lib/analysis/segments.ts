import type { Claim } from "./schema";

export type TextSegment =
  | { kind: "text"; text: string }
  | { kind: "claim"; text: string; claim: Claim };

/**
 * 원문을 일반 텍스트와 하이라이트 구간으로 나눈다.
 * 위치가 잘못됐거나 서로 겹치는 구간은 건너뛰어, 원문 글자가 빠지거나 중복되지 않게 한다.
 */
export function buildSegments(text: string, claims: Claim[]): TextSegment[] {
  const marked = claims
    .filter((claim) => claim.position)
    .sort((a, b) => a.position!.start - b.position!.start);

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const claim of marked) {
    const { start, end } = claim.position!;
    if (start < cursor || end <= start || end > text.length) continue;
    if (start > cursor) segments.push({ kind: "text", text: text.slice(cursor, start) });
    segments.push({ kind: "claim", text: text.slice(start, end), claim });
    cursor = end;
  }

  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments;
}
