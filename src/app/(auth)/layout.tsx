import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.8fr)]">
      <section className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 sm:py-9 lg:px-14">
        <Link href="/" className="inline-flex min-h-11 w-fit items-center gap-3 rounded-md">
          <BrandMark />
          <span className="font-heading text-base font-semibold">Workspace</span>
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 items-center py-12">
          {children}
        </div>
        <p className="text-center text-xs text-[var(--text-muted)]">
          A flexible workspace for engineering teams.
        </p>
      </section>
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0f172a] p-12 text-white lg:flex xl:p-16">
        <div aria-hidden="true" className="absolute -right-32 -top-32 size-[34rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -right-12 -top-12 size-[22rem] rounded-full border border-white/10" />
        <p className="relative text-sm font-medium text-white/60">Engineering work, in view.</p>
        <div className="relative max-w-xl pb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#93c5fd]">
            Plan with clarity
          </p>
          <h2 className="mt-5 font-heading text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Bring projects, people, and progress together.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/65">
            Keep your organization&apos;s work moving with one clear, adaptable workspace.
          </p>
        </div>
        <p className="relative text-xs text-white/40">Private to your organization.</p>
      </aside>
    </main>
  );
}
