import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/analyze", () => {
  const original = { key: process.env.GEMINI_API_KEY };
  let ip = 0;
  // 요청 제한에 걸리지 않도록 테스트마다 다른 클라이언트 주소를 쓴다.
  const client = () => ({ "x-forwarded-for": `198.51.100.${++ip}` });

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    if (original.key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original.key;
  });

  it("reports unavailability to visitors while retaining the operator error code", async () => {
    const res = await post({ url: "https://example.com/product" }, client());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ type: "error", code: "MISSING_API_KEY", retryable: false });
    expect(body.message).toContain("분석을 시작할 수 없어요");
    expect(body.message).not.toMatch(/GEMINI_|\.env/);
  });

  it("treats the .env.example placeholder as not configured", async () => {
    process.env.GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
    const res = await post({ url: "https://example.com/product" }, client());
    expect((await res.json()).code).toBe("MISSING_API_KEY");
  });

  it.each([["not json"], [{}], [{ url: 123 }], [{ url: "a".repeat(3000) }]])(
    "rejects malformed body %j",
    async (body) => {
      const res = await post(body, client());
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("BAD_REQUEST");
    },
  );

  it("rejects cross-origin browser requests", async () => {
    const res = await post({ url: "https://example.com" }, { ...client(), origin: "https://evil.example.com" });
    expect(res.status).toBe(403);
  });

  it("limits UTF-8 bytes rather than JavaScript character count", async () => {
    const res = await post({ url: "https://example.com", extra: "가".repeat(3000) }, client());
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("BAD_REQUEST");
  });

  it.each([undefined, "1"])("stops reading an oversized stream with content-length %s", async (length) => {
    let cancelled = false;
    let chunksRead = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksRead += 1;
        if (chunksRead === 1) controller.enqueue(new Uint8Array(8193).fill(32));
        else controller.close();
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { host: "localhost:3000", ...client(), ...(length ? { "content-length": length } : {}) },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect((await POST(request)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(chunksRead).toBe(1);
  });

  it("rejects a declared oversized body without reading it", async () => {
    const res = await post({ url: "https://example.com" }, { ...client(), "content-length": "8193" });
    expect(res.status).toBe(413);
  });

  it("limits repeated requests from one client", async () => {
    const headers = client();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await post({ url: "https://example.com" }, headers)).status);
    expect(statuses.slice(0, 5)).toEqual([503, 503, 503, 503, 503]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it("streams a validation error for a blocked URL without contacting it", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    const res = await post({ url: "http://127.0.0.1:8080/admin" }, client());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");

    const events = (await res.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events[0]).toEqual({ type: "stage", stage: "validate", status: "active" });
    expect(events.at(-1)).toMatchObject({ type: "error", stage: "validate", code: "BLOCKED_URL" });
  });

  it.each(["before", "during"])("does not start analysis when aborted %s body reading", async (when) => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    const controller = new AbortController();
    if (when === "before") controller.abort();
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        if (when === "during") controller.abort();
        stream.enqueue(new TextEncoder().encode(JSON.stringify({ url: "http://127.0.0.1" })));
        stream.close();
      },
    }, { highWaterMark: 0 });
    const res = await POST(new Request("http://localhost:3000/api/analyze", {
      method: "POST", headers: { host: "localhost:3000", ...client() },
      body, signal: controller.signal, duplex: "half",
    } as RequestInit & { duplex: "half" }));
    const events = (await res.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "ABORTED" });
  });
});
