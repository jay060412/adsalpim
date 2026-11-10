import Link from "next/link";

/** 안내 문서(개인정보 처리 안내, 법적 고지)용 공통 레이아웃 */
export function ProsePage({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{lead}</p>
      <div className="mt-10 space-y-10">{children}</div>
      <p className="mt-14 border-t border-border pt-6">
        <Link href="/" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
          ← 광고 분석하러 가기
        </Link>
      </p>
    </div>
  );
}

export function ProseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-7 text-foreground/85 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
