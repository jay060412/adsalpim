"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { HeroBackground } from "@/components/home/hero-background";
import { ReportView } from "@/components/report/report-view";
import { streamAnalysis } from "@/lib/analysis/client";
import { STAGES, type AnalyzeEvent, type StageId } from "@/lib/analysis/events";
import type { AnalysisResult } from "@/lib/analysis/schema";
import { Hero } from "./hero";
import { ProgressView, type AnalysisFailure, type StageView } from "./progress-view";

type Stages = Record<StageId, StageView>;

interface State {
  phase: "idle" | "running" | "failed" | "done";
  /** 입력창에 적힌 값 */
  input: string;
  /** 분석 중이거나 분석한 URL */
  url: string;
  startedAt: number;
  stages: Stages;
  failure: AnalysisFailure | null;
  result: AnalysisResult | null;
}

type Action =
  | { type: "input"; value: string }
  | { type: "start"; url: string; startedAt: number }
  | { type: "event"; event: AnalyzeEvent }
  | { type: "reset"; keepInput: boolean };

const pendingStages = (): Stages =>
  Object.fromEntries(STAGES.map((id) => [id, { status: "pending" }])) as Stages;

const initialState: State = {
  phase: "idle",
  input: "",
  url: "",
  startedAt: 0,
  stages: pendingStages(),
  failure: null,
  result: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "input":
      return { ...state, input: action.value };

    case "start":
      return {
        ...state,
        phase: "running",
        url: action.url,
        startedAt: action.startedAt,
        stages: pendingStages(),
        failure: null,
        result: null,
      };

    case "reset":
      return { ...initialState, input: action.keepInput ? state.input : "" };

    case "event": {
      if (state.phase !== "running") return state;
      const { event } = action;

      // 진행 상태는 서버가 보낸 단계 이벤트로만 바뀐다.
      if (event.type === "stage") {
        return {
          ...state,
          stages: {
            ...state.stages,
            [event.stage]: {
              status: event.status,
              detail: event.detail ?? state.stages[event.stage].detail,
            },
          },
        };
      }

      if (event.type === "result") {
        return { ...state, phase: "done", result: event.result };
      }

      if (event.type === "error") {
        // 서버가 단계를 알려 주지 않았더라도, 진행 중이던 단계가 있으면 거기서 멈춘 것이다.
        const stage = event.stage ?? STAGES.find((id) => state.stages[id].status === "active") ?? null;
        return {
          ...state,
          phase: "failed",
          failure: { stage, message: event.message, retryable: event.retryable },
          stages: stage
            ? { ...state.stages, [stage]: { ...state.stages[stage], status: "error" } }
            : state.stages,
        };
      }

      return state;
    }
  }
}

const viewMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
};

export function Analyzer({ children }: { children?: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback((url: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    dispatch({ type: "start", url, startedAt: Date.now() });
    window.scrollTo({ top: 0, behavior: "instant" });

    void streamAnalysis(
      url,
      (event) => {
        // 취소했거나 새 분석으로 바뀐 뒤 도착한 이벤트는 버린다.
        if (controllerRef.current === controller) dispatch({ type: "event", event });
      },
      controller.signal,
    );
  }, []);

  const reset = useCallback((keepInput: boolean) => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    dispatch({ type: "reset", keepInput });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (state.phase === "done") window.scrollTo({ top: 0, behavior: "instant" });
  }, [state.phase]);

  return (
    <MotionConfig reducedMotion="user">
      <section className="relative isolate">
        <HeroBackground />
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <AnimatePresence mode="wait">
            {state.phase === "idle" && (
              <motion.div key="idle" {...viewMotion}>
                <Hero
                  url={state.input}
                  onUrlChange={(value) => dispatch({ type: "input", value })}
                  onSubmit={start}
                />
              </motion.div>
            )}

            {(state.phase === "running" || state.phase === "failed") && (
              <motion.div key="progress" {...viewMotion}>
                <ProgressView
                  url={state.url}
                  stages={state.stages}
                  failure={state.failure}
                  startedAt={state.startedAt}
                  onCancel={() => reset(true)}
                  onRetry={() => start(state.url)}
                  onReset={() => reset(true)}
                />
              </motion.div>
            )}

            {state.phase === "done" && state.result && (
              <motion.div key="report" {...viewMotion}>
                <ReportView result={state.result} onReset={() => reset(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <div className="print:hidden">{children}</div>
    </MotionConfig>
  );
}
