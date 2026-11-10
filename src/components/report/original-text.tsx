"use client";

import { MousePointerClick } from "lucide-react";
import { useMemo } from "react";
import { STATUS_LABELS } from "@/lib/analysis/labels";
import type { Claim } from "@/lib/analysis/schema";
import { buildSegments } from "@/lib/analysis/segments";
import { cn } from "@/lib/utils";

/**
 * 서버가 수집한 광고 원문. AI가 짚은 문구를 상태 색으로 하이라이트하고,
 * 누르면 해당 분석 카드로 이동한다. 원문은 항상 일반 텍스트로만 렌더링한다.
 */
export function OriginalText({
  text,
  truncated,
  claims,
  selectedId,
  onSelect,
}: {
  text: string;
  truncated: boolean;
  claims: Claim[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const segments = useMemo(() => buildSegments(text, claims), [text, claims]);
  const numberOf = useMemo(
    () => new Map(claims.map((claim, index) => [claim.id, index + 1])),
    [claims],
  );

  // 하이라이트가 위에서부터 차례로 그어지도록 등장 순서를 매긴다.
  const markOrder = useMemo(() => {
    const order = new Map<number, number>();
    for (const [index, segment] of segments.entries()) {
      if (segment.kind === "claim") order.set(index, order.size);
    }
    return order;
  }, [segments]);

  return (
    <section
      aria-labelledby="original-text-title"
      className="flex max-h-[32rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:max-h-[calc(100dvh-7.5rem)] print:shadow-none"
      data-print-expand
    >
      <header className="border-b border-border px-5 py-4">
        <h2 id="original-text-title" className="text-base font-bold tracking-tight">
          광고 원문
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground print:hidden">
          <MousePointerClick aria-hidden="true" className="size-3.5" />
          표시된 문구를 누르면 분석 카드로 이동해요.
        </p>
      </header>

      <div
        className="overflow-y-auto overscroll-contain px-5 py-4"
        data-print-expand
        tabIndex={0}
        role="region"
        aria-label="광고 원문 본문"
      >
        <p className="text-[0.9375rem] leading-8 whitespace-pre-line text-foreground/80 [overflow-wrap:anywhere]">
          {segments.map((segment, index) => {
            if (segment.kind === "text") return <span key={index}>{segment.text}</span>;

            const { claim } = segment;
            const number = numberOf.get(claim.id);
            const selected = claim.id === selectedId;
            const delay = Math.min(markOrder.get(index) ?? 0, 8) * 0.12 + 0.3;

            return (
              <mark
                key={index}
                id={`mark-${claim.id}`}
                role="button"
                tabIndex={0}
                data-status={claim.verificationStatus}
                aria-label={`주장 ${number}, ${STATUS_LABELS[claim.verificationStatus]}: ${segment.text}. 분석 카드로 이동`}
                aria-pressed={selected}
                onClick={() => onSelect(claim.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(claim.id);
                  }
                }}
                style={{ animationDelay: `${delay}s` }}
                className={cn(
                  "claim-mark animate-highlight-in cursor-pointer scroll-mt-4 font-medium hover:shadow-[0_0_0_2px_var(--status-border)]",
                  selected && "shadow-[0_0_0_2px_var(--status-solid)]",
                )}
              >
                {segment.text}
                <sup className="ml-0.5 font-bold text-(--status-fg) select-none">{number}</sup>
              </mark>
            );
          })}
        </p>

        {truncated && (
          <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-[0.8125rem] text-muted-foreground">
            본문이 길어 앞부분만 표시했어요.
          </p>
        )}
      </div>
    </section>
  );
}
