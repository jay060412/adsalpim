import { afterEach, expect, it, vi } from "vitest";
import { createGeminiPort } from "../gemini";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("does not let SDK transport retries extend a failed timeout", async () => {
  vi.useFakeTimers();
  // 실제 SDK를 실행하고 네트워크 전송만 막는다.
  const transport = vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); });
  vi.stubGlobal("fetch", transport);
  const pending = createGeminiPort("test-key-not-real", "gemini-3.8-flash").generate({
    system: "test", input: "test", timeoutMs: 1000, signal: new AbortController().signal,
  });
  const failed = expect(pending).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  await vi.runAllTimersAsync();
  await failed;
  expect(transport).toHaveBeenCalledTimes(1);
});
