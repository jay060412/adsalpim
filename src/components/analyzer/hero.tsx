"use client";

import { EyeOff, Globe, Scale, Sparkles } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { StatusBadge } from "@/components/status-badge";
import { UrlForm } from "./url-form";

const EASE = [0.22, 1, 0.36, 1] as const;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const TITLE_LINES = [
  [{ text: "광고," }, { text: "믿기" }, { text: "전에" }],
  [{ text: "한", accent: true }, { text: "번", accent: true }, { text: "더", accent: true }, { text: "살펴보세요." }],
];

const ASSURANCES = [
  { icon: Globe, text: "공개된 페이지만 분석해요" },
  { icon: EyeOff, text: "입력한 링크는 저장하지 않아요" },
  { icon: Scale, text: "법적 판정이 아닌 참고 정보예요" },
];

export function Hero({
  url,
  onUrlChange,
  onSubmit,
}: {
  url: string;
  onUrlChange: (value: string) => void;
  onSubmit: (url: string) => void;
}) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto flex w-full max-w-3xl flex-col items-center pt-14 pb-16 text-center sm:pt-24 sm:pb-24"
    >
      <motion.p
        variants={rise}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3.5 py-1.5 text-[0.8125rem] font-medium text-muted-foreground shadow-card backdrop-blur"
      >
        <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
        Gemini AI · Google 검색 근거 기반 분석
      </motion.p>

      <h1 className="mt-6 text-[2.125rem] leading-[1.22] font-extrabold tracking-[-0.03em] sm:text-6xl sm:leading-[1.15]">
        {TITLE_LINES.map((line, lineIndex) => (
          <span key={lineIndex} className="block">
            {line.map((word) => (
              <motion.span
                key={word.text}
                variants={rise}
                className={
                  word.accent ? "mr-[0.26em] inline-block text-primary" : "mr-[0.26em] inline-block last:mr-0"
                }
              >
                {word.text}
              </motion.span>
            ))}
          </span>
        ))}
      </h1>

      <motion.p
        variants={rise}
        className="mt-5 max-w-xl text-base leading-7 text-balance text-muted-foreground sm:mt-6 sm:text-lg sm:leading-8"
      >
        광고 링크 하나만 입력하면 AI가 과장 의심 표현을 분석하고, 검증에 필요한 근거를 찾아드립니다.
      </motion.p>

      <motion.div variants={rise} className="mt-8 w-full sm:mt-10">
        <UrlForm value={url} onChange={onUrlChange} onSubmit={onSubmit} />
      </motion.div>

      <motion.ul
        variants={rise}
        className="mt-3 flex flex-col items-center gap-x-6 gap-y-2 text-[0.8125rem] text-muted-foreground sm:flex-row sm:flex-wrap sm:justify-center"
      >
        {ASSURANCES.map(({ icon: Icon, text }) => (
          <li key={text} className="inline-flex items-center gap-1.5">
            <Icon aria-hidden="true" className="size-3.5 text-mint" />
            {text}
          </li>
        ))}
      </motion.ul>

      <motion.div variants={rise} className="mt-14 w-full sm:mt-16">
        <ExamplePreview />
      </motion.div>
    </motion.div>
  );
}

/**
 * 결과 화면이 어떤 모습인지 보여 주는 예시.
 * 가상의 문구로 만든 그림이며 실제 분석 결과가 아님을 화면에 명시한다.
 */
function ExamplePreview() {
  return (
    <figure className="mx-auto w-full max-w-2xl text-left">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-raised">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </div>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            예시 화면
          </span>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-2">
          <div className="bg-card p-5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">광고 원문</p>
            <p className="mt-3 text-[0.9375rem] leading-8 text-foreground/90">
              하루 한 포로 충분해요.{" "}
              <mark
                data-status="needs_verification"
                className="claim-mark animate-highlight-in [animation-delay:0.9s]"
              >
                피부과 전문의 97%가 추천
              </mark>
              한 성분을 담았고,{" "}
              <mark
                data-status="insufficient"
                className="claim-mark animate-highlight-in [animation-delay:1.3s]"
              >
                2주 만에 피부 나이 10년
              </mark>{" "}
              젊어지는 변화를 경험하세요.
            </p>
          </div>

          <div className="bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">주장별 분석</p>
              <StatusBadge status="needs_verification" size="sm" />
            </div>
            <p className="mt-3 border-l-2 border-border pl-3 text-sm leading-6 font-medium">
              “피부과 전문의 97%가 추천”
            </p>
            <p className="mt-3 text-[0.8125rem] leading-6 text-muted-foreground">
              조사 기관, 대상 인원, 조사 시점이 표시되어 있지 않아요. 수치의 출처를 확인해 보세요.
            </p>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        이해를 돕기 위한 예시 화면이며, 실제 분석 결과가 아닙니다.
      </figcaption>
    </figure>
  );
}
