import Link from "next/link";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/#about", label: "서비스 소개" },
  { href: "/#how", label: "분석 방법" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md print:hidden">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="광고살핌 홈" className="rounded-lg">
          <Logo />
        </Link>

        <nav aria-label="주요 메뉴" className="flex items-center gap-0.5 sm:gap-1.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-2.5 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground sm:px-3.5 sm:text-sm"
            >
              {item.label}
            </Link>
          ))}
          <span className="ml-1 sm:ml-2">
            <ThemeToggle />
          </span>
        </nav>
      </div>
    </header>
  );
}
