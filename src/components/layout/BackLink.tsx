import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackLink({
  href,
  label,
  currentPage,
}: {
  href: string;
  label: string;
  currentPage: string;
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
        <li className="min-w-0">
          <Link
            href={href}
            className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md px-2 font-semibold text-text-secondary transition-colors duration-150 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span className="truncate">Back to {label}</span>
          </Link>
        </li>
        <li aria-hidden="true" className="hidden text-text-muted md:list-item">/</li>
        <li aria-current="page" className="hidden truncate text-text-muted md:list-item">{currentPage}</li>
      </ol>
    </nav>
  );
}
