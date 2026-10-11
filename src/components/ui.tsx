import type { ReactNode } from "react";
import { AlertTriangle, Info, CircleSlash } from "lucide-react";

export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-label="RepoRadar logo" role="img">
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.6" opacity=".28" />
      <circle cx="16" cy="16" r="7.5" stroke="currentColor" strokeWidth="1.6" opacity=".5" />
      <g className="radar-sweep">
        <path d="M16 16 L16 3 A13 13 0 0 1 27.3 9.5 Z" fill="currentColor" opacity=".10" />
        <path d="M16 16 L27.3 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      <circle cx="16" cy="16" r="1.6" fill="currentColor" />
      <circle cx="22.6" cy="21.4" r="2.4" fill="hsl(var(--accent))" />
    </svg>
  );
}

type Tone = "warn" | "info" | "neutral" | "error";
export function Notice({ tone = "info", title, children, testId }: { tone?: Tone; title: string; children?: ReactNode; testId?: string }) {
  const styles: Record<Tone, string> = {
    warn: "bg-warn-soft border-warn/30 text-ink",
    info: "bg-info-soft border-info/25 text-ink",
    neutral: "bg-surface-2 border-border text-ink",
    error: "bg-warn-soft border-neg/40 text-ink",
  };
  const Icon = tone === "info" || tone === "neutral" ? Info : tone === "error" ? CircleSlash : AlertTriangle;
  const iconColour = tone === "info" ? "text-info" : tone === "error" ? "text-neg" : tone === "warn" ? "text-warn" : "text-muted";
  return (
    <div role={tone === "warn" || tone === "error" ? "alert" : "status"} data-testid={testId} className={`flex gap-3 rounded-xl border px-4 py-3 text-[14px] ${styles[tone]}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColour}`} aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-muted">{children}</div>}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "accent" | "pos" | "info" | "warn"; title?: string }) {
  const s = {
    neutral: "bg-surface-2 text-muted",
    accent: "bg-accent-soft text-accent",
    pos: "bg-pos/10 text-pos",
    info: "bg-info-soft text-info",
    warn: "bg-warn-soft text-warn",
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold ${s}`}>
      {children}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      {eyebrow && <p className="label mb-1.5">{eyebrow}</p>}
      <h1 className="font-display text-xl font-extrabold tracking-tight sm:text-[22px]">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-muted">{children}</div>}
    </header>
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-5" aria-hidden>
      <div className="skeleton h-4 w-2/3" />
      <div className="skeleton mt-3 h-3 w-full" />
      <div className="skeleton mt-2 h-3 w-4/5" />
      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="skeleton h-10" />
        <div className="skeleton h-10" />
        <div className="skeleton h-10" />
      </div>
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 text-faint">{icon ?? <Logo className="h-10 w-10" />}</div>
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <div className="mt-1.5 max-w-md text-muted">{children}</div>}
    </div>
  );
}
