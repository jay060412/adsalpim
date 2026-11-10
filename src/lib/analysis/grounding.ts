import { parsePublicHttpUrl } from "@/lib/security/ssrf";

/** 우선 참고 기관 (도메인 → 기관명). 하위 도메인도 같은 기관으로 본다. */
const PRIORITY_ORGANIZATIONS: Record<string, string> = {
  "ftc.go.kr": "공정거래위원회",
  "mfds.go.kr": "식품의약품안전처",
  "kca.go.kr": "한국소비자원",
  "foodsafetykorea.go.kr": "식품안전나라",
  "law.go.kr": "국가법령정보센터",
};

const OTHER_OFFICIAL_ORGANIZATIONS: Record<string, string> = {
  "consumer.go.kr": "소비자24",
  "korea.kr": "대한민국 정책브리핑",
  "moleg.go.kr": "법제처",
  "mohw.go.kr": "보건복지부",
  "kdca.go.kr": "질병관리청",
  "fss.or.kr": "금융감독원",
  "fsc.go.kr": "금융위원회",
  "kisa.or.kr": "한국인터넷진흥원",
  "scourt.go.kr": "대법원",
  "who.int": "세계보건기구(WHO)",
  "fda.gov": "미국 식품의약국(FDA)",
  "nih.gov": "미국 국립보건원(NIH)",
};

const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";
const MAX_SOURCES = 15;

function matchDomain(domain: string, table: Record<string, string>): string | undefined {
  for (const [suffix, name] of Object.entries(table)) {
    if (domain === suffix || domain.endsWith(`.${suffix}`)) return name;
  }
  return undefined;
}

export function describeDomain(domain: string): {
  organization: string | null;
  isOfficial: boolean;
  isPriority: boolean;
} {
  const priority = matchDomain(domain, PRIORITY_ORGANIZATIONS);
  if (priority) return { organization: priority, isOfficial: true, isPriority: true };

  const official = matchDomain(domain, OTHER_OFFICIAL_ORGANIZATIONS);
  if (official) return { organization: official, isOfficial: true, isPriority: false };

  const isGovernment = /\.go\.kr$|\.gov$/.test(domain);
  return { organization: null, isOfficial: isGovernment, isPriority: false };
}

/* ------------------------------------------------------------------ */
/* 검색 응답 → 주장별 본문 + 인용 위치                                   */
/* ------------------------------------------------------------------ */

export interface TextBlock {
  text: string;
  citations: { url: string; title: string; startIndex: number }[];
}

export interface RawCitation {
  url: string;
  title: string;
  /** 인용이 속한 구역: 주장 ID(C1…) 또는 "LAW", 구역 밖이면 null */
  section: string | null;
}

export interface ParsedVerification {
  /** 전체 검증 본문 */
  text: string;
  /** 구역 ID → 해당 구역 본문 */
  sections: Record<string, string>;
  citations: RawCitation[];
}

const SECTION_HEADING = /^[ \t]*#{1,6}[ \t]*\[?(C\d+|LAW)\]?/gim;

/**
 * Google 검색 그라운딩 응답을 주장별 구역으로 나누고,
 * 각 인용(url_citation)이 어느 구역의 문장을 뒷받침하는지 위치로 판정한다.
 * 인용 위치는 UTF-8 바이트 단위로 제공되므로 바이트 오프셋으로 비교한다.
 */
export function parseVerification(blocks: TextBlock[]): ParsedVerification {
  const text = blocks.map((block) => block.text).join("");
  const totalBytes = Buffer.byteLength(text, "utf8");

  const headings: { id: string; charIndex: number; byteIndex: number }[] = [];
  for (const match of text.matchAll(SECTION_HEADING)) {
    headings.push({
      id: match[1].toUpperCase(),
      charIndex: match.index,
      byteIndex: Buffer.byteLength(text.slice(0, match.index), "utf8"),
    });
  }

  const sections: Record<string, string> = {};
  headings.forEach((heading, i) => {
    const end = headings[i + 1]?.charIndex ?? text.length;
    const body = text.slice(heading.charIndex, end).replace(/^[^\n]*\n?/, "").trim();
    sections[heading.id] = sections[heading.id] ? `${sections[heading.id]}\n${body}` : body;
  });

  const sectionAt = (byteIndex: number): string | null => {
    let found: string | null = null;
    for (const heading of headings) {
      if (heading.byteIndex <= byteIndex) found = heading.id;
      else break;
    }
    return found;
  };

  const citations: RawCitation[] = [];
  let blockStart = 0;
  for (const block of blocks) {
    const blockBytes = Buffer.byteLength(block.text, "utf8");
    for (const citation of block.citations) {
      // 인덱스가 블록 기준인지 전체 응답 기준인지 문서가 명확하지 않아 두 경우를 모두 수용한다.
      const position =
        citation.startIndex <= blockBytes
          ? blockStart + citation.startIndex
          : Math.min(citation.startIndex, totalBytes);
      citations.push({ url: citation.url, title: citation.title, section: sectionAt(position) });
    }
    blockStart += blockBytes;
  }

  return { text, sections, citations };
}

/* ------------------------------------------------------------------ */
/* 인용 → 화면에 보여 줄 출처 목록                                       */
/* ------------------------------------------------------------------ */

export interface GroundedSource {
  id: string;
  url: string;
  title: string;
  domain: string;
  organization: string;
  isOfficial: boolean;
  isPriority: boolean;
  claimIds: string[];
}

export type RedirectResolver = (url: string) => Promise<string | null>;

/**
 * Google 그라운딩 리다이렉트 링크의 실제 목적지를 알아낸다.
 * 호스트가 고정된 Google 주소에만 요청하고, 목적지로는 이동하지 않고 Location만 읽는다.
 */
export const resolveGroundingRedirect: RedirectResolver = async (url) => {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(4_000),
    });
    await res.body?.cancel().catch(() => undefined);
    return res.headers.get("location");
  } catch {
    return null;
  }
};

function publicUrlOrNull(raw: string): URL | null {
  try {
    return parsePublicHttpUrl(raw);
  } catch {
    return null;
  }
}

function looksLikeDomain(value: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value.trim());
}

/**
 * 실제 검색 결과에서 나온 인용만으로 출처 목록을 만든다.
 * 모델이 본문에 적은 URL은 사용하지 않는다.
 */
export async function buildSources(
  citations: RawCitation[],
  resolveRedirect: RedirectResolver = resolveGroundingRedirect,
): Promise<GroundedSource[]> {
  const resolved = await Promise.all(
    citations.map(async (citation) => {
      const original = publicUrlOrNull(citation.url);
      if (!original) return null;

      let url = original;
      let domain = original.hostname.replace(/^www\./, "");

      if (original.hostname === GROUNDING_REDIRECT_HOST) {
        const location = await resolveRedirect(original.toString());
        const target = location ? publicUrlOrNull(location) : null;
        if (target) {
          url = target;
          domain = target.hostname.replace(/^www\./, "");
        } else if (looksLikeDomain(citation.title)) {
          // 목적지를 확인하지 못하면 링크는 Google 리다이렉트 그대로 두고, 표시용 도메인만 제목에서 가져온다.
          domain = citation.title.trim().toLowerCase().replace(/^www\./, "");
        }
      }

      return { url: url.toString(), domain, title: citation.title.trim(), section: citation.section };
    }),
  );

  const byUrl = new Map<string, GroundedSource>();
  for (const item of resolved) {
    if (!item) continue;
    let source = byUrl.get(item.url);
    if (!source) {
      const info = describeDomain(item.domain);
      source = {
        id: "",
        url: item.url,
        title: item.title || item.domain,
        domain: item.domain,
        organization: info.organization ?? item.domain,
        isOfficial: info.isOfficial,
        isPriority: info.isPriority,
        claimIds: [],
      };
      byUrl.set(item.url, source);
    }
    if (item.section && item.section !== "LAW" && !source.claimIds.includes(item.section)) {
      source.claimIds.push(item.section);
    }
  }

  const rank = (source: GroundedSource) => (source.isPriority ? 0 : source.isOfficial ? 1 : 2);
  return [...byUrl.values()]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_SOURCES)
    .map((source, index) => ({ ...source, id: `S${index + 1}` }));
}
