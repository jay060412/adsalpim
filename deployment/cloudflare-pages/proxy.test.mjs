import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import worker from "./upload/_worker.js";

afterEach(() => mock.restoreAll());

test("pages and Next assets use the fixed backend, preserving query and RSC headers", async () => {
  const upstreamFetch = mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url.href, "http://play.wrd.kr:25860/privacy?_rsc=test");
    assert.equal(init.headers.get("rsc"), "1");
    assert.equal(init.headers.get("next-router-state-tree"), "router-state");
    assert.equal(init.headers.get("x-forwarded-host"), "adsalpim.pages.dev");
    assert.equal(init.headers.get("x-forwarded-proto"), "https");
    assert.equal(init.headers.get("host"), null);
    assert.equal(init.redirect, "manual");
    return new Response("component stream", { headers: { "Content-Type": "text/x-component", "Cache-Control": "public, max-age=100" } });
  });
  const response = await worker.fetch(new Request("https://adsalpim.pages.dev/privacy?_rsc=test", {
    headers: { rsc: "1", "next-router-state-tree": "router-state" },
  }));
  assert.equal(upstreamFetch.mock.callCount(), 1);
  assert.equal(response.headers.get("content-type"), "text/x-component");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "component stream");
});

test("a double-slash path cannot replace the backend", async () => {
  mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url.origin, "http://play.wrd.kr:25860");
    assert.equal(url.pathname, "//attacker.example/path");
    return new Response("ok");
  });
  assert.equal((await worker.fetch(new Request("https://adsalpim.pages.dev//attacker.example/path"))).status, 200);
});

test("analysis forwards the body and trusted visitor IP, replacing spoofed proxy headers", async () => {
  mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url.href, "http://play.wrd.kr:25860/api/analyze");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.get("origin"), "https://adsalpim.pages.dev");
    assert.equal(init.headers.get("x-forwarded-host"), "adsalpim.pages.dev");
    assert.equal(init.headers.get("x-forwarded-for"), "203.0.113.7");
    assert.equal(init.headers.get("x-real-ip"), "203.0.113.7");
    assert.equal(init.headers.get("forwarded"), null);
    assert.equal(init.headers.get("x-hop"), null);
    assert.deepEqual(await new Response(init.body).json(), { url: "https://example.com/" });
    return Response.json({ type: "result" });
  });
  const response = await worker.fetch(new Request("https://adsalpim.pages.dev/api/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json", origin: "https://adsalpim.pages.dev",
      "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "spoofed",
      "x-real-ip": "spoofed", "x-forwarded-host": "attacker.example",
      forwarded: "host=attacker.example", connection: "x-hop", "x-hop": "remove-me",
    },
    body: JSON.stringify({ url: "https://example.com/" }),
  }));
  assert.equal(response.status, 200);
});

test("cross-origin and null-origin analysis is rejected before reaching the backend", async () => {
  const upstreamFetch = mock.method(globalThis, "fetch", () => assert.fail("must not forward"));
  for (const origin of ["https://attacker.example", "null", "http://adsalpim.pages.dev"]) {
    const response = await worker.fetch(new Request("https://adsalpim.pages.dev/api/analyze", {
      method: "POST", headers: { origin }, body: "{}",
    }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "BAD_REQUEST");
  }
  assert.equal(upstreamFetch.mock.callCount(), 0);
});

test("POST outside the analysis route and unsupported methods never reach the backend", async () => {
  const upstreamFetch = mock.method(globalThis, "fetch", () => assert.fail("must not forward"));
  for (const [path, method] of [["/", "POST"], ["/api/analyze", "DELETE"], ["/api/analyze", "OPTIONS"]]) {
    const response = await worker.fetch(new Request(`https://adsalpim.pages.dev${path}`, { method }));
    assert.equal(response.status, 405);
    assert.ok(response.headers.has("allow"));
  }
  assert.equal(upstreamFetch.mock.callCount(), 0);
});

test("NDJSON events reach the client before the upstream stream finishes", async () => {
  let source;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) { source = controller; } });
  mock.method(globalThis, "fetch", async () => new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } }));
  const response = await worker.fetch(new Request("https://adsalpim.pages.dev/api/analyze", { method: "POST", body: "{}" }));
  assert.equal(response.headers.get("content-type"), "application/x-ndjson");
  const reader = response.body.getReader();
  source.enqueue(encoder.encode('{"type":"stage"}\n'));
  assert.equal(new TextDecoder().decode((await reader.read()).value), '{"type":"stage"}\n');
  source.enqueue(encoder.encode('{"type":"result"}\n'));
  source.close();
  assert.equal(new TextDecoder().decode((await reader.read()).value), '{"type":"result"}\n');
  assert.equal((await reader.read()).done, true);
});

test("client cancellation is forwarded to the backend request", async () => {
  let upstreamSignal;
  mock.method(globalThis, "fetch", async (_url, init) => { upstreamSignal = init.signal; return new Response("ok"); });
  const abort = new AbortController();
  await worker.fetch(new Request("https://adsalpim.pages.dev/", { signal: abort.signal }));
  abort.abort();
  assert.equal(upstreamSignal.aborted, true);
});

test("backend redirects remain on the public HTTPS origin", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 307, headers: { location: "http://play.wrd.kr:25860/legal?x=1#notice" } }));
  const response = await worker.fetch(new Request("https://adsalpim.pages.dev/"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://adsalpim.pages.dev/legal?x=1#notice");
});

test("immutable assets retain browser caching and HEAD remains bodyless", async () => {
  mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init.method, "HEAD");
    assert.equal(init.body, undefined);
    return new Response(null, { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
  });
  const response = await worker.fetch(new Request("https://adsalpim.pages.dev/_next/static/chunks/app.js", { method: "HEAD" }));
  assert.equal(response.body, null);
  assert.match(response.headers.get("cache-control"), /immutable/);
});

test("rate limits and API errors preserve HTTP status and retry headers", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ type: "error", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "30" } }));
  const response = await worker.fetch(new Request("https://adsalpim.pages.dev/api/analyze", { method: "POST", body: "{}" }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "30");
  assert.equal((await response.json()).code, "RATE_LIMITED");
});

test("connection failures produce a client-compatible error without internal details", async () => {
  mock.method(globalThis, "fetch", async () => { throw new Error("private failure details"); });
  const response = await worker.fetch(new Request("https://adsalpim.pages.dev/api/analyze", { method: "POST", body: "{}" }));
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.code, "NETWORK");
  assert.equal(body.retryable, true);
  assert.doesNotMatch(body.message, /private/);
});
