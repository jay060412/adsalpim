import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import ipaddr from "ipaddr.js";
import { AnalysisError } from "@/lib/analysis/errors";

const MAX_URL_LENGTH = 2048;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

/** 공개 인터넷에서 해석되지 않거나 내부망을 가리키는 최상위 도메인 */
const BLOCKED_TLDS = new Set([
  "localhost",
  "local",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "private",
  "test",
  "invalid",
  "example",
  "onion",
  "arpa",
]);

/**
 * 공개 인터넷 주소인지 확인한다.
 * 루프백·사설망·링크로컬(클라우드 메타데이터 169.254.169.254 포함)·CGNAT·
 * 멀티캐스트·예약 대역과, IPv4를 품고 있을 수 있는 IPv6 터널 대역을 모두 거부한다.
 */
export function isPublicAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr: ipaddr.IPv4 | ipaddr.IPv6 = ipaddr.parse(ip);
  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
  }
  return addr.range() === "unicast";
}

function hostnameOf(url: URL): string {
  // URL.hostname은 IPv6를 대괄호로 감싸서 돌려준다.
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

/**
 * 사용자가 입력한 문자열을 공개 http(s) URL로 해석한다.
 * DNS 조회 없이 판단할 수 있는 모든 것을 여기서 거른다. 리다이렉트 대상에도 동일하게 적용한다.
 */
export function parsePublicHttpUrl(raw: string): URL {
  const input = raw.trim();
  if (!input) throw new AnalysisError("EMPTY_URL");
  if (input.length > MAX_URL_LENGTH || /[\s\u0000-\u001f]/.test(input)) {
    throw new AnalysisError("INVALID_URL");
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
  let url: URL;
  try {
    url = new URL(hasScheme ? input : `https://${input}`);
  } catch {
    throw new AnalysisError("INVALID_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AnalysisError("UNSUPPORTED_PROTOCOL");
  }
  if (url.username || url.password) throw new AnalysisError("BLOCKED_URL");
  if (!ALLOWED_PORTS.has(url.port)) throw new AnalysisError("BLOCKED_URL");

  const host = hostnameOf(url);
  if (!host) throw new AnalysisError("INVALID_URL");

  if (ipaddr.isValid(host)) {
    if (!isPublicAddress(host)) throw new AnalysisError("BLOCKED_URL");
  } else {
    const labels = host.split(".");
    if (labels.length < 2 || labels.some((label) => label.length === 0)) {
      // 점이 없는 호스트명(예: "intranet")은 내부망 이름일 가능성이 높다.
      throw new AnalysisError(host === "localhost" ? "BLOCKED_URL" : "INVALID_URL");
    }
    if (BLOCKED_TLDS.has(labels[labels.length - 1])) {
      throw new AnalysisError("BLOCKED_URL");
    }
  }

  url.hash = "";
  return url;
}

export class BlockedAddressError extends Error {
  readonly code = "EBLOCKEDADDRESS";
  constructor(hostname: string) {
    super(`"${hostname}" resolves to a non-public address`);
    this.name = "BlockedAddressError";
  }
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string | LookupAddress[],
  family?: number,
) => void;

type Resolver = (
  hostname: string,
  options: { all: true; family?: number; hints?: number },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

/**
 * 소켓 연결 직전에 호출되는 DNS lookup 대체 함수.
 * 여기서 검증한 주소가 곧 실제로 연결되는 주소이므로, 사전 조회 이후에 DNS 응답을
 * 바꾸는 DNS Rebinding으로는 내부 주소에 도달할 수 없다. 조회된 주소 중 하나라도
 * 비공개 대역이면 연결 자체를 거부한다.
 */
export function createSafeLookup(resolver: Resolver = dnsLookup as Resolver) {
  return function safeLookup(
    hostname: string,
    options: { all?: boolean; family?: number; hints?: number } | LookupCallback,
    callback?: LookupCallback,
  ): void {
    const cb = (typeof options === "function" ? options : callback) as LookupCallback;
    const opts = typeof options === "function" ? {} : options;

    resolver(hostname, { family: opts.family, hints: opts.hints, all: true }, (err, addresses) => {
      if (err) return cb(err);
      if (!addresses || addresses.length === 0) {
        const notFound: NodeJS.ErrnoException = new Error(`ENOTFOUND ${hostname}`);
        notFound.code = "ENOTFOUND";
        return cb(notFound);
      }
      if (addresses.some((entry) => !isPublicAddress(entry.address))) {
        return cb(new BlockedAddressError(hostname));
      }
      if (opts.all) cb(null, addresses);
      else cb(null, addresses[0].address, addresses[0].family);
    });
  };
}

export const safeLookup = createSafeLookup();

/** "링크 확인" 단계에서 쓰는 사전 DNS 점검. 실제 방어선은 연결 시점의 safeLookup이다. */
export function assertPublicHost(url: URL, lookup = safeLookup): Promise<void> {
  const host = hostnameOf(url);
  if (ipaddr.isValid(host)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    lookup(host, { all: true }, (err) => {
      if (!err) return resolve();
      if (err instanceof BlockedAddressError) {
        return reject(new AnalysisError("BLOCKED_URL", { cause: err }));
      }
      reject(new AnalysisError("DNS_FAILED", { cause: err }));
    });
  });
}
