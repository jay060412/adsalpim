import { ExternalLink, Landmark } from "lucide-react";
import type { Claim, Source } from "@/lib/analysis/schema";

export function SourceList({ sources, claims }: { sources: Source[]; claims: Claim[] }) {
  const numberOf = new Map(claims.map((claim, index) => [claim.id, index + 1]));

  return (
    <section aria-labelledby="sources-title">
      <h2 id="sources-title" className="text-xl font-bold tracking-tight">
        검증 출처
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        Google 검색 결과에서 실제로 확인된 자료만 표시해요. 링크를 열어 내용을 직접 확인해 보세요.
      </p>

      {sources.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-[0.9375rem] leading-7 text-muted-foreground">
          이번 분석에서는 인용할 수 있는 검색 출처를 확보하지 못했어요. 그래서 어떤 주장도 ‘근거
          확인’이나 ‘사실 불일치’로 판정하지 않았어요.
        </p>
      ) : (
        <ol className="mt-5 grid gap-3 md:grid-cols-2">
          {sources.map((source) => {
            const related = source.claimIds.map((id) => numberOf.get(id)).filter(Boolean);
            return (
              <li
                key={source.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card print:shadow-none"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground tabular-nums">
                    {source.id}
                  </span>
                  <span className="text-[0.9375rem] font-bold">{source.organization}</span>
                  {source.isOfficial && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                      <Landmark aria-hidden="true" className="size-3" />
                      공공기관
                    </span>
                  )}
                </div>

                <p className="mt-2.5 text-[0.9375rem] leading-6 font-medium [overflow-wrap:anywhere]">
                  {source.title}
                </p>

                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-1.5 inline-flex items-start gap-1.5 font-mono text-[0.8125rem] leading-5 text-primary underline-offset-4 [overflow-wrap:anywhere] hover:underline"
                >
                  <ExternalLink aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span className="line-clamp-2 print:line-clamp-none">{source.url}</span>
                  <span className="sr-only">(새 창에서 열림)</span>
                </a>

                <dl className="mt-auto flex flex-wrap gap-x-5 gap-y-1 pt-4 text-[0.8125rem] text-muted-foreground">
                  {source.publishedAt && (
                    <div className="flex gap-1.5">
                      <dt>발행일</dt>
                      <dd className="font-medium text-foreground/80 tabular-nums">{source.publishedAt}</dd>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <dt>관련 주장</dt>
                    <dd className="font-medium text-foreground/80">
                      {related.length > 0
                        ? related.map((number) => `주장 ${number}`).join(", ")
                        : "관련 법령·기준 (전체)"}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
