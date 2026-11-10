/**
 * AI가 "광고 원문"이라고 돌려준 문구가 실제 수집한 본문에 있는지 대조한다.
 * 공백·따옴표·전각/반각 차이는 무시하되, 글자 자체가 다르면 일치로 보지 않는다.
 */

const IGNORED = /[\s ​-‍﻿"'`“”‘’«»「」『』]/u;

export interface NormalizedText {
  /** 비교용으로 정규화한 문자열 */
  norm: string;
  /** norm의 i번째 글자가 원문의 몇 번째 인덱스에서 왔는지 */
  map: number[];
  /** 원문 길이 */
  length: number;
}

export function normalizeForMatch(text: string): NormalizedText {
  let norm = "";
  const map: number[] = [];
  let index = 0;

  for (const char of text) {
    const folded = char.normalize("NFKC").toLowerCase();
    for (const unit of folded) {
      if (!IGNORED.test(unit)) {
        norm += unit;
        // 정규화로 글자가 늘어나도(예: ㈜ → (주)) 모두 같은 원문 위치를 가리킨다.
        for (let i = 0; i < unit.length; i++) map.push(index);
      }
    }
    index += char.length;
  }

  return { norm, map, length: text.length };
}

export interface QuotePosition {
  start: number;
  end: number;
}

const MIN_FRAGMENT_CHARS = 10;

function findRange(page: NormalizedText, needle: string, original: string): QuotePosition | null {
  if (!needle) return null;
  const at = page.norm.indexOf(needle);
  if (at === -1) return null;

  const start = page.map[at];
  const lastIndex = page.map[at + needle.length - 1];
  // 마지막 글자가 서로게이트 쌍이면 두 단위를 모두 포함한다.
  const lastCodePoint = original.codePointAt(lastIndex) ?? 0;
  const end = lastIndex + (lastCodePoint > 0xffff ? 2 : 1);
  return { start, end };
}

/**
 * 본문에서 인용문 위치를 찾는다. 없으면 null.
 * 모델이 떨어진 두 구절을 "…"로 이어 붙인 경우에는 가장 긴 조각이 본문에 있고
 * 그 조각이 인용문의 대부분을 차지할 때만 일치로 인정한다.
 */
export function locateQuote(
  pageText: string,
  page: NormalizedText,
  quote: string,
): QuotePosition | null {
  const whole = normalizeForMatch(quote).norm;
  const exact = findRange(page, whole, pageText);
  if (exact) return exact;

  const fragments = quote
    .split(/\.{3,}|…|\n/u)
    .map((fragment) => normalizeForMatch(fragment).norm)
    .filter((fragment) => fragment.length >= MIN_FRAGMENT_CHARS)
    .sort((a, b) => b.length - a.length);

  const longest = fragments[0];
  if (!longest || longest.length < whole.length * 0.6) return null;
  return findRange(page, longest, pageText);
}
