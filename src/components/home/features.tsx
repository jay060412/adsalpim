import { Highlighter, Landmark, ScanSearch } from "lucide-react";
import { HoverLift, Reveal } from "./reveal";

const FEATURES = [
  {
    icon: ScanSearch,
    title: "광고 내용 자동 분석",
    description: "URL 입력만으로 공개 광고 페이지를 분석합니다.",
    detail: "상품 상세페이지와 이벤트 페이지의 본문뿐 아니라 이미지 속 광고 문구도 함께 읽어요.",
  },
  {
    icon: Highlighter,
    title: "과장 의심 표현 탐지",
    description: "소비자가 확인해야 할 광고 속 주장을 찾아드립니다.",
    detail: "확인이 필요한 문구가 광고 화면의 어디에 있는지 표시해요. 하이라이트를 누르면 해당 분석으로 이동해요.",
  },
  {
    icon: Landmark,
    title: "객관적인 근거 확인",
    description: "신뢰할 수 있는 자료와 비교해 판단을 돕습니다.",
    detail: "공정거래위원회, 식품의약품안전처, 한국소비자원 등 공공기관 자료를 우선 검색해 비교해요.",
  },
];

export function Features() {
  return (
    <section id="about" className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-primary">서비스 소개</p>
          <h2 className="mt-3 text-[1.75rem] leading-tight font-bold tracking-tight sm:text-4xl">
            광고 속 주장, 근거와 함께 확인하세요
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            광고살핌은 광고를 대신 판정하지 않아요. 무엇을 확인해야 하는지, 어디서 확인할 수 있는지를
            알려드립니다.
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-5 sm:mt-16 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description, detail }, index) => (
            <li key={title} className="flex">
              <Reveal delay={index * 0.08} className="flex flex-1">
                <HoverLift className="flex flex-1">
                  <article className="group flex flex-1 flex-col rounded-2xl border border-border bg-card p-7 shadow-card transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-raised">
                    <span className="flex size-12 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground dark:bg-primary/15">
                      <Icon aria-hidden="true" className="size-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mt-6 text-lg font-bold tracking-tight">{title}</h3>
                    <p className="mt-2 text-[0.9375rem] leading-7 font-medium text-foreground/85">
                      {description}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
                  </article>
                </HoverLift>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
