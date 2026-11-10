import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGeminiPort, generateJson, type GeminiPort, type GeminiRequest } from "../gemini";

// 외부 유료 API 경계만 대체한다. 취소/시간 제한/오류 변환은 실제 adapter로 검증한다.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { interactions = { create }; },
}));

const interaction = { status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "ok" }] }] };
const request: GeminiRequest = { system: "test", input: "test", timeoutMs: 1000 };

beforeEach(() => { create.mockReset(); create.mockResolvedValue(interaction); });

describe("Gemini cancellation", () => {
  it("does not send an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createGeminiPort("test", "test").generate({ ...request, signal: controller.signal }))
      .rejects.toMatchObject({ code: "ABORTED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("aborts an in-flight SDK request and preserves the cancellation error", async () => {
    const controller = new AbortController();
    create.mockImplementation(async (_body, options) => {
      controller.abort();
      if (options.signal?.aborted) throw new DOMException("cancelled", "AbortError");
      return interaction;
    });
    await expect(createGeminiPort("test", "test").generate({ ...request, signal: controller.signal }))
      .rejects.toMatchObject({ code: "ABORTED" });
    expect(create.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("still enforces the call timeout when a cancellation signal is supplied", async () => {
    create.mockImplementation((_body, options) => new Promise((_resolve, reject) => {
      if (!options.signal) return reject(new Error("No bounded request signal"));
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }));
    await expect(createGeminiPort("test", "test").generate({
      ...request, timeoutMs: 10, signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  });

  it("does not retry malformed JSON after cancellation", async () => {
    const controller = new AbortController();
    let calls = 0;
    const gemini: GeminiPort = {
      model: "test",
      async generate() {
        calls += 1;
        controller.abort();
        return { status: "completed", text: "invalid", blocks: [], urlContext: [], searchQueries: [] };
      },
    };
    await expect(generateJson(gemini, { ...request, signal: controller.signal }, z.object({ value: z.string() })))
      .rejects.toMatchObject({ code: "ABORTED" });
    expect(calls).toBe(1);
  });
});
