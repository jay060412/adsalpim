import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnalysisError } from "../errors";
import {
  generateJson,
  getGeminiConfig,
  mapGeminiError,
  normalizeInteraction,
  parseJsonLoose,
  type GeminiOutput,
  type GeminiPort,
  type GeminiRequest,
} from "../gemini";

const output = (text: string): GeminiOutput => ({
  status: "completed",
  text,
  blocks: [{ text, citations: [] }],
  urlContext: [],
  searchQueries: [],
});

/** 준비한 응답(또는 오류)을 순서대로 돌려주는 모의 Gemini */
function mockGemini(replies: (string | Error)[]): GeminiPort & { requests: GeminiRequest[] } {
  const requests: GeminiRequest[] = [];
  return {
    model: "mock-model",
    requests,
    async generate(request) {
      requests.push(request);
      const reply = replies.shift();
      if (reply === undefined) throw new Error("no more mock replies");
      if (reply instanceof Error) throw reply;
      return output(reply);
    },
  };
}

describe("getGeminiConfig", () => {
  it("treats a missing or placeholder key as not configured", () => {
    expect(getGeminiConfig({} as NodeJS.ProcessEnv).apiKey).toBeNull();
    expect(getGeminiConfig({ GEMINI_API_KEY: "  " } as unknown as NodeJS.ProcessEnv).apiKey).toBeNull();
    expect(
      getGeminiConfig({ GEMINI_API_KEY: "YOUR_GEMINI_API_KEY" } as unknown as NodeJS.ProcessEnv).apiKey,
    ).toBeNull();
  });

  it("reads the key and lets GEMINI_MODEL override the default model", () => {
    expect(getGeminiConfig({ GEMINI_API_KEY: "abc123" } as unknown as NodeJS.ProcessEnv)).toEqual({
      apiKey: "abc123",
      model: "gemini-3.8-flash",
    });
    expect(
      getGeminiConfig({ GEMINI_API_KEY: "abc123", GEMINI_MODEL: "gemini-3.6-flash" } as unknown as NodeJS.ProcessEnv)
        .model,
    ).toBe("gemini-3.6-flash");
  });
});

describe("normalizeInteraction", () => {
  // @google/genai Interactions API의 응답 형태(steps 배열)를 본뜬 모의 데이터
  const interaction = {
    id: "int_1",
    status: "completed",
    steps: [
      { type: "thought", signature: "x" },
      { type: "url_context_call", id: "u1", arguments: { urls: ["https://shop.example.com/item"] } },
      {
        type: "url_context_result",
        call_id: "u1",
        result: [{ url: "https://shop.example.com/item", status: "success" }],
      },
      { type: "google_search_call", id: "g1", arguments: { queries: ["식약처 체지방 감소", "식약처 체지방 감소"] } },
      { type: "google_search_result", call_id: "g1", result: [{ search_suggestions: "<div></div>" }] },
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text: "### C1\n확인된 사실",
            annotations: [
              { type: "url_citation", url: "https://www.mfds.go.kr/a", title: "mfds.go.kr", start_index: 7, end_index: 20 },
              { type: "url_citation", title: "no url" },
              { type: "file_citation", url: "https://ignored.example.com" },
            ],
          },
          { type: "image", data: "..." },
        ],
      },
    ],
  };

  it("extracts text, citations, URL retrieval results and search queries", () => {
    expect(normalizeInteraction(interaction)).toEqual({
      status: "completed",
      text: "### C1\n확인된 사실",
      blocks: [
        {
          text: "### C1\n확인된 사실",
          citations: [{ url: "https://www.mfds.go.kr/a", title: "mfds.go.kr", startIndex: 7 }],
        },
      ],
      urlContext: [{ url: "https://shop.example.com/item", status: "success" }],
      searchQueries: ["식약처 체지방 감소"],
    });
  });

  it("marks a URL retrieval step flagged as an error", () => {
    const result = normalizeInteraction({
      status: "completed",
      steps: [{ type: "url_context_result", is_error: true, result: [{ url: "https://x.example.com", status: "success" }] }],
    });
    expect(result.urlContext[0].status).toBe("error");
  });

  it("survives malformed responses", () => {
    for (const bad of [null, undefined, "text", 42, {}, { steps: "nope" }, { steps: [null, 1, { type: "model_output" }] }]) {
      expect(normalizeInteraction(bad).text).toBe("");
    }
  });
});

describe("mapGeminiError", () => {
  const apiError = (status: number | undefined, message = "error", name = "APIError") =>
    Object.assign(new Error(message), { status, name });

  it.each([
    [apiError(400, "API key not valid. Please pass a valid API key."), "AI_AUTH"],
    [apiError(401), "AI_AUTH"],
    [apiError(403), "AI_AUTH"],
    [apiError(404, "models/gemini-x is not found"), "AI_MODEL_NOT_FOUND"],
    [apiError(429, "RESOURCE_EXHAUSTED"), "AI_QUOTA"],
    [apiError(400, "Invalid JSON schema"), "AI_BAD_REQUEST"],
    [apiError(500), "AI_UNAVAILABLE"],
    [apiError(503, "overloaded"), "AI_UNAVAILABLE"],
    [apiError(undefined, "Request timed out", "APIConnectionTimeoutError"), "AI_TIMEOUT"],
    [apiError(undefined, "socket hang up", "APIConnectionError"), "AI_UNAVAILABLE"],
    ["something odd", "AI_UNAVAILABLE"],
  ])("maps %o to %s", (error, code) => {
    expect(mapGeminiError(error).code).toBe(code);
  });

  it("passes through errors that are already classified", () => {
    const original = new AnalysisError("AI_BLOCKED");
    expect(mapGeminiError(original)).toBe(original);
  });
});

describe("parseJsonLoose", () => {
  it("parses plain, fenced and prose-wrapped JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('결과입니다: {"a":1} 이상입니다.')).toEqual({ a: 1 });
  });

  it("returns undefined for non-JSON", () => {
    expect(parseJsonLoose("JSON이 아닙니다")).toBeUndefined();
    expect(parseJsonLoose("")).toBeUndefined();
  });
});

describe("generateJson", () => {
  const schema = z.object({ answer: z.enum(["yes", "no"]) });
  const request = { system: "s", input: "i", timeoutMs: 1000 };

  it("returns data that passes schema validation", async () => {
    const gemini = mockGemini(['{"answer":"yes"}']);
    const { data } = await generateJson(gemini, request, schema);
    expect(data).toEqual({ answer: "yes" });
    expect(gemini.requests[0].jsonSchema).toMatchObject({ type: "object", required: ["answer"] });
    expect(gemini.requests[0].jsonSchema).not.toHaveProperty("$schema");
  });

  it("retries once when the response does not match the schema", async () => {
    const gemini = mockGemini(['{"answer":"maybe"}', '{"answer":"no"}']);
    const { data } = await generateJson(gemini, request, schema);
    expect(data).toEqual({ answer: "no" });
    expect(gemini.requests).toHaveLength(2);
  });

  it("fails with AI_BAD_RESPONSE when the response stays invalid", async () => {
    const gemini = mockGemini(["죄송합니다", '{"unexpected":true}']);
    await expect(generateJson(gemini, request, schema)).rejects.toMatchObject({ code: "AI_BAD_RESPONSE" });
  });

  it("falls back to prompt-only JSON when structured output is rejected", async () => {
    const gemini = mockGemini([
      new AnalysisError("AI_BAD_REQUEST", { httpStatus: 400 }),
      '```json\n{"answer":"yes"}\n```',
    ]);
    const { data } = await generateJson(gemini, { ...request, tools: [{ type: "url_context" }] }, schema);
    expect(data).toEqual({ answer: "yes" });
    expect(gemini.requests[1].jsonSchema).toBeUndefined();
    expect(gemini.requests[1].input).toContain("JSON Schema");
    expect(gemini.requests[1].tools).toEqual([{ type: "url_context" }]);
  });

  it("does not swallow quota or auth errors", async () => {
    await expect(
      generateJson(mockGemini([new AnalysisError("AI_QUOTA")]), request, schema),
    ).rejects.toMatchObject({ code: "AI_QUOTA" });
  });
});
