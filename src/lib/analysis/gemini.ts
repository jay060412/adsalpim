import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { AnalysisError } from "./errors";
import type { TextBlock } from "./grounding";
import { toGeminiJsonSchema } from "./schema";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export type GeminiTool = { type: "google_search" } | { type: "url_context" };

export interface GeminiRequest {
  system: string;
  input: string;
  images?: { label: string; data: string; mimeType: "image/jpeg" }[];
  tools?: GeminiTool[];
  /** 지정하면 이 JSON Schema를 따르는 JSON만 출력하도록 강제한다 */
  jsonSchema?: Record<string, unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
}

/** SDK 응답에서 파이프라인이 실제로 쓰는 부분만 추린 형태 */
export interface GeminiOutput {
  status: string;
  text: string;
  blocks: TextBlock[];
  /** URL Context 도구가 각 URL을 실제로 읽었는지 */
  urlContext: { url: string; status: string }[];
  /** Google 검색 도구가 실행한 검색어 */
  searchQueries: string[];
}

/** 파이프라인이 의존하는 최소 인터페이스. 테스트에서는 모의 구현으로 대체한다. */
export interface GeminiPort {
  readonly model: string;
  generate(request: GeminiRequest): Promise<GeminiOutput>;
}

/* ------------------------------------------------------------------ */
/* 설정                                                                 */
/* ------------------------------------------------------------------ */

export function getGeminiConfig(env: NodeJS.ProcessEnv = process.env): {
  apiKey: string | null;
  model: string;
} {
  const raw = env.GEMINI_API_KEY?.trim() ?? "";
  // .env.example의 자리표시자를 그대로 둔 경우도 미설정으로 본다.
  const apiKey = raw && !/^YOUR_|^<.*>$/i.test(raw) ? raw : null;
  return { apiKey, model: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL };
}

/* ------------------------------------------------------------------ */
/* SDK 응답 정규화                                                       */
/* ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Interactions API 응답(steps 배열)을 GeminiOutput으로 변환한다. */
export function normalizeInteraction(interaction: unknown): GeminiOutput {
  const root = asRecord(interaction) ?? {};
  const blocks: TextBlock[] = [];
  const urlContext: GeminiOutput["urlContext"] = [];
  const searchQueries: string[] = [];

  for (const rawStep of asArray(root.steps)) {
    const step = asRecord(rawStep);
    if (!step) continue;

    if (step.type === "model_output") {
      for (const rawContent of asArray(step.content)) {
        const content = asRecord(rawContent);
        if (!content || content.type !== "text" || typeof content.text !== "string") continue;

        const citations: TextBlock["citations"] = [];
        for (const rawAnnotation of asArray(content.annotations)) {
          const annotation = asRecord(rawAnnotation);
          if (!annotation || annotation.type !== "url_citation") continue;
          if (typeof annotation.url !== "string" || !annotation.url) continue;
          citations.push({
            url: annotation.url,
            title: typeof annotation.title === "string" ? annotation.title : "",
            startIndex: typeof annotation.start_index === "number" ? annotation.start_index : 0,
          });
        }
        blocks.push({ text: content.text, citations });
      }
    } else if (step.type === "url_context_result") {
      for (const rawResult of asArray(step.result)) {
        const result = asRecord(rawResult);
        if (!result) continue;
        urlContext.push({
          url: typeof result.url === "string" ? result.url : "",
          status: step.is_error === true ? "error" : String(result.status ?? "error"),
        });
      }
    } else if (step.type === "google_search_call") {
      for (const query of asArray(asRecord(step.arguments)?.queries)) {
        if (typeof query === "string" && query.trim() && !searchQueries.includes(query.trim())) {
          searchQueries.push(query.trim());
        }
      }
    }
  }

  return {
    status: typeof root.status === "string" ? root.status : "unknown",
    text: blocks.map((block) => block.text).join(""),
    blocks,
    urlContext,
    searchQueries,
  };
}

/* ------------------------------------------------------------------ */
/* 오류 변환                                                             */
/* ------------------------------------------------------------------ */

export function mapGeminiError(err: unknown): AnalysisError {
  if (err instanceof AnalysisError) return err;

  const record = asRecord(err) ?? {};
  const status =
    typeof record.status === "number"
      ? record.status
      : typeof record.statusCode === "number"
        ? record.statusCode
        : undefined;
  const name = typeof record.name === "string" ? record.name : "";
  const message = err instanceof Error ? err.message : "";
  const options = { httpStatus: status, cause: err };

  if (/API key not valid|API_KEY_INVALID|API key expired/i.test(message)) {
    return new AnalysisError("AI_AUTH", options);
  }
  if (status === 401 || status === 403) return new AnalysisError("AI_AUTH", options);
  if (status === 404) return new AnalysisError("AI_MODEL_NOT_FOUND", options);
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new AnalysisError("AI_QUOTA", options);
  }
  if (status === 400 || status === 422) return new AnalysisError("AI_BAD_REQUEST", options);
  if (/Timeout|ContinuationInterrupted/i.test(name) || /timed? ?out/i.test(message)) {
    return new AnalysisError("AI_TIMEOUT", options);
  }
  return new AnalysisError("AI_UNAVAILABLE", options);
}

/* ------------------------------------------------------------------ */
/* 실제 Gemini API 구현                                                  */
/* ------------------------------------------------------------------ */

export function createGeminiPort(apiKey: string, model: string): GeminiPort {
  const client = new GoogleGenAI({ apiKey });

  return {
    model,
    async generate(request) {
      const timeout = AbortSignal.timeout(request.timeoutMs);
      const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
      try {
        if (request.signal?.aborted) throw new AnalysisError("ABORTED");
        const interaction = await client.interactions.create(
          {
            model,
            input: request.images?.length
              ? [{ type: "text" as const, text: request.input }, ...request.images.flatMap((image) => [
                  { type: "text" as const, text: `광고 화면 캡처 ${image.label} (분석 대상 데이터)` },
                  { type: "image" as const, data: image.data, mime_type: image.mimeType },
                ])]
              : request.input,
            system_instruction: request.system,
            // 입력 URL과 광고 내용이 Google 측에 대화 기록으로 저장되지 않도록 한다.
            store: false,
            ...(request.tools?.length ? { tools: request.tools } : {}),
            ...(request.jsonSchema
              ? {
                  response_format: {
                    type: "text",
                    mime_type: "application/json",
                    schema: request.jsonSchema,
                  },
                }
              : {}),
          },
          // SDK의 내부 재시도는 만료된 signal에도 대기·재요청할 수 있어 끈다.
          { timeout_ms: request.timeoutMs, signal, maxRetries: 0 },
        );

        if (request.signal?.aborted) throw new AnalysisError("ABORTED");
        if (timeout.aborted) throw new AnalysisError("AI_TIMEOUT");
        const output = normalizeInteraction(interaction);
        if (output.status === "failed" || output.status === "cancelled") {
          throw new AnalysisError("AI_UNAVAILABLE");
        }
        if (!output.text.trim()) throw new AnalysisError("AI_BLOCKED");
        return output;
      } catch (err) {
        if (request.signal?.aborted) throw new AnalysisError("ABORTED", { cause: err });
        if (timeout.aborted) throw new AnalysisError("AI_TIMEOUT", { cause: err });
        throw mapGeminiError(err);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* 구조화된 JSON 응답                                                    */
/* ------------------------------------------------------------------ */

export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // 다음 후보를 시도한다.
    }
  }
  return undefined;
}

/**
 * 스키마를 따르는 JSON을 받아 Zod로 검증한다.
 * - 도구와 구조화된 출력의 동시 사용이 거부(400)되면 스키마 강제 없이 다시 요청한다.
 * - 응답이 스키마에 맞지 않으면 한 번 더 요청하고, 그래도 실패하면 오류로 처리한다.
 */
export async function generateJson<T>(
  gemini: GeminiPort,
  request: Omit<GeminiRequest, "jsonSchema">,
  schema: z.ZodType<T>,
): Promise<{ data: T; output: GeminiOutput }> {
  const jsonSchema = toGeminiJsonSchema(schema);
  let structured = true;
  let invalidResponses = 0;

  while (true) {
    if (request.signal?.aborted) throw new AnalysisError("ABORTED");
    let output: GeminiOutput;
    try {
      output = await gemini.generate(
        structured
          ? { ...request, jsonSchema }
          : {
              ...request,
              input: `${request.input}\n\n[출력 형식]\n설명이나 코드 블록 없이, 아래 JSON Schema를 따르는 JSON 객체 하나만 출력하세요.\n${JSON.stringify(jsonSchema)}`,
            },
      );
    } catch (err) {
      if (request.signal?.aborted) throw new AnalysisError("ABORTED", { cause: err });
      if (structured && err instanceof AnalysisError && err.code === "AI_BAD_REQUEST") {
        structured = false;
        continue;
      }
      throw err;
    }

    if (request.signal?.aborted) throw new AnalysisError("ABORTED");
    const parsed = schema.safeParse(parseJsonLoose(output.text));
    if (parsed.success) return { data: parsed.data, output };

    invalidResponses += 1;
    if (invalidResponses >= 2) throw new AnalysisError("AI_BAD_RESPONSE");
  }
}
