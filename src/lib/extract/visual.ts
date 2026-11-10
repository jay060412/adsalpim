import { join } from "node:path";
import { createRequire } from "node:module";
import * as cheerio from "cheerio";
import { chromium as browserEngine, type Browser, type LaunchOptions } from "playwright-core";
import { fetchPublicAsset, type FetchedPage } from "@/lib/security/safe-fetch";
import { parsePublicHttpUrl } from "@/lib/security/ssrf";
import { AnalysisError } from "@/lib/analysis/errors";
import { captureQueue } from "@/lib/analysis/work-queue";
import type { PageVisual } from "@/lib/analysis/visual-schema";

const WIDTH = 1200;
const FRAME_HEIGHT = 1600;
const MAX_FRAMES = 8;
const RESOURCE_BUDGET = 24 * 1024 * 1024;
const captureRuntime = createRequire(join(process.cwd(), "package.json"))("./scripts/capture-runtime.cjs") as {
  prepareCaptureLaunch(): Promise<LaunchOptions>;
  captureFailureCode(error: unknown): string;
};

export function prepareCaptureHtml(html: string, finalUrl: string): string {
  const $ = cheerio.load(html);
  // Many sites activate CSS with an onload handler; apply that declarative
  // stylesheet without executing any of the site's JavaScript.
  $('link[rel="preload"][as="style"]').attr("rel", "stylesheet");
  $('link[rel="stylesheet"][media="print"][onload]').attr("media", "all");
  // Prefer the page's semantic main content. Large shopping-site navigation
  // menus otherwise consume the image budget before the advertisement loads.
  const main = $("main").first();
  if (main.length && (main.text().trim().length > 100 || main.find("img").length > 0)) {
    main.siblings().not("style,link").remove();
    main.parentsUntil("body").each((_, parent) => { $(parent).siblings().not("style,link,head").remove(); });
  }
  // Render a noninteractive copy. Page scripts, frames, navigation and forms
  // never execute on the analysis server or in the visitor's browser.
  $("script,noscript,iframe,frame,object,embed,base,meta[http-equiv],link[rel=preconnect],link[rel=preload],link[rel=prefetch],link[rel=dns-prefetch],link[rel=modulepreload],video,audio").remove();
  $("*").each((_, element) => {
    if (!("attribs" in element)) return;
    for (const name of Object.keys(element.attribs)) {
      if (name.toLowerCase().startsWith("on")) $(element).removeAttr(name);
    }
  });
  $("head").prepend($("<base>").attr("href", finalUrl));
  $("img").each((_, element) => {
    const img = $(element);
    const lazy = img.attr("data-src") || img.attr("data-original") || img.attr("data-lazy-src");
    if (lazy) img.attr("src", lazy);
    if (img.attr("data-srcset")) img.attr("srcset", img.attr("data-srcset")!);
    img.attr("loading", "eager");
  });
  $("head").append("<style>html{scroll-behavior:auto!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}</style>");
  return $.html();
}

async function launchCaptureBrowser(): Promise<Browser> {
  return browserEngine.launch(await captureRuntime.prepareCaptureLaunch());
}

/** Captures the fetched public HTML; no page scripts, cookies or user profile. */
export async function capturePage(page: FetchedPage, options: { signal?: AbortSignal; onQueued?: () => void; onResource?: (event: { url: string; type: string; error?: string }) => void } = {}): Promise<PageVisual> {
  parsePublicHttpUrl(page.finalUrl);
  const releaseCapture = await captureQueue.acquire({ signal: options.signal, onQueued: options.onQueued });
  if (options.signal?.aborted) { releaseCapture(); throw new AnalysisError("ABORTED"); }
  const deadline = AbortSignal.timeout(35_000);
  const cleanup = new AbortController();
  const signal = AbortSignal.any([deadline, cleanup.signal, ...(options.signal ? [options.signal] : [])]);
  let browser: Browser | undefined;
  let active = 0;
  let requested = 0;
  let bytes = 0;
  const waiting: (() => void)[] = [];
  const onAbort = () => { void browser?.close().catch(() => undefined); };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    browser = await launchCaptureBrowser();
    if (signal.aborted) throw new AnalysisError(options.signal?.aborted ? "ABORTED" : "PAGE_TIMEOUT");
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block", viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 1 });
    const tab = await context.newPage();
    // Every resource is fulfilled by our DNS-pinned fetcher. Chromium itself
    // never follows resource redirects or connects to their destinations.
    await context.route("**/*", async (route) => {
      const request = route.request();
      try {
        if (!["image", "stylesheet", "font"].includes(request.resourceType()) || ++requested > 120 || signal.aborted) {
          await route.abort(); return;
        }
        if (active >= 5) await new Promise<void>((resolve) => waiting.push(resolve));
        active++;
        try {
          if (signal.aborted || bytes >= RESOURCE_BUDGET) throw new Error("CAPTURE_LIMIT");
          const asset = await fetchPublicAsset(request.url(), { signal, maxBytes: Math.min(6 * 1024 * 1024, RESOURCE_BUDGET - bytes) });
          bytes += asset.bytes.byteLength;
          if (bytes > RESOURCE_BUDGET) throw new Error("CAPTURE_LIMIT");
          await route.fulfill({ status: 200, contentType: asset.contentType, body: Buffer.from(asset.bytes), headers: { "Access-Control-Allow-Origin": "*" } });
          options.onResource?.({ url: request.url(), type: request.resourceType() });
        } finally {
          active--;
          waiting.shift()?.();
        }
      } catch (error) {
        options.onResource?.({ url: request.url(), type: request.resourceType(), error: error instanceof AnalysisError ? error.code : error instanceof Error ? error.message : "unknown" });
        await route.abort().catch(() => undefined);
      }
    });
    await tab.setContent(prepareCaptureHtml(page.html, page.finalUrl), { waitUntil: "load", timeout: 25_000 });
    const session = await context.newCDPSession(tab);
    const totalHeight = await tab.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    const height = Math.min(totalHeight, MAX_FRAMES * FRAME_HEIGHT);
    const frames: PageVisual["frames"] = [];
    let imageBytes = 0;
    for (let top = 0; top < height; top += FRAME_HEIGHT) {
      if (signal.aborted) throw new AnalysisError(options.signal?.aborted ? "ABORTED" : "PAGE_TIMEOUT");
      const frameHeight = Math.min(FRAME_HEIGHT, height - top);
      const capture = await session.send("Page.captureScreenshot", { format: "jpeg", quality: 80, clip: { x: 0, y: top, width: WIDTH, height: frameHeight, scale: 1 }, captureBeyondViewport: true });
      const image = Buffer.from(capture.data, "base64");
      imageBytes += image.byteLength;
      if (imageBytes > 4 * 1024 * 1024 || image.byteLength > 1_100_000) break;
      frames.push({ id: `V${frames.length + 1}`, width: WIDTH, height: frameHeight, offsetY: top, image: `data:image/jpeg;base64,${Buffer.from(image).toString("base64")}` });
    }
    if (!frames.length) throw new Error("CAPTURE_EMPTY");
    return { frames, capturedAt: new Date().toISOString(), mode: "static", truncated: frames.reduce((sum, frame) => sum + frame.height, 0) < totalHeight };
  } catch (error) {
    if (!options.signal?.aborted) console.warn(`[adsalpim] Capture failed: ${captureRuntime.captureFailureCode(error)}`);
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    cleanup.abort();
    await browser?.close().catch(() => undefined);
    for (const resolve of waiting) resolve();
    releaseCapture();
  }
}
