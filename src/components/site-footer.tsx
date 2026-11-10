import Link from "next/link";
import { Logo } from "./logo";

const LINKS = [
  { href: "/#about", label: "서비스 소개" },
  { href: "/privacy", label: "개인정보 처리 안내" },
  { href: "/legal", label: "법적 고지" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface print:hidden">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <Logo />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              광고를 믿기 전, AI로 한 번 더 살핌.
            </p>
          </div>
          <nav aria-label="바닥글 메뉴">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="mt-8 border-t border-border pt-6 text-[0.8125rem] leading-6 text-muted-foreground">
          본 서비스는 AI 기반 정보 분석 도구이며, 법적인 허위·과장광고 판정을 대신하지 않습니다.
        </p>
        <p className="mt-1 text-[0.8125rem] text-muted-foreground/80">© 광고살핌 · EasyThon 2026</p>
      </div>
    </footer>
  );
}
