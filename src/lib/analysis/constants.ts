/**
 * 서버와 브라우저가 함께 쓰는 분류 값.
 * 브라우저 번들에 Zod가 딸려 가지 않도록 스키마와 분리해 둔다.
 */

/** 주장별 검증 상태. 법률 위반 여부와는 별개의 축이다. */
export const VERIFICATION_STATUSES = [
  "supported",
  "needs_verification",
  "insufficient",
  "contradicted",
  "undetermined",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const CLAIM_CATEGORIES = [
  "exaggeration",
  "absolute",
  "authority",
  "misleading",
  "statistics",
  "regulated",
] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const PRODUCT_TYPES = [
  "health_functional_food",
  "food",
  "cosmetics",
  "pharmaceutical",
  "medical_device",
  "finance",
  "education",
  "electronics",
  "service",
  "other",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const MAX_CLAIMS = 8;
