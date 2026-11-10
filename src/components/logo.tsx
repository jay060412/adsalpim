import { cn } from "@/lib/utils";

/** 광고살핌 심볼: 돋보기 안에서 확인 표시를 찾는 모양 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <circle cx="14.5" cy="14.5" r="6.75" className="stroke-primary-foreground" strokeWidth="2.2" />
      <path
        d="m19.6 19.6 4.4 4.4"
        className="stroke-primary-foreground"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="m11.6 14.7 2.1 2.1 3.6-4.1"
        className="stroke-mint"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[1.0625rem] font-bold tracking-tight">광고살핌</span>
    </span>
  );
}
