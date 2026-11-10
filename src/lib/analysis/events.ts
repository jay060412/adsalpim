import type { ErrorCode } from "./errors";
import type { AnalysisResult } from "./schema";

/** 분석 진행 화면에 표시되는 5단계. 서버 파이프라인의 실제 단계와 1:1로 대응한다. */
export const STAGES = ["validate", "collect", "claims", "verify", "report"] as const;
export type StageId = (typeof STAGES)[number];

export type StageStatus = "active" | "done" | "skipped";

/** /api/analyze 가 NDJSON 한 줄에 하나씩 내려보내는 이벤트 */
export type AnalyzeEvent =
  | { type: "stage"; stage: StageId; status: StageStatus; detail?: string }
  | { type: "result"; result: AnalysisResult }
  | {
      type: "error";
      stage: StageId | null;
      code: ErrorCode;
      message: string;
      retryable: boolean;
    }
  | { type: "ping" };
