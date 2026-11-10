import { Agent, fetch as undiciFetch } from "undici";
import { AnalysisError } from "@/lib/analysis/errors";
import { BlockedAddressError, parsePublicHttpUrl, safeLookup } from "./ssrf";

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const TOTAL_TIMEOUT_MS = 15_000;
const ALLOWED_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

const REQUEST_HEADERS = {
  // 봇임을 숨기지 않는다. 접근을 막은 사이트는 우회하지 않고 실패로 처리한다.
  "User-Agent": "Mozilla/5.0 (compatible; AdSalpimBot/1.0; ad-claim-analysis)",
  Accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
};

interface PageResponse {
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}

export type PageFetcher = (
  url: string,
  init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> },
) => Promise<PageResponse>;

export interface FetchedPage {
  /** 리다이렉트를 모두 따라간 뒤의 최종 주소 */
  finalUrl: string;
  html: string;
  contentType: string;
  /** 응답이 크기 제한에 걸려 앞부분만 읽었는지 */
  truncated: boolean;
}

let agent: Agent | undefined;

/** 모든 연결이 safeLookup을 거치도록 고정한 dispatcher */
function getAgent(): Agent {
  agent ??= new Agent({
    connect: { lookup: safeLookup as never, timeout: 8_000 },
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
    keepAliveTimeout: 1_000,
  });
  return agent;
}

const defaultFetcher: PageFetcher = (url, init) =>
  undiciFetch(url, { ...init, dispatcher: getAgent() }) as unknown as Promise<PageResponse>;

function errorCode(err: unknown): string | undefined {
  for (let current = err, depth = 0; current && depth < 5; depth++) {
    const candidate = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (current instanceof BlockedAddressError) return current.code;
    if (typeof candidate.code === "string") return candidate.code;
    if (candidate.name === "TimeoutError" || candidate.name === "AbortError") {
      return String(candidate.name);
    }
    current = candidate.cause;
  }
  return undefined;
}

function toFetchError(err: unknown, userSignal?: AbortSignal): AnalysisError {
  if (err instanceof AnalysisError) return err;
  if (userSignal?.aborted) return new AnalysisError("ABORTED", { cause: err });

  switch (errorCode(err)) {
    case "EBLOCKEDADDRESS":
      return new AnalysisError("BLOCKED_URL", { cause: err });
    case "ENOTFOUND":
    case "EAI_AGAIN":
    case "EAI_NODATA":
      return new AnalysisError("DNS_FAILED", { cause: err });
    case "TimeoutError":
    case "AbortError":
    case "UND_ERR_CONNECT_TIMEOUT":
    case "UND_ERR_HEADERS_TIMEOUT":
    case "UND_ERR_BODY_TIMEOUT":
    case "ETIMEDOUT":
      return new AnalysisError("PAGE_TIMEOUT", { cause: err });
    default:
      return new AnalysisError("PAGE_UNREACHABLE", { cause: err });
  }
}

function statusError(status: number): AnalysisError {
  if (status === 404 || status === 410) return new AnalysisError("PAGE_NOT_FOUND");
  if (status === 401 || status === 403 || status === 429 || status === 451) {
    return new AnalysisError("PAGE_FORBIDDEN");
  }
  return new AnalysisError("PAGE_UNREACHABLE");
}

async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  maxBytes = MAX_BODY_BYTES,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!body) return { bytes: new Uint8Array(), truncated: false };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

/** Capture resources use the same DNS-pinned connection and redirect checks as HTML. */
export async function fetchPublicAsset(
  rawUrl: string,
  options: { signal?: AbortSignal; fetcher?: PageFetcher; maxBytes?: number } = {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const timeout = AbortSignal.timeout(10_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const fetcher = options.fetcher ?? defaultFetcher;
  let current = parsePublicHttpUrl(rawUrl);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await fetcher(current.toString(), {
        redirect: "manual", signal,
        headers: { ...REQUEST_HEADERS, Accept: "image/*,text/css,font/*;q=0.9,*/*;q=0.1" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) throw new AnalysisError("PAGE_UNREACHABLE");
        current = parsePublicHttpUrl(new URL(location, current).toString());
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel().catch(() => undefined);
        throw statusError(response.status);
      }
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!/^(image\/(png|jpeg|webp|gif|avif|svg\+xml)|text\/css|font\/[\w-]+|application\/(font-woff|vnd\.ms-fontobject|octet-stream))$/.test(contentType)) {
        await response.body?.cancel().catch(() => undefined);
        throw new AnalysisError("UNSUPPORTED_CONTENT");
      }
      const { bytes, truncated } = await readLimited(response.body, options.maxBytes ?? 6 * 1024 * 1024);
      if (truncated) throw new AnalysisError("PAGE_TOO_LARGE");
      return { bytes, contentType };
    }
    throw new AnalysisError("TOO_MANY_REDIRECTS");
  } catch (error) {
    throw toFetchError(error, options.signal);
  }
}

function decodeBody(bytes: Uint8Array, contentType: string): string {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1];
  // EUC-KR 등 UTF-8이 아닌 국내 사이트를 위해 <meta charset>도 확인한다.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head)?.[1];

  for (const label of [fromHeader, fromMeta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // 알 수 없는 charset 라벨이면 다음 후보로 넘어간다.
    }
  }
  return new TextDecoder().decode(bytes);
}

/**
 * 공개 웹페이지 하나를 안전하게 가져온다.
 * - 리다이렉트를 자동으로 따라가지 않고, 매 단계의 목적지를 다시 검증한다.
 * - 연결 시점 DNS 검증(safeLookup)으로 내부망 접근과 DNS Rebinding을 막는다.
 * - 전체 요청 시간과 응답 크기를 제한한다.
 */
export async function fetchPublicPage(
  startUrl: URL,
  options: { signal?: AbortSignal; fetcher?: PageFetcher } = {},
): Promise<FetchedPage> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const timeout = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;

  let current = startUrl;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetcher(current.toString(), {
        redirect: "manual",
        signal,
        headers: REQUEST_HEADERS,
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel().catch(() => undefined);
        if (!location) throw new AnalysisError("PAGE_UNREACHABLE");

        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          throw new AnalysisError("PAGE_UNREACHABLE");
        }
        // 리다이렉트 목적지도 처음 입력과 똑같이 검증한다.
        current = parsePublicHttpUrl(next.toString());
        continue;
      }

      if (res.status < 200 || res.status >= 300) {
        await res.body?.cancel().catch(() => undefined);
        throw statusError(res.status);
      }

      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      const declaredLength = Number(res.headers.get("content-length") ?? "0");
      if (declaredLength > MAX_BODY_BYTES * 4) {
        await res.body?.cancel().catch(() => undefined);
        throw new AnalysisError("PAGE_TOO_LARGE");
      }
      if (contentType && !ALLOWED_CONTENT_TYPES.some((type) => contentType.startsWith(type))) {
        await res.body?.cancel().catch(() => undefined);
        throw new AnalysisError("UNSUPPORTED_CONTENT");
      }

      const { bytes, truncated } = await readLimited(res.body);
      const html = decodeBody(bytes, contentType);
      if (!contentType && !html.trimStart().startsWith("<")) {
        throw new AnalysisError("UNSUPPORTED_CONTENT");
      }

      return { finalUrl: current.toString(), html, contentType, truncated };
    }

    throw new AnalysisError("TOO_MANY_REDIRECTS");
  } catch (err) {
    throw toFetchError(err, options.signal);
  }
}
