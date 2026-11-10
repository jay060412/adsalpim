import { describe, expect, it } from "vitest";
import { locateQuote, normalizeForMatch } from "../quote";

const pageText = [
  "슬림핏 다이어트 보조제",
  "단 2주 만에 -10kg, “100% 효과 보장”",
  "부작용이 전혀 없는 천연 성분으로",
  "누구나 성공합니다.",
  "ＳＧＳ 인증 ㈜슬림핏 😀 고객 만족도 98%",
].join("\n");
const page = normalizeForMatch(pageText);

const find = (quote: string) => {
  const position = locateQuote(pageText, page, quote);
  return position ? pageText.slice(position.start, position.end) : null;
};

describe("locateQuote", () => {
  it("finds an exact quote", () => {
    expect(find("단 2주 만에 -10kg")).toBe("단 2주 만에 -10kg");
  });

  it("ignores whitespace, line breaks and quote-mark differences", () => {
    expect(find('"100%효과 보장"')).toBe("100% 효과 보장");
    expect(find("부작용이 전혀 없는 천연 성분으로 누구나 성공합니다.")).toBe(
      "부작용이 전혀 없는 천연 성분으로\n누구나 성공합니다.",
    );
  });

  it("matches full-width and compatibility characters", () => {
    expect(find("SGS 인증 (주)슬림핏")).toBe("ＳＧＳ 인증 ㈜슬림핏");
  });

  it("returns ranges that include a trailing emoji", () => {
    expect(find("슬림핏 😀")).toBe("슬림핏 😀");
  });

  it("rejects paraphrased or invented quotes", () => {
    expect(find("2주 만에 10kg 감량을 보장합니다")).toBeNull();
    expect(find("식약처가 인증한 제품")).toBeNull();
    expect(find("")).toBeNull();
  });

  it("accepts an ellipsis-joined quote only when most of it is on the page", () => {
    expect(find("부작용이 전혀 없는 천연 성분으로…")).toBe("부작용이 전혀 없는 천연 성분으로");
    expect(find("부작용이 전혀 없는 천연 성분으로 ... 식약처와 공정위가 모두 공식적으로 인정한 유일한 제품")).toBeNull();
  });
});
