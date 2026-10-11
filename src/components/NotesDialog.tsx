import { useEffect, useRef } from "react";
import { ExternalLink, FlaskConical, X } from "lucide-react";
import type { CachedSummary } from "../../shared/schema";
import { safeHref, when } from "../lib/format";
import { Notice } from "./ui";

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-5">
      <h3 className="label mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-[14px]"><span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-faint" />{t}</li>
        ))}
      </ul>
    </section>
  );
}

export function NotesDialog({ summary, onClose }: { summary: CachedSummary; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [onClose]);
  const s = summary.summary;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="notes-title">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-label="Close learning notes" onClick={onClose} tabIndex={-1} />
      <div className="relative flex h-full w-full max-w-[560px] flex-col overflow-hidden border-l border-border bg-surface shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="label">Learning notes</p>
            <h2 id="notes-title" className="mt-1 break-words font-display text-lg font-extrabold">{summary.fullName}</h2>
          </div>
          <button ref={closeRef} onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close" data-testid="button-close-notes">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-8 pt-5">
          {summary.origin === "fixture" && (
            <Notice tone="warn" title="Sample notes">Hand-written from the saved README to demonstrate the format; not produced by a model run.</Notice>
          )}
          <section className="mt-5">
            <h3 className="label mb-2">What it does</h3>
            <p className="text-[15px] leading-relaxed">{s.whatItDoes}</p>
          </section>
          <Section title="Intended users" items={s.intendedUsers} />
          {s.documentedTechnologies.length > 0 && (
            <section className="mt-5">
              <h3 className="label mb-2">Documented technologies</h3>
              <div className="flex flex-wrap gap-1.5">
                {s.documentedTechnologies.map((t) => (
                  <span key={t} className="rounded-md border border-border px-2 py-0.5 font-mono text-[12px]">{t}</span>
                ))}
              </div>
            </section>
          )}
          <Section title="Learning opportunities" items={s.learningOpportunities} />
          <section className="mt-6 rounded-xl border border-border bg-surface-2/60 p-4">
            <h3 className="flex items-center gap-2 text-[14px] font-bold"><FlaskConical className="h-4 w-4 text-accent" /> One small experiment: {s.smallExperiment.title}</h3>
            <ol className="mt-2.5 space-y-1.5 text-[14px]">
              {s.smallExperiment.steps.map((st, i) => (
                <li key={i} className="flex gap-2.5"><span className="font-mono text-[12px] font-semibold text-faint tabular">{i + 1}.</span>{st}</li>
              ))}
            </ol>
          </section>
          <Section title="Caveats" items={s.caveats} />
          <section className="mt-5">
            <h3 className="label mb-2">Sources</h3>
            <ul className="space-y-1">
              {s.sources.map((src) => {
                const href = safeHref(src.url);
                return href ? (
                  <li key={href}>
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-[14px] text-accent hover:underline">
                      {src.label} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </li>
                ) : null;
              })}
            </ul>
          </section>
          <p className="mt-8 border-t border-border pt-4 text-[12px] text-faint">
            Generated {when(summary.generatedAt)} · {summary.model} · prompt {summary.promptVersion}
            {summary.readmeSha && <> · README {summary.readmeSha.slice(0, 7)}</>}
            {summary.validationNotes.length > 0 && <> · {summary.validationNotes.length} validation note(s)</>}
          </p>
        </div>
      </div>
    </div>
  );
}
