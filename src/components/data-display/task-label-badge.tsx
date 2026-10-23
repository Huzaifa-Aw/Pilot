const labelClasses: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  blue: "bg-info-light text-info-dark",
  green: "bg-success-light text-success-dark",
  amber: "bg-warning-light text-warning-dark",
  red: "bg-error-light text-error-dark",
};

export function TaskLabelBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${labelClasses[color] ?? labelClasses.neutral}`}>
      {name}
    </span>
  );
}
