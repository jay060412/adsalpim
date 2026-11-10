// Explicit opt-in integration check for the capture feature, not a UI automation test.
// Normal test runs do not launch a renderer, access the network, or call Gemini.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fetchPublicPage } from "@/lib/security/safe-fetch";
import { PageVisualSchema } from "@/lib/analysis/visual-schema";
import { capturePage } from "../visual";
import { extractPage } from "../html";
import { createGeminiPort, generateJson, getGeminiConfig } from "@/lib/analysis/gemini";
import { claimsInput, claimsSystemPrompt } from "@/lib/analysis/prompts";
import { VisualClaimExtractionSchema } from "@/lib/analysis/schema";

it.runIf(process.env.VERIFY_VISUAL_CAPTURE === "1")("captures the public LG advertisement with the production capture implementation", async () => {
  const page = await fetchPublicPage(new URL("https://www.lge.co.kr/benefits/exhibitions/detail-PE01036002?eventCode=bfdotexnmnaver"));
  const resources: unknown[] = [];
  const visual = PageVisualSchema.parse(await capturePage(page, { onResource: (event) => resources.push(event) }));
  expect(visual.frames.length).toBeGreaterThan(0);
  const directory = join(process.cwd(), "artifacts", "visual-verification");
  await mkdir(directory, { recursive: true });
  for (const frame of visual.frames) await writeFile(join(directory, `${frame.id}.jpg`), Buffer.from(frame.image.split(",")[1], "base64"));
  await writeFile(join(directory, "capture.json"), JSON.stringify(visual));
  await writeFile(join(directory, "resources.json"), JSON.stringify(resources, null, 2));
  console.log(JSON.stringify({ frames: visual.frames.length, truncated: visual.truncated, pixels: visual.frames.map(({ width, height }) => [width, height]) }));
}, 60_000);

it.runIf(process.env.VERIFY_VISUAL_GEMINI === "1")("reads actual image claims from the saved LG screen capture", async () => {
  process.loadEnvFile(".env.local");
  const config = getGeminiConfig();
  expect(config.apiKey).toBeTruthy();
  const directory = join(process.cwd(), "artifacts", "visual-verification");
  const visual = PageVisualSchema.parse(JSON.parse(await readFile(join(directory, "capture.json"), "utf8")));
  const url = "https://www.lge.co.kr/benefits/exhibitions/detail-PE01036002?eventCode=bfdotexnmnaver";
  const page = extractPage((await fetchPublicPage(new URL(url))).html);
  const { data } = await generateJson(createGeminiPort(config.apiKey!, config.model), {
    system: claimsSystemPrompt(),
    input: claimsInput({ url, pageText: page.text, pageTitle: page.title, useUrlContext: false, nonce: "manual-verification", visual: true }),
    images: visual.frames.map((frame) => ({ label: frame.id, data: frame.image.split(",")[1], mimeType: "image/jpeg" })),
    timeoutMs: 90_000,
  }, VisualClaimExtractionSchema);
  await writeFile(join(directory, "claims.json"), JSON.stringify(data, null, 2));
  expect(data.pageReadable).toBe(true);
  expect(data.claims.some((claim) => claim.visualRegion)).toBe(true);
}, 120_000);
