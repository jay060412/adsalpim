import type { StageId } from "./events";
import type { ClaimCategory, ProductType, VerificationStatus } from "./constants";

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  supported: "근거 확인",
  needs_verification: "검증 필요",
  insufficient: "근거 부족",
  contradicted: "사실 불일치",
  undetermined: "판단 불가",
};

export const STATUS_DESCRIPTIONS: Record<VerificationStatus, string> = {
  supported: "신뢰할 수 있는 자료에서 주장을 뒷받침하는 근거를 찾았어요.",
  needs_verification: "관련 정보는 있지만 추가 검증이 필요해요.",
  insufficient: "현재 확인 가능한 자료로는 주장을 충분히 입증하기 어려워요.",
  contradicted: "공신력 있는 자료와 구체적으로 충돌하는 내용을 확인했어요.",
  undetermined: "검증 자료가 부족해 판단할 수 없어요.",
};

export const CATEGORY_LABELS: Record<ClaimCategory, string> = {
  exaggeration: "허위·과장 가능성",
  absolute: "절대적 표현",
  authority: "인증·권위 주장",
  misleading: "소비자 오인 가능성",
  statistics: "검증되지 않은 수치",
  regulated: "업종별 규제 표현",
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  health_functional_food: "건강기능식품",
  food: "일반식품",
  cosmetics: "화장품",
  pharmaceutical: "의약품",
  medical_device: "의료기기",
  finance: "금융·투자",
  education: "교육·강의",
  electronics: "전자·가전",
  service: "서비스",
  other: "기타",
};

export const STAGE_LABELS: Record<StageId, { title: string; description: string }> = {
  validate: {
    title: "링크 확인",
    description: "주소 형식과 접근 가능 여부를 확인해요.",
  },
  collect: {
    title: "광고 내용 수집",
    description: "공개된 광고 페이지의 본문을 가져와요.",
  },
  claims: {
    title: "AI 핵심 주장 분석",
    description: "Gemini가 확인이 필요한 광고 주장을 찾아요.",
  },
  verify: {
    title: "검증 자료 검색",
    description: "Google 검색으로 공신력 있는 자료를 찾아요.",
  },
  report: {
    title: "분석 보고서 생성",
    description: "주장과 근거를 비교해 보고서로 정리해요.",
  },
};

export const CONTENT_SOURCE_LABELS = {
  direct: "서버 직접 수집",
  url_context: "Gemini URL Context",
  both: "Gemini URL Context + 서버 수집 대조",
} as const;
