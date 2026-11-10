import { expect, it, vi } from "vitest";
import { fetchPublicAsset, type PageFetcher } from "../safe-fetch";

it("blocks image redirects to private hosts before another connection", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }));
  await expect(fetchPublicAsset("https://cdn.example.com/ad.png", { fetcher })).rejects.toMatchObject({ code: "BLOCKED_URL" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("rejects private URLs without making a request", async () => {
  const fetcher = vi.fn();
  await expect(fetchPublicAsset("http://127.0.0.1/image", { fetcher })).rejects.toMatchObject({ code: "BLOCKED_URL" });
  expect(fetcher).not.toHaveBeenCalled();
});

it("bounds image bytes and rejects HTML posing as a resource", async () => {
  const fetcher: PageFetcher = async () => new Response(new Uint8Array(100), { headers: { "content-type": "image/png" } });
  await expect(fetchPublicAsset("https://cdn.example.com/ad.png", { fetcher, maxBytes: 20 })).rejects.toMatchObject({ code: "PAGE_TOO_LARGE" });
  await expect(fetchPublicAsset("https://cdn.example.com/ad.png", { fetcher: async () => new Response("<html>", { headers: { "content-type": "text/html" } }) })).rejects.toMatchObject({ code: "UNSUPPORTED_CONTENT" });
});

it("retains binary image data after a public redirect", async () => {
  const fetcher: PageFetcher = async (url) => url.endsWith("/first")
    ? new Response(null, { status: 302, headers: { location: "/ad.webp" } })
    : new Response(new Uint8Array([0, 255, 3, 128]), { headers: { "content-type": "image/webp" } });
  const asset = await fetchPublicAsset("https://cdn.example.com/first", { fetcher });
  expect([...asset.bytes]).toEqual([0, 255, 3, 128]);
  expect(asset.contentType).toBe("image/webp");
});
