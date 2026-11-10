import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleX,
  type LucideIcon,
} from "lucide-react";
import type { VerificationStatus } from "@/lib/analysis/constants";
import { STATUS_LABELS } from "@/lib/analysis/labels";
import { cn } from "@/lib/utils";

export const STATUS_ICONS: Record<VerificationStatus, LucideIcon> = {
  supported: CircleCheck,
  needs_verification: CircleAlert,
  insufficient: CircleHelp,
  contradicted: CircleX,
  undetermined: CircleDashed,
};

/** 검증 상태 배지. 색과 함께 아이콘·글자를 항상 같이 보여 준다. */
export function StatusBadge({
  status,
  size = "md",
  className,
}: {
  status: VerificationStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = STATUS_ICONS[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-(--status-border) bg-(--status-bg) font-semibold whitespace-nowrap text-(--status-fg) transition-colors duration-300",
        size === "sm" ? "gap-1 px-2 py-0.5 text-xs" : "gap-1.5 px-2.5 py-1 text-[0.8125rem]",
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
