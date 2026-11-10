import { describe, expect, it } from "vitest";
import { buildSources, describeDomain, parseVerification, type TextBlock } from "../grounding";

/** text 안에서 marker가 시작하는 UTF-8 바이트 위치 */
const byteIndexOf = (text: string, marker: string) =>
  Buffer.byteLength(text.slice(0, text.indexOf(marker)), "utf8");

const text = `### C1
- 확인된 사실: 식품의약품안전처는 체지방 감소 기능성을 인정한 원료 목록을 공개하고 있습니다.
- 주장과의 비교: 일부만 뒷받침함

### C2
- 확인된 사실: 확인된 자료 없음

### LAW
- 「식품 등의 표시·광고에 관한 법률」 제8조는 부당한 표시·광고를 금지합니다.
`;

describe("parseVerification", () => {
  const block: TextBlock = {
    text,
    citations: [
      { url: "https://www.mfds.go.kr/a", title: "mfds.go.kr", startIndex: byteIndexOf(text, "식품의약품안전처는") },
      { url: "https://www.law.go.kr/b", title: "law.go.kr", startIndex: byteIndexOf(text, "「식품 등의") },
    ],
  };
  const parsed = parseVerification([block]);

  it("splits the answer into per-claim sections", () => {
    expect(Object.keys(parsed.sections)).toEqual(["C1", "C2", "LAW"]);
    expect(parsed.sections.C1).toContain("체지방 감소 기능성");
    expect(parsed.sections.C1).not.toContain("###");
    expect(parsed.sections.C2).toContain("확인된 자료 없음");
  });

  it("assigns citations to sections by UTF-8 byte offset", () => {
    expect(parsed.citations.map((citation) => citation.section)).toEqual(["C1", "LAW"]);
  });

  it("handles answers split across several text blocks", () => {
    const cut = text.indexOf("### C2");
    const second = text.slice(cut);
    const result = parseVerification([
      { text: text.slice(0, cut), citations: [] },
      {
        text: second,
        citations: [
          { url: "https://www.law.go.kr/b", title: "law", startIndex: byteIndexOf(second, "「식품 등의") },
        ],
      },
    ]);
    expect(result.citations[0].section).toBe("LAW");
  });

  it("leaves citations outside any section unassigned", () => {
    const result = parseVerification([
      { text: "서론입니다.\n### C1\n내용", citations: [{ url: "https://a.example.com", title: "", startIndex: 0 }] },
    ]);
    expect(result.citations[0].section).toBeNull();
  });
});

describe("describeDomain", () => {
  it("recognises priority institutions, including subdomains", () => {
    expect(describeDomain("mfds.go.kr")).toMatchObject({ organization: "식품의약품안전처", isPriority: true });
    expect(describeDomain("nedrug.mfds.go.kr")).toMatchObject({ organization: "식품의약품안전처" });
    expect(describeDomain("law.go.kr").organization).toBe("국가법령정보센터");
  });

  it("treats other government domains as official and the rest as unofficial", () => {
    expect(describeDomain("seoul.go.kr")).toEqual({ organization: null, isOfficial: true, isPriority: false });
    expect(describeDomain("blog.example.com").isOfficial).toBe(false);
    // 접미사만 비슷한 도메인은 공식 기관으로 보지 않는다.
    expect(describeDomain("fakemfds.go.kr.example.com").isOfficial).toBe(false);
  });
});

describe("buildSources", () => {
  const noRedirect = async () => null;

  it("dedupes by URL, merges claim links and lists official sources first", async () => {
    const sources = await buildSources(
      [
        { url: "https://blog.example.com/review", title: "후기", section: "C1" },
        { url: "https://www.mfds.go.kr/a", title: "기능성 원료 목록", section: "C1" },
        { url: "https://www.mfds.go.kr/a", title: "기능성 원료 목록", section: "C2" },
        { url: "https://www.law.go.kr/b", title: "식품표시광고법", section: "LAW" },
      ],
      noRedirect,
    );

    expect(sources.map((source) => source.id)).toEqual(["S1", "S2", "S3"]);
    expect(sources[0]).toMatchObject({
      url: "https://www.mfds.go.kr/a",
      organization: "식품의약품안전처",
      domain: "mfds.go.kr",
      isOfficial: true,
      claimIds: ["C1", "C2"],
    });
    expect(sources[1]).toMatchObject({ organization: "국가법령정보센터", claimIds: [] });
    expect(sources[2]).toMatchObject({ domain: "blog.example.com", isOfficial: false });
  });

  it("drops citations that are not public http(s) URLs", async () => {
    const sources = await buildSources(
      [
        { url: "javascript:alert(1)", title: "x", section: "C1" },
        { url: "http://127.0.0.1/admin", title: "x", section: "C1" },
        { url: "http://169.254.169.254/", title: "x", section: "C1" },
        { url: "not a url", title: "x", section: "C1" },
      ],
      noRedirect,
    );
    expect(sources).toEqual([]);
  });

  it("resolves Google grounding redirect links to the real destination", async () => {
    const redirectUrl = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
    const sources = await buildSources(
      [{ url: redirectUrl, title: "kca.go.kr", section: "C1" }],
      async (url) => (url === redirectUrl ? "https://www.kca.go.kr/report/1" : null),
    );
    expect(sources[0]).toMatchObject({
      url: "https://www.kca.go.kr/report/1",
      organization: "한국소비자원",
      isOfficial: true,
    });
  });

  it("keeps the redirect link but shows the cited domain when resolution fails", async () => {
    const redirectUrl = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
    const sources = await buildSources([{ url: redirectUrl, title: "ftc.go.kr", section: "C1" }], noRedirect);
    expect(sources[0]).toMatchObject({ url: redirectUrl, domain: "ftc.go.kr", organization: "공정거래위원회" });
  });

  it("ignores a redirect that points at a private address", async () => {
    const redirectUrl = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
    const sources = await buildSources(
      [{ url: redirectUrl, title: "example.com", section: "C1" }],
      async () => "http://10.0.0.1/secret",
    );
    expect(sources[0].url).toBe(redirectUrl);
  });
});
