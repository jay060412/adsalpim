"use client";

import {
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Info,
  Plus,
  Printer,
  Scale,
  Search,
  Tag,
} from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { STATUS_ICONS } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { VERIFICATION_STATUSES } from "@/lib/analysis/constants";
import { CONTENT_SOURCE_LABELS, PRODUCT_TYPE_LABELS, STATUS_LABELS } from "@/lib/analysis/labels";
import {
  buildHeadline,
  buildReportText,
  countByStatus,
  formatAnalyzedAt,
  LEGAL_DISCLAIMER,
  OUTCOME_LABELS,
} from "@/lib/analysis/report-text";
import type { AnalysisResult } from "@/lib/analysis/schema";
import { cn } from "@/lib/utils";
import { ClaimCard } from "./claim-card";
import { OriginalText } from "./original-text";
import { PagePreview } from "./page-preview";
import { SourceList } from "./source-list";

const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 클립보드 API를 쓸 수 없는 환경(권한 거부, 비보안 컨텍스트)을 위한 대체 경로
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function MetaItem({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Globe;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1 text-[0.9375rem] font-medium [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function ReportView({ result, onReset }: { result: AnalysisResult; onReset: () => void }) {
  const reduceMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(result.claims.slice(0, 1).map((claim) => claim.id)),
  );
  const [printing, setPrinting] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  // 이동할 요소. 같은 요소를 다시 눌러도 이동하도록 매번 새 객체로 바꾼다.
  const [scrollTarget, setScrollTarget] = useState<{ elementId: string; delay: number } | null>(
    null,
  );

  const counts = useMemo(() => countByStatus(result.claims), [result.claims]);
  const sourceById = useMemo(
    () => new Map(result.sources.map((source) => [source.id, source])),
    [result.sources],
  );
  const officialCount = result.sources.filter((source) => source.isOfficial).length;
  const hasMarks = Boolean(result.pageText) && result.claims.some((claim) => claim.position);
  const scrollBehavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";

  // 결과 화면으로 바뀌면 스크린리더가 보고서 제목부터 읽도록 한다.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  // 브라우저 메뉴나 단축키로 인쇄할 때도 모든 카드를 펼치고, 인쇄물은 밝은 테마로 맞춘다.
  useEffect(() => {
    let previousTheme: string | null = null;
    const before = () => {
      previousTheme = document.documentElement.getAttribute("data-theme");
      document.documentElement.setAttribute("data-theme", "light");
      flushSync(() => setPrinting(true));
    };
    const after = () => {
      if (previousTheme) document.documentElement.setAttribute("data-theme", previousTheme);
      setPrinting(false);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 선택 상태가 화면에 반영된 뒤에 해당 요소로 이동한다.
  useEffect(() => {
    if (!scrollTarget) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(scrollTarget.elementId)
        ?.scrollIntoView({ behavior: scrollBehavior, block: "center" });
    }, scrollTarget.delay);
    return () => window.clearTimeout(timer);
  }, [scrollTarget, scrollBehavior]);

  /** 원문 하이라이트를 눌렀을 때: 해당 카드를 펼치고 그 위치로 이동 */
  function showClaim(id: string) {
    const opening = !expanded.has(id);
    setSelectedId(id);
    if (opening) setExpanded((current) => new Set(current).add(id));
    // 펼침 애니메이션 도중에 스크롤을 시작하면 브라우저가 스크롤을 취소하므로, 펼쳐진 뒤에 이동한다.
    setScrollTarget({ elementId: `claim-${id}`, delay: opening && !reduceMotion ? 340 : 0 });
  }

  /** 카드에서 "원문에서 위치 보기"를 눌렀을 때 */
  function locateInText(id: string) {
    setSelectedId(id);
    const claim = result.claims.find((item) => item.id === id);
    if (!claim?.visualRegion) {
      const details = document.getElementById("text-original-details");
      if (details instanceof HTMLDetailsElement) details.open = true;
    }
    setScrollTarget({ elementId: result.visual && claim?.visualRegion ? `screen-mark-${id}` : `mark-${id}`, delay: 0 });
  }

  async function handleCopy() {
    const ok = await copyText(buildReportText(result));
    setCopyState(ok ? "copied" : "failed");
    window.setTimeout(() => setCopyState("idle"), 2200);
  }

  const claimCards = (
    <motion.ol variants={list} initial="hidden" animate="show" className="space-y-4">
      {result.claims.map((claim, index) => (
        <motion.li key={claim.id} variants={item}>
          <ClaimCard
            claim={claim}
            index={index}
            sources={claim.sourceIds.flatMap((id) => sourceById.get(id) ?? [])}
            selected={selectedId === claim.id}
            expanded={printing || expanded.has(claim.id)}
            instant={printing}
            onToggle={() => toggle(claim.id)}
            onLocate={(result.visual && claim.visualRegion) || (hasMarks && claim.position) ? () => locateInText(claim.id) : undefined}
          />
        </motion.li>
      ))}
    </motion.ol>
  );

  return (
    <motion.div
      variants={list}
      initial="hidden"
      animate="show"
      className="space-y-6 py-8 sm:space-y-8 sm:py-12"
    >
      {result.mock && (
        <motion.p
          variants={item}
          role="note"
          className="flex items-start gap-2.5 rounded-2xl border-2 border-dashed border-amber-500/70 bg-amber-500/10 px-5 py-4 text-[0.9375rem] leading-7 font-semibold"
        >
          <Info aria-hidden="true" className="mt-1 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          테스트용 모의 데이터입니다. 실제 광고 페이지를 읽거나 Gemini로 분석한 결과가 아니며, 화면
          확인을 위한 가상의 내용입니다.
        </motion.p>
      )}

      {/* 기본 정보 + 결과 기능 */}
      <motion.header
        variants={item}
        className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8 print:border-0 print:p-0 print:shadow-none"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <FileText aria-hidden="true" className="size-4" />
              광고살핌 분석 보고서
            </p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 text-2xl leading-snug font-bold tracking-tight [overflow-wrap:anywhere] outline-none sm:text-[1.75rem]"
            >
              {result.title}
            </h1>
            <a
              href={result.finalUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-2 block font-mono text-[0.8125rem] leading-5 text-muted-foreground underline-offset-4 [overflow-wrap:anywhere] hover:text-primary hover:underline"
            >
              {result.finalUrl}
            </a>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:max-w-[24rem] lg:justify-end print:hidden">
            <button type="button" onClick={onReset} className={buttonVariants({ size: "lg" })}>
              <Plus aria-hidden="true" />새 광고 분석하기
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              <span aria-live="polite">
                {copyState === "copied"
                  ? "복사했어요"
                  : copyState === "failed"
                    ? "복사하지 못했어요"
                    : "결과 복사하기"}
              </span>
            </button>
            <a
              href={result.finalUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <ExternalLink aria-hidden="true" />
              원본 광고 열기
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Printer aria-hidden="true" />
              인쇄하기
            </button>
          </div>
        </div>

        <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-6 md:grid-cols-4">
          <MetaItem icon={Globe} label="웹사이트 도메인">
            {result.domain}
          </MetaItem>
          <MetaItem icon={CalendarClock} label="분석 일시">
            <time dateTime={result.analyzedAt}>{formatAnalyzedAt(result.analyzedAt)}</time>
          </MetaItem>
          <MetaItem icon={Tag} label="광고 유형">
            {PRODUCT_TYPE_LABELS[result.category]}
          </MetaItem>
          <MetaItem icon={Info} label="분석 상태">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full",
                  result.outcome === "partial" ? "bg-amber-500" : "bg-mint",
                )}
              />
              {OUTCOME_LABELS[result.outcome]}
            </span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              본문 수집: {CONTENT_SOURCE_LABELS[result.contentSource]}
            </span>
          </MetaItem>
        </dl>
      </motion.header>

      {/* 종합 분석 결과 */}
      <motion.section
        variants={item}
        aria-labelledby="summary-title"
        className="rounded-3xl border border-border bg-surface p-6 sm:p-8"
      >
        <h2 id="summary-title" className="text-sm font-semibold text-primary">
          종합 분석 결과
        </h2>
        <p className="mt-2 text-xl leading-snug font-bold tracking-tight sm:text-2xl">
          {buildHeadline(result.claims)}
        </p>
        <p className="mt-3 max-w-3xl text-[0.9375rem] leading-7 text-foreground/85">{result.summary}</p>

        {result.claims.length > 0 && (
          <div className="mt-6">
            {/* 상태 분포 막대: 아래 목록이 같은 정보를 글자로 전달한다 */}
            <div aria-hidden="true" className="flex h-2.5 gap-1 overflow-hidden rounded-full">
              {VERIFICATION_STATUSES.filter((status) => counts[status] > 0).map((status) => (
                <motion.span
                  key={status}
                  data-status={status}
                  className="rounded-full bg-(--status-solid)"
                  initial={{ flexGrow: 0 }}
                  animate={{ flexGrow: counts[status] }}
                  transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                />
              ))}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {VERIFICATION_STATUSES.map((status) => {
                const Icon = STATUS_ICONS[status];
                return (
                  <li
                    key={status}
                    data-status={status}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-sm",
                      counts[status] === 0 && "opacity-45",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 text-(--status-fg)" />
                    <span className="font-medium">{STATUS_LABELS[status]}</span>
                    <span className="font-bold tabular-nums">{counts[status]}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[0.8125rem] text-muted-foreground">
              검색으로 확인한 출처 {result.sources.length}건
              {officialCount > 0 && ` · 그중 공공기관 자료 ${officialCount}건`}
            </p>
          </div>
        )}
      </motion.section>

      {/* 원문 하이라이트 + 주장별 분석 */}
      {result.claims.length > 0 && (
        <motion.section variants={item} aria-labelledby="claims-title">
          <h2 id="claims-title" className="text-xl font-bold tracking-tight">
            주장별 분석
          </h2>
          {result.visual ? (
            <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <div className="lg:sticky lg:top-22 print:static">
                <PagePreview visual={result.visual} claims={result.claims} selectedId={selectedId} onSelect={showClaim} />
                {result.pageText && (
                  <details id="text-original-details" className="mt-4 rounded-xl border border-border bg-card p-4">
                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground">수집한 텍스트 원문 펼치기</summary>
                    <div className="mt-3"><OriginalText text={result.pageText} truncated={result.pageTextTruncated} claims={result.claims} selectedId={selectedId} onSelect={showClaim} /></div>
                  </details>
                )}
              </div>
              {claimCards}
            </div>
          ) : result.pageText ? (
            <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="lg:sticky lg:top-22 print:static">
                <div role="status" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6">
                  <p className="font-semibold">광고 화면을 가져오지 못했어요</p>
                  <p className="mt-1 text-muted-foreground">이번에는 텍스트로만 분석했어요. 이미지 속 문구와 화면 하이라이트가 빠져 있으니 잠시 후 다시 분석해 주세요.</p>
                </div>
                <details id="text-original-details" className="rounded-xl border border-border bg-card p-4">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">수집한 텍스트 원문 펼치기</summary>
                  <div className="mt-3"><OriginalText
                  text={result.pageText}
                  truncated={result.pageTextTruncated}
                  claims={result.claims}
                  selectedId={selectedId}
                  onSelect={showClaim}
                  /></div>
                </details>
              </div>
              {claimCards}
            </div>
          ) : (
            <div className="mt-5">
              <p className="mb-4 flex items-start gap-2 rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-sm leading-6 text-muted-foreground">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                서버가 원문을 직접 수집하지 못해 원문 하이라이트를 제공할 수 없어요. 아래 문구는 Gemini가
                URL Context로 읽은 내용이에요.
              </p>
              {claimCards}
            </div>
          )}
        </motion.section>
      )}

      {result.claims.length > 0 && (
        <motion.div variants={item}>
          <SourceList sources={result.sources} claims={result.claims} />
        </motion.div>
      )}

      {/* 관련 법령 · 검색어 · 한계 */}
      <motion.section
        variants={item}
        aria-label="참고 정보"
        className="grid gap-4 md:grid-cols-2"
      >
        {result.relevantLaws.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 print:shadow-none">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <Scale aria-hidden="true" className="size-4.5 text-muted-foreground" />
              관련 법령
            </h2>
            <ul className="mt-3 space-y-3">
              {result.relevantLaws.map((law) => (
                <li key={law.name} className="text-sm leading-6">
                  <p className="font-semibold">{law.name}</p>
                  <p className="text-muted-foreground">{law.note}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.8125rem] leading-6 text-muted-foreground">
              참고용 안내이며, 이 광고가 해당 법령을 위반했다는 뜻이 아닙니다.
            </p>
          </div>
        )}

        {result.searchQueries.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 print:shadow-none">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <Search aria-hidden="true" className="size-4.5 text-muted-foreground" />
              AI가 사용한 Google 검색어
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {result.searchQueries.map((query) => (
                <li key={query}>
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded-full border border-border bg-surface px-3 py-1.5 text-[0.8125rem] font-medium transition-colors duration-200 hover:border-primary/40 hover:text-primary"
                  >
                    {query}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 md:col-span-2 print:shadow-none">
          <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
            <Info aria-hidden="true" className="size-4.5 text-muted-foreground" />
            이 분석의 한계
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
            {result.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
          <p className="mt-4 border-t border-border pt-4 text-[0.8125rem] leading-6 font-medium text-foreground/80">
            {LEGAL_DISCLAIMER}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">분석 모델: {result.model}</p>
        </div>
      </motion.section>

      {/* 인쇄물에만 들어가는 머리말 */}
      <p className="hidden text-xs text-muted-foreground print:block">
        광고살핌 · {formatAnalyzedAt(result.analyzedAt)} 분석 · {result.finalUrl}
      </p>
    </motion.div>
  );
}
