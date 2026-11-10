import type { LookupAddress } from "node:dns";
import { describe, expect, it } from "vitest";
import { AnalysisError } from "@/lib/analysis/errors";
import {
  assertPublicHost,
  BlockedAddressError,
  createSafeLookup,
  isPublicAddress,
  parsePublicHttpUrl,
} from "../ssrf";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return err instanceof AnalysisError ? err.code : "UNEXPECTED";
  }
  return "OK";
}

function fakeResolver(addresses: LookupAddress[]) {
  return (
    _hostname: string,
    _options: unknown,
    callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
  ) => callback(null, addresses);
}

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254", // 클라우드 메타데이터 서버
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd00:ec2::254",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "223.130.195.200", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );
});

describe("parsePublicHttpUrl", () => {
  it("accepts public http(s) URLs and adds a missing scheme", () => {
    expect(parsePublicHttpUrl("https://example.com/product?id=1#top").toString()).toBe(
      "https://example.com/product?id=1",
    );
    expect(parsePublicHttpUrl("  shop.example.co.kr/item  ").toString()).toBe(
      "https://shop.example.co.kr/item",
    );
    expect(parsePublicHttpUrl("http://example.com:8080/").port).toBe("8080");
  });

  it.each([
    ["", "EMPTY_URL"],
    ["   ", "EMPTY_URL"],
    ["not a url", "INVALID_URL"],
    ["https://", "INVALID_URL"],
    ["intranet", "INVALID_URL"],
    ["ftp://example.com/file", "UNSUPPORTED_PROTOCOL"],
    ["file:///etc/passwd", "UNSUPPORTED_PROTOCOL"],
    ["javascript:alert(1)", "INVALID_URL"],
    ["http://localhost:3000", "BLOCKED_URL"],
    ["http://localhost", "BLOCKED_URL"],
    ["http://127.0.0.1/admin", "BLOCKED_URL"],
    ["http://2130706433/", "BLOCKED_URL"], // 127.0.0.1의 10진수 표기
    ["http://0x7f.0.0.1/", "BLOCKED_URL"],
    ["http://[::1]/", "BLOCKED_URL"],
    ["http://[::ffff:169.254.169.254]/", "BLOCKED_URL"],
    ["http://169.254.169.254/latest/meta-data/", "BLOCKED_URL"],
    ["http://192.168.0.1/", "BLOCKED_URL"],
    ["http://metadata.google.internal/", "BLOCKED_URL"],
    ["http://printer.local/", "BLOCKED_URL"],
    ["https://user:pass@example.com/", "BLOCKED_URL"],
    ["https://example.com:22/", "BLOCKED_URL"],
    ["https://example.com:6379/", "BLOCKED_URL"],
    [`https://example.com/${"a".repeat(2100)}`, "INVALID_URL"],
  ])("rejects %s as %s", (input, code) => {
    expect(codeOf(() => parsePublicHttpUrl(input))).toBe(code);
  });
});

describe("createSafeLookup (DNS rebinding defence)", () => {
  it("returns validated public addresses", async () => {
    const lookup = createSafeLookup(fakeResolver([{ address: "93.184.216.34", family: 4 }]));
    const result = await new Promise((resolve, reject) =>
      lookup("example.com", { all: true }, (err, addresses) =>
        err ? reject(err) : resolve(addresses),
      ),
    );
    expect(result).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("supports the single-address callback form", async () => {
    const lookup = createSafeLookup(fakeResolver([{ address: "93.184.216.34", family: 4 }]));
    const result = await new Promise((resolve, reject) =>
      lookup("example.com", {}, (err, address, family) =>
        err ? reject(err) : resolve([address, family]),
      ),
    );
    expect(result).toEqual(["93.184.216.34", 4]);
  });

  it("refuses to connect when a public hostname resolves to a private address", async () => {
    const lookup = createSafeLookup(fakeResolver([{ address: "10.0.0.7", family: 4 }]));
    const error = await new Promise((resolve) =>
      lookup("rebind.example.com", { all: true }, resolve),
    );
    expect(error).toBeInstanceOf(BlockedAddressError);
  });

  it("refuses when any one of several records is private", async () => {
    const lookup = createSafeLookup(
      fakeResolver([
        { address: "93.184.216.34", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ]),
    );
    const error = await new Promise((resolve) =>
      lookup("mixed.example.com", { all: true }, resolve),
    );
    expect(error).toBeInstanceOf(BlockedAddressError);
  });
});

describe("assertPublicHost", () => {
  it("maps blocked and unresolvable hosts to user-facing errors", async () => {
    const blocked = createSafeLookup(fakeResolver([{ address: "127.0.0.1", family: 4 }]));
    await expect(
      assertPublicHost(new URL("https://evil.example.com"), blocked),
    ).rejects.toMatchObject({ code: "BLOCKED_URL" });

    const missing = createSafeLookup((_hostname, _options, callback) => {
      const err: NodeJS.ErrnoException = new Error("not found");
      err.code = "ENOTFOUND";
      callback(err, []);
    });
    await expect(
      assertPublicHost(new URL("https://nope.example.com"), missing),
    ).rejects.toMatchObject({ code: "DNS_FAILED" });
  });
});
