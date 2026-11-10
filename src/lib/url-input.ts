import { ERROR_MESSAGES } from "@/lib/analysis/errors";

export type UrlInputResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * 입력창에서 바로 알려 줄 수 있는 오류만 걸러내는 가벼운 검사.
 * 실제 보안 검증(내부망 차단 등)은 서버의 parsePublicHttpUrl이 다시 수행한다.
 */
export function checkUrlInput(raw: string): UrlInputResult {
  const input = raw.trim();
  if (!input) return { ok: false, message: ERROR_MESSAGES.EMPTY_URL };
  if (input.length > 2048 || /\s/.test(input)) {
    return { ok: false, message: ERROR_MESSAGES.INVALID_URL };
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
  let url: URL;
  try {
    url = new URL(hasScheme ? input : `https://${input}`);
  } catch {
    return { ok: false, message: ERROR_MESSAGES.INVALID_URL };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: ERROR_MESSAGES.UNSUPPORTED_PROTOCOL };
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, message: ERROR_MESSAGES.BLOCKED_URL };
  }
  if (!host.includes(".") && !host.startsWith("[")) {
    return { ok: false, message: ERROR_MESSAGES.INVALID_URL };
  }

  return { ok: true, url: url.toString() };
}
