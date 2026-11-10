// Cloudflare Pages Advanced Mode. This runs on Cloudflare, never in the browser.
// The Next.js site, assets and analysis API all come from the same Node.js build.
const UPSTREAM_ORIGIN = "http://play.wrd.kr:25860";
const PROXY_VERSION = "node21-v1";
const HOP_HEADERS = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
];

function errorResponse(isApi, status, code, message) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Adsalpim-Proxy": PROXY_VERSION,
  };
  if (isApi) {
    return Response.json({
      type: "error", stage: null, code, message, retryable: status >= 500,
    }, { status, headers });
  }
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>잠시 후 다시 이용해 주세요 · 광고살핌</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#172554;font-family:system-ui,sans-serif}main{padding:2rem;text-align:center}h1{font-size:1.6rem}p{color:#475569;line-height:1.8}a{color:#2563eb}</style></head>
<body><main><strong>광고살핌</strong><h1>잠시 접속할 수 없어요</h1><p>${message}</p><a href="/">다시 접속하기</a></main></body></html>`, {
    status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

function stripHopHeaders(headers) {
  // Connection can name additional headers that must not cross the proxy.
  for (const name of (headers.get("connection") ?? "").split(",")) {
    if (name.trim()) headers.delete(name.trim());
  }
  for (const name of HOP_HEADERS) headers.delete(name);
}

const worker = {
  async fetch(request) {
    const publicUrl = new URL(request.url);
    const isApi = publicUrl.pathname.startsWith("/api/");
    const isRead = request.method === "GET" || request.method === "HEAD";
    if (!isRead && !(request.method === "POST" && publicUrl.pathname === "/api/analyze")) {
      const response = errorResponse(isApi, 405, "BAD_REQUEST", "지원하지 않는 요청 방식이에요.");
      response.headers.set("Allow", publicUrl.pathname === "/api/analyze" ? "GET, HEAD, POST" : "GET, HEAD");
      return response;
    }

    // Check the real browser origin BEFORE adding trusted forwarding headers.
    const origin = request.headers.get("origin");
    if (!isRead && origin && origin !== publicUrl.origin) {
      return errorResponse(isApi, 403, "BAD_REQUEST", "요청 형식이 올바르지 않아요. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
    }

    // Assign path/search separately: a path such as //other-host cannot change
    // the destination. This proxy can only contact the configured Node.js host.
    const upstreamUrl = new URL(UPSTREAM_ORIGIN);
    upstreamUrl.pathname = publicUrl.pathname;
    upstreamUrl.search = publicUrl.search;

    const headers = new Headers(request.headers);
    stripHopHeaders(headers);
    for (const name of ["host", "forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "x-forwarded-for", "x-real-ip"]) {
      headers.delete(name);
    }
    headers.set("x-forwarded-host", publicUrl.host);
    headers.set("x-forwarded-proto", publicUrl.protocol.slice(0, -1));
    // Cloudflare supplies this value; do not trust a visitor's X-Forwarded-For.
    const clientIp = request.headers.get("cf-connecting-ip");
    if (clientIp) {
      headers.set("x-forwarded-for", clientIp);
      headers.set("x-real-ip", clientIp);
    }

    try {
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: isRead ? undefined : request.body,
        signal: request.signal,
        redirect: "manual",
        // Keep RSC, HTML and API responses out of the shared edge cache.
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      const responseHeaders = new Headers(upstream.headers);
      stripHopHeaders(responseHeaders);
      responseHeaders.set("X-Adsalpim-Proxy", PROXY_VERSION);
      if (!publicUrl.pathname.startsWith("/_next/static/")) {
        responseHeaders.set("Cache-Control", "no-store");
      }

      const location = responseHeaders.get("location");
      if (location) {
        const target = new URL(location, upstreamUrl);
        if (target.origin === UPSTREAM_ORIGIN) {
          responseHeaders.set("location", `${publicUrl.origin}${target.pathname}${target.search}${target.hash}`);
        }
      }

      // Forward the body stream directly, including NDJSON progress/ping events.
      // Reading text()/json() here would make users wait for the entire analysis.
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch {
      return errorResponse(isApi, 502, "NETWORK", "분석 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  },
};

export default worker;
