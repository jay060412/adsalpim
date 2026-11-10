import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { prepareCaptureHtml } from "../visual";

describe("static advertisement capture", () => {
  it("keeps campaign styles and lazy images without scripts, frames or navigation", () => {
    const html = prepareCaptureHtml(`<html><head><base href="http://127.0.0.1"><link rel="preload" as="style" href="/campaign.css" onload="this.rel='stylesheet'"><meta http-equiv="refresh" content="0;url=http://127.0.0.1"></head><body><div class="layout"><nav><img src="/menu.png"></nav><main><h1>광고</h1><img data-src="/ad.png" onerror="fetch('/private')"><script>alert(1)</script><iframe src="http://127.0.0.1"></iframe></main><footer>메뉴</footer></div></body></html>`, "https://shop.example.com/ad");
    const $ = cheerio.load(html);
    expect($("base").attr("href")).toBe("https://shop.example.com/ad");
    expect($('link[href="/campaign.css"]').attr("rel")).toBe("stylesheet");
    expect($("script,iframe,meta[http-equiv],nav,footer,[onerror],[onload]")).toHaveLength(0);
    expect($("main img").attr("src")).toBe("/ad.png");
    expect($("main img").attr("loading")).toBe("eager");
    expect($(".layout main")).toHaveLength(1);
  });
});
