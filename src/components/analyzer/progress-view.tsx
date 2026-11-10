"use client";

import { CircleAlert, Minus, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { STAGES, type StageId } from "@/lib/analysis/events";
import { STAGE_LABELS } from "@/lib/analysis/labels";
import { cn } from "@/lib/utils";

export type StageView = {
  status: "pending" | "active" | "done" | "skipped" | "error";
  detail?: string;
};

export interface AnalysisFailure {
  stage: StageId | null;
  message: string;
  retryable: boolean;
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** 실제 경과 시간만 보여 준다. 남은 시간이나 진행률을 추정하지 않는다. */
function ElapsedTime({ startedAt, running }: { startedAt: number; running: boolean }) {
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return (
    <span className="font-mono text-[0.8125rem] text-muted-foreground tabular-nums">
      <span className="sr-only">경과 시간 </span>
      {formatElapsed(now - startedAt)}
    </span>
  );
}

function StepIndicator({ status, index }: { status: StageView["status"]; index: number }) {
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        {status === "done" && (
          <motion.span
            key="done"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <svg viewBox="0 0 24 24" className="size-4.5" fill="none" aria-hidden="true">
              <motion.path
                d="M6 12.5l4 4 8-9"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
              />
            </svg>
          </motion.span>
        )}

        {status === "active" && (
          <motion.span
            key="active"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative flex size-8 items-center justify-center"
          >
            <motion.span
              className="absolute inset-0 rounded-full border-[2.5px] border-primary/20 border-t-primary"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            />
            <span className="size-2 animate-pulse-soft rounded-full bg-primary" />
          </motion.span>
        )}

        {status === "error" && (
          <motion.span
            key="error"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="flex size-8 items-center justify-center rounded-full bg-destructive text-white"
          >
            <X className="size-4.5" strokeWidth={2.6} aria-hidden="true" />
          </motion.span>
        )}

        {status === "skipped" && (
          <motion.span
            key="skipped"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex size-8 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
          >
            <Minus className="size-4" aria-hidden="true" />
          </motion.span>
        )}

        {status === "pending" && (
          <motion.span
            key="pending"
            exit={{ opacity: 0 }}
            className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-[0.8125rem] font-semibold text-muted-foreground"
          >
            {index + 1}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

const STATUS_TEXT: Record<StageView["status"], string> = {
  pending: "대기 중",
  active: "진행 중",
  done: "완료",
  skipped: "건너뜀",
  error: "오류",
};

export function ProgressView({
  url,
  stages,
  failure,
  startedAt,
  onCancel,
  onRetry,
  onReset,
}: {
  url: string;
  stages: Record<StageId, StageView>;
  failure: AnalysisFailure | null;
  startedAt: number;
  onCancel: () => void;
  onRetry: () => void;
  onReset: () => void;
}) {
  const activeStage = STAGES.find((id) => stages[id].status === "active");

  return (
    <div className="mx-auto w-full max-w-2xl py-12 sm:py-20">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-raised sm:p-9">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {failure ? "분석을 끝내지 못했어요" : "광고를 살펴보고 있어요"}
            </h1>
            <p className="mt-2 truncate font-mono text-[0.8125rem] text-muted-foreground" title={url}>
              {url}
            </p>
          </div>
          <ElapsedTime startedAt={startedAt} running={!failure} />
        </div>

        {/* 스크린리더에는 단계가 바뀔 때만 알린다 */}
        <p className="sr-only" role="status" aria-live="polite">
          {failure
            ? `오류: ${failure.message}`
            : activeStage
              ? `${STAGE_LABELS[activeStage].title} 진행 중`
              : ""}
        </p>

        <ol className="mt-8">
          {STAGES.map((id, index) => {
            const stage = stages[id];
            const isLast = index === STAGES.length - 1;
            const isActive = stage.status === "active";
            const isError = stage.status === "error";

            return (
              <li key={id} className="relative flex gap-4 pb-6 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="absolute top-9 bottom-1 left-4 w-px -translate-x-1/2 bg-border"
                  >
                    <motion.span
                      className="absolute inset-0 origin-top bg-primary"
                      initial={false}
                      animate={{ scaleY: stage.status === "done" ? 1 : 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </span>
                )}

                <StepIndicator status={stage.status} index={index} />

                <div
                  className={cn(
                    "-mt-1.5 min-w-0 flex-1 rounded-xl px-3.5 py-2.5 transition-colors duration-300",
                    isActive && "bg-primary/[0.06] dark:bg-primary/10",
                    isError && "bg-destructive/[0.07]",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <h2
                      className={cn(
                        "text-[0.9375rem] font-semibold transition-colors duration-300",
                        stage.status === "pending" || stage.status === "skipped"
                          ? "text-muted-foreground"
                          : "text-foreground",
                      )}
                    >
                      {STAGE_LABELS[id].title}
                    </h2>
                    {stage.status !== "pending" && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                          isActive && "bg-primary/10 text-primary",
                          isError && "bg-destructive/10 text-destructive",
                          stage.status === "done" && "bg-accent text-accent-foreground",
                          stage.status === "skipped" && "bg-muted text-muted-foreground",
                        )}
                      >
                        {STATUS_TEXT[stage.status]}
                      </span>
                    )}
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                      key={isError ? "error" : (stage.detail ?? "description")}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "mt-1 text-[0.8125rem] leading-6",
                        isError ? "font-medium text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {isError && failure
                        ? failure.message
                        : (stage.detail ?? STAGE_LABELS[id].description)}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </li>
            );
          })}
        </ol>

        <AnimatePresence initial={false}>
          {failure && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-7"
            >
              {/* 특정 단계에 속하지 않는 오류(요청 제한, API 키 미설정 등)는 여기서 알린다 */}
              {failure.stage === null && (
                <p
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.07] px-4 py-3 text-sm leading-6 font-medium text-destructive"
                >
                  <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
                  {failure.message}
                </p>
              )}
              <div className="flex flex-col gap-2.5 sm:flex-row">
                {failure.retryable && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className={cn(buttonVariants({ size: "xl" }), "flex-1")}
                  >
                    <RotateCcw aria-hidden="true" />
                    다시 시도
                  </button>
                )}
                <button
                  type="button"
                  onClick={onReset}
                  className={cn(
                    buttonVariants({ variant: failure.retryable ? "outline" : "default", size: "xl" }),
                    "flex-1",
                  )}
                >
                  다른 링크 분석하기
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!failure && (
          <div className="mt-7 flex flex-col-reverse items-center justify-between gap-3 border-t border-border pt-5 sm:flex-row">
            <p className="text-center text-[0.8125rem] leading-6 text-muted-foreground sm:text-left">
              페이지 길이와 주장 수에 따라 1분 이상 걸릴 수 있어요.
            </p>
            <button
              type="button"
              onClick={onCancel}
              className={buttonVariants({ variant: "ghost", size: "lg" })}
            >
              분석 취소
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
