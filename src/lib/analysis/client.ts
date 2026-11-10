import { ERROR_MESSAGES, isRetryable, type ErrorCode } from "./errors";
import type { AnalyzeEvent } from "./events";

function errorEvent(code: ErrorCode): AnalyzeEvent {
  return {
    type: "error",
    stage: null,
    code,
    message: ERROR_MESSAGES[code],
    retryable: isRetryable(code),
  };
}

function parseEvent(line: string): AnalyzeEvent | null {
  try {
    const event = JSON.parse(line) as AnalyzeEvent;
    return event && typeof event === "object" && "type" in event ? event : null;
  } catch {
    return null;
  }
}

/**
 * /api/analyze 를 호출하고 서버가 보내는 진행 이벤트를 순서대로 전달한다.
 * 어떤 경우에도 예외를 던지지 않고, 마지막에는 반드시 result 또는 error 이벤트가 전달된다.
 */
export async function streamAnalysis(
  url: string,
  onEvent: (event: AnalyzeEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let finished = false;
  const deliver = (event: AnalyzeEvent) => {
    if (event.type === "ping" || finished) return;
    if (event.type === "result" || event.type === "error") finished = true;
    onEvent(event);
  };

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });

    if (!res.ok || !res.body) {
      // 스트림이 시작되기 전의 오류(요청 제한, API 키 미설정 등)는 JSON 한 건으로 온다.
      const event = parseEvent(await res.text().catch(() => ""));
      deliver(event?.type === "error" ? event : errorEvent(res.status === 429 ? "RATE_LIMITED" : "AI_UNAVAILABLE"));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = parseEvent(line);
        if (event) deliver(event);
      }
    }

    const last = parseEvent(buffer.trim());
    if (last) deliver(last);

    // 결과 없이 스트림이 끝났다면 중간에 연결이 끊긴 것이다.
    if (!finished) deliver(errorEvent("NETWORK"));
  } catch {
    deliver(errorEvent(signal.aborted ? "ABORTED" : "NETWORK"));
  }
}
