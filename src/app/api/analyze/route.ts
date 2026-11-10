import { z } from "zod";
import { AnalysisError, ERROR_MESSAGES, isRetryable, type ErrorCode } from "@/lib/analysis/errors";
import type { AnalyzeEvent } from "@/lib/analysis/events";
import { createGeminiPort, getGeminiConfig } from "@/lib/analysis/gemini";
import { createMockGeminiPort, isMockMode, mockFetchPage } from "@/lib/analysis/mock";
import { runAnalysis, type PageReader, type PipelineDeps } from "@/lib/analysis/pipeline";
import { checkAnalyzeRateLimit, clientKeyFromHeaders } from "@/lib/security/rate-limit";
import { capturePage } from "@/lib/extract/visual";
import { analysisQueue } from "@/lib/analysis/work-queue";

// Gemini 호출 세 번(주장 추출 → 검색 검증 → 보고서)이 끝날 때까지 기다릴 수 있어야 한다.
export const maxDuration = 600;

const MAX_BODY_BYTES = 8 * 1024;
const HEARTBEAT_MS = 10_000;

const BodySchema = z.object({ url: z.string().max(2048) });

function errorResponse(code: ErrorCode, status: number, headers?: Record<string, string>) {
  const event: AnalyzeEvent = {
    type: "error",
    stage: null,
    code,
    message: ERROR_MESSAGES[code],
    retryable: isRetryable(code),
  };
  return Response.json(event, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // 브라우저가 아닌 클라이언트(curl 등)는 Origin을 보내지 않는다.
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** 헤더의 크기 선언과 별개로 실제 수신한 바이트 수에도 상한을 적용한다. */
async function readRequestBody(request: Request): Promise<string> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    await request.body?.cancel().catch(() => undefined);
    throw new AnalysisError("BAD_REQUEST", { httpStatus: 413 });
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new AnalysisError("BAD_REQUEST", { httpStatus: 413 });
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("BAD_REQUEST", 403);

  let rawUrl: string;
  try {
    const text = await readRequestBody(request);
    rawUrl = BodySchema.parse(JSON.parse(text)).url;
  } catch (err) {
    return errorResponse("BAD_REQUEST", err instanceof AnalysisError && err.httpStatus === 413 ? 413 : 400);
  }

  const limit = checkAnalyzeRateLimit(clientKeyFromHeaders(request.headers));
  if (!limit.allowed) {
    return errorResponse("RATE_LIMITED", 429, { "Retry-After": String(limit.retryAfterSec) });
  }

  const abort = new AbortController();
  const pageReader: PageReader = process.env.PAGE_READER === "direct" ? "direct" : "url-context";
  let deps: PipelineDeps;

  if (isMockMode()) {
    // 개발 전용: 화면 확인을 위한 모의 분석. 결과에 "모의 데이터"로 표시되며 운영 환경에서는 켜지지 않는다.
    deps = {
      gemini: createMockGeminiPort(),
      fetchPage: mockFetchPage,
      checkHost: async () => undefined,
      resolveRedirect: async () => null,
      pageReader,
      signal: abort.signal,
      mock: true,
      capturePage,
    };
  } else {
    // API 키가 없으면 분석을 흉내 내지 않고 설정 방법을 안내한다.
    const config = getGeminiConfig();
    if (!config.apiKey) return errorResponse("MISSING_API_KEY", 503);
    deps = {
      gemini: createGeminiPort(config.apiKey, config.model),
      pageReader,
      signal: abort.signal,
      capturePage,
    };
  }

  const onAbort = () => abort.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  // 본문을 읽는 동안 취소되었다면 이미 발생한 abort 이벤트도 반영한다.
  if (request.signal.aborted) onAbort();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: AnalyzeEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      // 긴 Gemini 호출 동안 프록시가 연결을 끊지 않도록 주기적으로 빈 이벤트를 보낸다.
      const heartbeat = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);
      let releaseAnalysis: (() => void) | undefined;
      try {
        releaseAnalysis = await analysisQueue.acquire({
          signal: abort.signal,
          onQueued: () => send({ type: "stage", stage: "validate", status: "active", detail: "먼저 접수된 광고를 분석하고 있어요. 대기 중이며 차례가 되면 자동으로 시작해요." }),
        });
        await runAnalysis(rawUrl, deps, send);
      } catch (err) {
        if (!(err instanceof AnalysisError)) console.error("[analyze] pipeline crashed:", err instanceof Error ? err.name : typeof err);
        const error = err instanceof AnalysisError ? err : new AnalysisError("INTERNAL");
        send({
          type: "error",
          stage: null,
          code: error.code,
          message: error.userMessage,
          retryable: error.retryable,
        });
      } finally {
        releaseAnalysis?.();
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", onAbort);
        closed = true;
        try {
          controller.close();
        } catch {
          // 클라이언트가 먼저 연결을 끊은 경우
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
