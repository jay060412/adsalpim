import type { StageId } from "./events";

export const ERROR_MESSAGES = {
  EMPTY_URL: "분석할 광고 링크를 입력해 주세요.",
  INVALID_URL:
    "올바른 웹 주소가 아니에요. https://로 시작하는 광고 페이지 링크를 확인해 주세요.",
  UNSUPPORTED_PROTOCOL: "http:// 또는 https://로 시작하는 링크만 분석할 수 있어요.",
  BLOCKED_URL:
    "이 주소는 분석할 수 없어요. 누구나 접속할 수 있는 공개 웹페이지 링크를 입력해 주세요.",
  DNS_FAILED: "이 주소의 웹사이트를 찾을 수 없어요. 링크에 오타가 없는지 확인해 주세요.",
  PAGE_NOT_FOUND: "페이지가 존재하지 않아요. 삭제되었거나 주소가 바뀌었을 수 있어요.",
  PAGE_FORBIDDEN:
    "이 웹사이트가 외부 접속을 차단하고 있어 광고 내용을 가져오지 못했어요. 로그인 없이 볼 수 있는 공개 링크인지 확인해 주세요.",
  PAGE_UNREACHABLE:
    "이 페이지의 광고 내용을 가져오지 못했어요. 공개적으로 접근 가능한 링크인지 확인해 주세요.",
  PAGE_TIMEOUT: "웹사이트 응답이 너무 느려 내용을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.",
  PAGE_TOO_LARGE: "페이지 용량이 너무 커서 분석할 수 없어요.",
  TOO_MANY_REDIRECTS: "페이지 이동(리다이렉트)이 너무 많아 내용을 가져오지 못했어요.",
  UNSUPPORTED_CONTENT:
    "웹페이지가 아닌 파일 형식이라 분석할 수 없어요. 광고가 게시된 웹페이지 링크를 입력해 주세요.",
  NO_CONTENT:
    "이 페이지의 본문과 이미지에서 읽을 수 있는 광고 문구를 찾지 못했어요. 로그인이나 추가 조작 없이 볼 수 있는 공개 페이지인지 확인해 주세요.",
  MISSING_API_KEY:
    "현재 AI 분석 서비스가 준비되지 않아 분석을 시작할 수 없어요. 잠시 후 다시 이용해 주세요.",
  AI_AUTH:
    "AI 분석 서비스에 연결하지 못했어요. 서비스 관리자에게 문의해 주세요.",
  AI_MODEL_NOT_FOUND:
    "현재 AI 분석 모델을 사용할 수 없어요. 서비스 관리자에게 문의해 주세요.",
  AI_BAD_REQUEST:
    "AI 서비스가 분석 요청을 처리하지 못했어요. 서비스 관리자에게 문의해 주세요.",
  AI_QUOTA: "AI 분석 사용량이 한도를 초과했어요. 잠시 후 다시 시도해 주세요.",
  AI_UNAVAILABLE: "현재 AI 분석 서비스를 이용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  AI_TIMEOUT: "AI 분석 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.",
  AI_BLOCKED: "AI가 이 페이지의 내용을 처리하지 못했어요. 다른 광고 링크로 시도해 주세요.",
  AI_BAD_RESPONSE: "AI 응답을 해석하지 못했어요. 다시 시도해 주세요.",
  RATE_LIMITED: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  SERVER_BUSY: "현재 분석 요청이 많아 대기 한도를 넘었어요. 잠시 후 다시 분석해 주세요.",
  BAD_REQUEST: "요청 형식이 올바르지 않아요. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
  NETWORK: "분석 도중 네트워크 연결이 끊겼어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  ABORTED: "분석을 취소했어요.",
  INTERNAL: "분석 중 예상하지 못한 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "PAGE_UNREACHABLE",
  "PAGE_TIMEOUT",
  "PAGE_FORBIDDEN",
  "NO_CONTENT",
  "AI_QUOTA",
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_BAD_RESPONSE",
  "RATE_LIMITED",
  "SERVER_BUSY",
  "NETWORK",
  "ABORTED",
  "INTERNAL",
]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE.has(code);
}

export class AnalysisError extends Error {
  readonly code: ErrorCode;
  /** 오류가 발생한 분석 단계. 파이프라인 진입 전 오류는 undefined */
  stage?: StageId;
  /** 사용자에게 보여 줄 한국어 메시지 */
  readonly userMessage: string;
  /** 외부 API가 돌려준 HTTP 상태 코드 (있는 경우) */
  readonly httpStatus?: number;

  constructor(
    code: ErrorCode,
    options: { stage?: StageId; userMessage?: string; httpStatus?: number; cause?: unknown } = {},
  ) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AnalysisError";
    this.code = code;
    this.stage = options.stage;
    this.httpStatus = options.httpStatus;
    this.userMessage = options.userMessage ?? ERROR_MESSAGES[code];
  }

  get retryable(): boolean {
    return isRetryable(this.code);
  }
}
