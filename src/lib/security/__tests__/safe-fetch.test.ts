import { describe, expect, it } from "vitest";
import { fetchPublicPage, type PageFetcher } from "../safe-fetch";

const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

/** URL별로 준비한 응답을 돌려주는 가짜 fetcher */
function scripted(responses: Record<string, () => Response>): {
  fetcher: PageFetcher;
  calls: string[];
} {
  const calls: string[] = [];
  const fetcher: PageFetcher = async (url) => {
    calls.push(url);
    const make = responses[url];
    if (!make) throw new Error(`unexpected request: ${url}`);
    return make();
  };
  return { fetcher, calls };
}

const start = new URL("https://shop.example.com/item");

describe("fetchPublicPage", () => {
  it("returns the page and the final URL after public redirects", async () => {
    const { fetcher, calls } = scripted({
      "https://shop.example.com/item": () => redirect("/item/123"),
      "https://shop.example.com/item/123": () => html("<p>안녕하세요</p>"),
    });
    const page = await fetchPublicPage(start, { fetcher });
    expect(page.finalUrl).toBe("https://shop.example.com/item/123");
    expect(page.html).toContain("안녕하세요");
    expect(calls).toHaveLength(2);
  });

  it.each([
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:8080/",
    "http://[::1]/",
    "https://internal.corp/",
    "file:///etc/passwd",
  ])("blocks a redirect to %s without requesting it", async (target) => {
    const { fetcher, calls } = scripted({
      "https://shop.example.com/item": () => redirect(target),
    });
    await expect(fetchPublicPage(start, { fetcher })).rejects.toMatchObject({
      code: expect.stringMatching(/BLOCKED_URL|UNSUPPORTED_PROTOCOL/),
    });
    expect(calls).toEqual(["https://shop.example.com/item"]);
  });

  it("stops after too many redirects", async () => {
    let hop = 0;
    const fetcher: PageFetcher = async (url) => redirect(`${new URL(url).origin}/next/${++hop}`);
    await expect(fetchPublicPage(start, { fetcher })).rejects.toMatchObject({
      code: "TOO_MANY_REDIRECTS",
    });
    expect(hop).toBe(6);
  });

  it.each([
    [404, "PAGE_NOT_FOUND"],
    [410, "PAGE_NOT_FOUND"],
    [401, "PAGE_FORBIDDEN"],
    [403, "PAGE_FORBIDDEN"],
    [429, "PAGE_FORBIDDEN"],
    [500, "PAGE_UNREACHABLE"],
    [503, "PAGE_UNREACHABLE"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const fetcher: PageFetcher = async () => new Response("nope", { status });
    await expect(fetchPublicPage(start, { fetcher })).rejects.toMatchObject({ code });
  });

  it("rejects non-HTML content", async () => {
    const fetcher: PageFetcher = async () =>
      new Response("%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } });
    await expect(fetchPublicPage(start, { fetcher })).rejects.toMatchObject({
      code: "UNSUPPORTED_CONTENT",
    });
  });

  it("rejects responses that declare an enormous size", async () => {
    const fetcher: PageFetcher = async () =>
      html("<p>x</p>", { "content-length": String(500 * 1024 * 1024) });
    await expect(fetchPublicPage(start, { fetcher })).rejects.toMatchObject({
      code: "PAGE_TOO_LARGE",
    });
  });

  it("reads at most the size limit and marks the page as truncated", async () => {
    const fetcher: PageFetcher = async () => html(`<p>${"가".repeat(2_000_000)}</p>`);
    const page = await fetchPublicPage(start, { fetcher });
    expect(page.truncated).toBe(true);
    expect(Buffer.byteLength(page.html, "utf8")).toBeLessThanOrEqual(3 * 1024 * 1024 + 4);
  });

  it("decodes EUC-KR pages declared in a meta tag", async () => {
    const bytes = Buffer.concat([
      Buffer.from('<html><head><meta charset="euc-kr"></head><body>'),
      Buffer.from([0xb1, 0xa4, 0xb0, 0xed]), // EUC-KR로 인코딩한 "광고"
      Buffer.from("</body></html>"),
    ]);
    const fetcher: PageFetcher = async () =>
      new Response(bytes, { status: 200, headers: { "content-type": "text/html" } });
    const page = await fetchPublicPage(start, { fetcher });
    expect(page.html).toContain("광고");
  });

  it("maps network failures to user-facing errors", async () => {
    const failing =
      (code: string): PageFetcher =>
      async () => {
        throw new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) });
      };

    await expect(fetchPublicPage(start, { fetcher: failing("ENOTFOUND") })).rejects.toMatchObject({
      code: "DNS_FAILED",
    });
    // 연결 시점 DNS 검증(safeLookup)이 비공개 주소를 거부했을 때
    await expect(
      fetchPublicPage(start, { fetcher: failing("EBLOCKEDADDRESS") }),
    ).rejects.toMatchObject({ code: "BLOCKED_URL" });
    await expect(
      fetchPublicPage(start, { fetcher: failing("ECONNREFUSED") }),
    ).rejects.toMatchObject({ code: "PAGE_UNREACHABLE" });
    await expect(
      fetchPublicPage(start, { fetcher: failing("UND_ERR_CONNECT_TIMEOUT") }),
    ).rejects.toMatchObject({ code: "PAGE_TIMEOUT" });
  });

  it("reports cancellation by the caller", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher: PageFetcher = async (_url, init) => {
      init.signal.throwIfAborted();
      return html("<p>x</p>");
    };
    await expect(
      fetchPublicPage(start, { fetcher, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });
});
