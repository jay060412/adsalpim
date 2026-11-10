import { FileCheck2, Link2, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { VERIFICATION_STATUSES } from "@/lib/analysis/constants";
import { STATUS_DESCRIPTIONS } from "@/lib/analysis/labels";
import { Reveal } from "./reveal";

const STEPS = [
  {
    icon: Link2,
    title: "광고 링크 입력",
    description: "확인하고 싶은 광고 페이지의 주소를 붙여 넣어요.",
  },
  {
    icon: Sparkles,
    title: "Gemini AI 분석",
    description: "AI가 본문과 이미지 속 문구를 읽고, Google 검색으로 근거를 찾아요.",
  },
  {
    icon: FileCheck2,
    title: "검증 결과 확인",
    description: "광고 화면의 하이라이트와 함께 주장별 검증 상태, 출처, 확인할 점을 살펴봐요.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-primary">분석 방법</p>
          <h2 className="mt-3 text-[1.75rem] leading-tight font-bold tracking-tight sm:text-4xl">
            세 단계면 충분해요
          </h2>
        </Reveal>

        <ol className="relative mt-12 grid gap-10 sm:mt-16 md:grid-cols-3 md:gap-6">
          {/* 단계를 잇는 선 (데스크톱) */}
          <span
            aria-hidden="true"
            className="absolute top-7 right-[16.67%] left-[16.67%] hidden border-t border-dashed border-border md:block"
          />

          {STEPS.map(({ icon: Icon, title, description }, index) => (
            <li key={title} className="relative">
              <Reveal delay={index * 0.1} className="flex gap-5 md:flex-col md:items-center md:text-center">
                <span className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-card">
                  <Icon aria-hidden="true" className="size-6" strokeWidth={1.8} />
                  <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                </span>
                <div>
                  <h3 className="text-lg font-bold tracking-tight md:mt-1">{title}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-7 text-muted-foreground md:mx-auto md:max-w-[17rem]">
                    {description}
                  </p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal className="mt-16 rounded-3xl border border-border bg-surface p-6 sm:mt-20 sm:p-10">
          <div className="max-w-2xl">
            <h3 className="text-xl font-bold tracking-tight">결과는 다섯 가지 상태로 알려드려요</h3>
            <p className="mt-2 text-[0.9375rem] leading-7 text-muted-foreground">
              검증 상태는 확인된 자료를 기준으로 한 참고 정보예요. 법률 위반 여부는 별도로 설명하며,
              근거 없는 점수나 확률은 만들지 않아요.
            </p>
          </div>
          <dl className="mt-7 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {VERIFICATION_STATUSES.map((status) => (
              <div key={status} className="flex items-start gap-3">
                <dt className="w-[6.25rem] shrink-0">
                  <StatusBadge status={status} size="sm" />
                </dt>
                <dd className="text-sm leading-6 text-muted-foreground">{STATUS_DESCRIPTIONS[status]}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
