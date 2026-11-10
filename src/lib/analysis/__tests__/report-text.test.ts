import { describe, expect, it } from "vitest";
import { buildHeadline } from "../report-text";
import type { Claim } from "../schema";

const claim = (status: Claim["verificationStatus"]): Claim => ({
  id: "C1", originalText: "광고 주장", category: "absolute", verificationStatus: status,
  concern: "확인 필요", explanation: "연결 자료와 다름", evidenceSummary: "비교 자료",
  sourceIds: ["S1"], recommendedAction: "원문 확인", legalNote: null, quoteVerified: true, position: null,
});

describe("report headlines", () => {
  it.each([[claim("contradicted")], [claim("contradicted"), claim("insufficient")]])(
    "does not assert source authority from claim status alone (%j)", (...claims) => {
      const text = buildHeadline(claims);
      expect(text).not.toContain("공신력 있는");
      expect(text).toContain("연결된 자료");
    },
  );
});
