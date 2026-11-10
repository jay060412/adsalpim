"use client";

import { BadgeCheck, ChevronDown, ExternalLink, ListChecks, Scale, TextSearch } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { StatusBadge } from "@/components/status-badge";
import { CATEGORY_LABELS } from "@/lib/analysis/labels";
import type { Claim, Source } from "@/lib/analysis/schema";
import { cn } from "@/lib/utils";

function DetailBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ListChecks;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-foreground/80">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        {title}
      </h4>
      <div className="mt-1.5 text-[0.9375rem] leading-7 text-foreground/90">{children}</div>
    </div>
  );
}

export function ClaimCard({
  claim,
  index,
  sources,
  selected,
  expanded,
  instant,
  onToggle,
  onLocate,
}: {
  claim: Claim;
  index: number;
  sources: Source[];
  selected: boolean;
  expanded: boolean;
  /** 인쇄처럼 애니메이션 없이 바로 펼쳐야 할 때 */
  instant: boolean;
  onToggle: () => void;
  /** 원문에서 이 문구의 위치로 이동 */
  onLocate?: () => void;
}) {
  const detailsId = `claim-${claim.id}-details`;

  return (
    <motion.article
      id={`claim-${claim.id}`}
      data-status={claim.verificationStatus}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-2xl border bg-card shadow-card transition-[border-color,box-shadow] duration-300 print:shadow-none",
        selected
          ? "border-(--status-solid) ring-4 ring-(--status-border)/50"
          : "border-border hover:border-(--status-border)",
      )}
    >
      {/* 상태 색 띠: 배지의 아이콘·글자를 보조하는 장식 */}
      <div aria-hidden="true" className="h-1 bg-(--status-solid) transition-colors duration-300" />

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.8125rem] font-bold text-muted-foreground tabular-nums">
            주장 {index + 1}
          </span>
          <StatusBadge status={claim.verificationStatus} />
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {CATEGORY_LABELS[claim.category]}
          </span>
          {claim.sourceType === "image" && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">이미지에서 읽은 문구</span>
          )}
          {!claim.quoteVerified && claim.sourceType !== "image" && (
            <span className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              원문 대조 불가
            </span>
          )}
        </div>

        <blockquote className="mt-4 border-l-[3px] border-(--status-solid) pl-4 transition-colors duration-300">
          <p className="text-xs font-semibold text-muted-foreground">광고 원문</p>
          <p className="mt-1 text-[1.0625rem] leading-7 font-semibold [overflow-wrap:anywhere]">
            “{claim.originalText}”
          </p>
        </blockquote>

        <div className="mt-4">
          <h4 className="text-[0.8125rem] font-semibold text-foreground/80">문제가 될 수 있는 이유</h4>
          <p className="mt-1 text-[0.9375rem] leading-7 text-foreground/90">{claim.concern}</p>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="details"
              id={detailsId}
              initial={instant ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={instant ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-5 space-y-5 border-t border-border pt-5">
                <DetailBlock icon={TextSearch} title="AI 분석 설명">
                  <p>{claim.explanation}</p>
                </DetailBlock>

                <DetailBlock icon={BadgeCheck} title="확인된 객관적 근거">
                  {claim.evidenceSummary ? (
                    <p>{claim.evidenceSummary}</p>
                  ) : (
                    <p className="text-muted-foreground">
                      검색에서 이 주장을 뒷받침하거나 반박하는 객관적 근거를 확인하지 못했어요.
                    </p>
                  )}
                  {sources.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {sources.map((source) => (
                        <li key={source.id}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="group/source flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm leading-6 transition-colors duration-200 hover:border-primary/40"
                          >
                            <span className="mt-0.5 shrink-0 rounded-md bg-muted px-1.5 text-xs font-bold text-muted-foreground tabular-nums">
                              {source.id}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="font-semibold">{source.organization}</span>
                              <span className="block text-muted-foreground [overflow-wrap:anywhere]">
                                {source.title}
                              </span>
                            </span>
                            <ExternalLink
                              aria-hidden="true"
                              className="mt-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover/source:text-primary"
                            />
                            <span className="sr-only">(새 창에서 열림)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">연결된 출처가 없어요.</p>
                  )}
                </DetailBlock>

                <DetailBlock icon={ListChecks} title="추가 확인이 필요한 사항">
                  <p>{claim.recommendedAction}</p>
                </DetailBlock>

                {claim.legalNote && (
                  <DetailBlock icon={Scale} title="법령 관련 유의점">
                    <p>{claim.legalNote}</p>
                    <p className="mt-1 text-[0.8125rem] leading-6 text-muted-foreground">
                      검증 상태와는 별개의 참고 정보이며, 법률 위반 여부를 판정하지 않습니다.
                    </p>
                  </DetailBlock>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary/[0.07]"
          >
            {expanded ? "상세 분석 접기" : "상세 분석 보기"}
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4 transition-transform duration-300", expanded && "rotate-180")}
            />
          </button>

          {onLocate && (
            <button
              type="button"
              onClick={onLocate}
              className="rounded-lg px-2 py-1.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
            >
              {claim.visualRegion ? "광고 화면에서 위치 보기" : "원문에서 위치 보기"}
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}
