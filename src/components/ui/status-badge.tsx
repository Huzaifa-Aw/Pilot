import { cn } from "./utils";

const STATUS_COLORS: Record<string, string> = {
  PLANNING: "bg-neutral-100 text-neutral-700",
  ACTIVE: "bg-info-light text-info-dark",
  ON_HOLD: "bg-warning-light text-warning-dark",
  COMPLETED: "bg-success-light text-success-dark",
  ARCHIVED: "bg-neutral-100 text-neutral-600",
  BACKLOG: "bg-neutral-100 text-neutral-600",
  IN_PROGRESS: "bg-progress-bg text-progress-text",
  UNDER_REVIEW: "bg-warning-light text-warning-dark",
  APPROVED: "bg-success-light text-success-dark",
  CANCELLED: "bg-error-light text-error-dark",
  DRAFT: "bg-neutral-100 text-neutral-600",
  SUBMITTED: "bg-info-light text-info-dark",
  FLAGGED: "bg-error-light text-error-dark",
  SUCCESS: "bg-success-light text-success-dark",
  FAILURE: "bg-error-light text-error-dark",
  INFO: "bg-info-light text-info-dark",
  WARNING: "bg-warning-light text-warning-dark",
  ERROR: "bg-error-light text-error-dark",
  UPCOMING: "bg-info-light text-info-dark",
  DELAYED: "bg-error-light text-error-dark",
  INACTIVE: "bg-neutral-100 text-neutral-600",
  OVERALLOCATED: "bg-error-light text-error-dark",
  MAINTENANCE: "bg-warning-light text-warning-dark",
  RETIRED: "bg-neutral-100 text-neutral-600",
  EXPIRED: "bg-error-light text-error-dark",
  EXPIRING_SOON: "bg-warning-light text-warning-dark",
};

const STATUS_DOTS: Record<string, string> = {
  PLANNING: "bg-neutral-400",
  ACTIVE: "bg-brand-primary",
  ON_HOLD: "bg-warning",
  COMPLETED: "bg-success",
  ARCHIVED: "bg-neutral-400",
  BACKLOG: "bg-neutral-400",
  IN_PROGRESS: "bg-progress-dot",
  UNDER_REVIEW: "bg-warning",
  APPROVED: "bg-success",
  CANCELLED: "bg-error",
  DRAFT: "bg-neutral-400",
  SUBMITTED: "bg-brand-primary",
  FLAGGED: "bg-error",
  SUCCESS: "bg-success",
  FAILURE: "bg-error",
  INFO: "bg-brand-primary",
  WARNING: "bg-warning",
  ERROR: "bg-error",
  UPCOMING: "bg-brand-primary",
  DELAYED: "bg-error",
  INACTIVE: "bg-neutral-400",
  OVERALLOCATED: "bg-error",
  EXPIRED: "bg-error",
  EXPIRING_SOON: "bg-warning",
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string;
  showDot?: boolean;
  colorKey?: string;
}

export function StatusBadge({ status, showDot = true, colorKey, className, ...props }: StatusBadgeProps) {
  const key = status.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const color = colorKey?.trim().toUpperCase().replace(/[\s-]+/g, "_") ?? key;
  const label = status.trim().replace(/[_-]+/g, " ");
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        STATUS_COLORS[color] ?? "bg-neutral-100 text-neutral-700",
        className,
      )}
      {...props}
    >
      {showDot && <span aria-hidden="true" className={cn("size-1.5 rounded-full", STATUS_DOTS[color] ?? "bg-neutral-400")} />}
      {label}
    </span>
  );
}
