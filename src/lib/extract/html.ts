import * as cheerio from "cheerio";

/** Gemini에 넘기고 화면에 보여 줄 본문의 최대 길이 */
export const MAX_PAGE_TEXT_CHARS = 24_000;

export interface ExtractedPage {
  title: string;
  description: string;
  text: string;
  /** 본문이 MAX_PAGE_TEXT_CHARS에서 잘렸는지 */
  truncated: boolean;
}

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "object",
  "embed",
  "head",
  "nav",
  "select",
  "option",
  "button",
  "input",
  "textarea",
  "audio",
  "video",
  "map",
]);

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tr",
  "ul",
]);

// 화면에 보이지 않는 요소는 소비자가 읽는 광고 내용이 아니며, 숨겨진 프롬프트 인젝션 통로가 될 수 있다.
const HIDDEN_STYLE =
  /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|pt|em|rem|%)?\s*(?:;|$)|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$))/i;

/** cheerio(domhandler) 노드에서 본문 추출에 필요한 부분만 본 모양 */
interface DomNode {
  type: string;
  data?: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

function isHidden(attribs: Record<string, string>): boolean {
  if ("hidden" in attribs) return true;
  if (attribs["aria-hidden"] === "true") return true;
  return Boolean(attribs.style && HIDDEN_STYLE.test(attribs.style));
}

function collectText(node: DomNode, out: string[]): void {
  if (node.type === "text") {
    out.push(node.data ?? "");
    return;
  }
  if (node.type !== "tag" || !node.name) return;

  const name = node.name.toLowerCase();
  const attribs = node.attribs ?? {};
  if (SKIP_TAGS.has(name) || isHidden(attribs)) return;

  if (name === "img") {
    const alt = attribs.alt?.trim();
    // 상세페이지 이미지의 대체 텍스트에는 광고 문구가 들어 있는 경우가 많다.
    if (alt && alt.length >= 10) out.push(`\n${alt}\n`);
    return;
  }

  const isBlock = BLOCK_TAGS.has(name);
  if (isBlock) out.push("\n");
  else if (name === "td" || name === "th") out.push(" ");
  for (const child of node.children ?? []) collectText(child, out);
  if (isBlock) out.push("\n");
}

function normalizeLines(raw: string): string[] {
  const lines: string[] = [];
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.replace(/[\s ​-‍﻿]+/g, " ").trim();
    if (!line || line === lines[lines.length - 1]) continue;
    lines.push(line);
  }
  return lines;
}

/** JSON-LD에 들어 있는 상품명·설명 (본문이 스크립트로 그려지는 상세페이지 대비) */
function structuredDataLines($: cheerio.CheerioAPI): string[] {
  const lines: string[] = [];

  const visit = (value: unknown, depth: number): void => {
    if (!value || typeof value !== "object" || depth > 4) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    const type = String(record["@type"] ?? "");
    if (/Product|Offer|Service|Course/i.test(type)) {
      for (const key of ["name", "description"]) {
        const text = record[key];
        if (typeof text === "string" && text.trim()) lines.push(text.trim());
      }
    }
    visit(record["@graph"], depth + 1);
  };

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      visit(JSON.parse($(element).text()), 0);
    } catch {
      // 잘못된 JSON-LD는 무시한다.
    }
  });
  return lines;
}

function metaContent($: cheerio.CheerioAPI, selectors: string[]): string {
  for (const selector of selectors) {
    const value = $(selector).attr("content")?.replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return "";
}

/**
 * HTML에서 사람이 읽는 본문 텍스트만 뽑아낸다.
 * 스크립트·스타일·숨김 요소·주석은 버리고, 블록 요소 단위로 줄을 나눈다.
 * 결과는 항상 일반 텍스트이며 HTML로 다시 렌더링되지 않는다.
 */
export function extractPage(html: string): ExtractedPage {
  const $ = cheerio.load(html);

  const title =
    metaContent($, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    $("title").first().text().replace(/\s+/g, " ").trim() ||
    $("h1").first().text().replace(/\s+/g, " ").trim();

  const description = metaContent($, [
    'meta[name="description"]',
    'meta[property="og:description"]',
  ]);

  const parts: string[] = [];
  const body = $("body").get(0);
  if (body) collectText(body as unknown as DomNode, parts);

  const lines = normalizeLines(
    [description, ...structuredDataLines($)].join("\n") + "\n" + parts.join(""),
  );

  // 메타 설명·JSON-LD가 본문과 겹치면 한 번만 남긴다.
  const seen = new Set<string>();
  const unique = lines.filter((line) => {
    if (line.length < 20) return true;
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  });

  let text = unique.join("\n");
  let truncated = false;
  if (text.length > MAX_PAGE_TEXT_CHARS) {
    const cut = text.lastIndexOf("\n", MAX_PAGE_TEXT_CHARS);
    text = text.slice(0, cut > MAX_PAGE_TEXT_CHARS * 0.8 ? cut : MAX_PAGE_TEXT_CHARS);
    truncated = true;
  }

  return { title, description, text, truncated };
}
