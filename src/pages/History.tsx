import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleSlash } from "lucide-react";
import type { FeedHistoryDay } from "../../shared/schema";
import { useHistory } from "../lib/feed";
import { CATEGORY_LABEL, num, shortDay, signed, spanText, when } from "../lib/format";
import { Badge, CardSkeleton, Empty, Notice, PageHeader } from "../components/ui";

function DayCard({ day, open, onToggle }: { day: FeedHistoryDay; open: boolean; onToggle: () => void }) {
  return (
    <div className="card overflow-hidden" data-testid={`card-day-${day.date}`}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 text-left hover:bg-surface-2/50">
        <div className="min-w-[150px]">
          <p className="font-display text-[16px] font-extrabold">{shortDay(day.date)}</p>
          <p className="text-[12.5px] text-faint" title={day.collectedAt}>Collected {when(day.collectedAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {day.previousDate == null ? (
            <Badge>First snapshot — no comparison</Badge>
          ) : day.spansMultipleDays ? (
            <Badge tone="warn" title={`Compared with ${day.previousDate}`}>Comparison spans {spanText(day.spanHours)}</Badge>
          ) : (
            <Badge title={`Compared with ${day.previousDate}`}>vs {shortDay(day.previousDate)} · {spanText(day.spanHours)}</Badge>
          )}
          {day.missingDates.length > 0 && <Badge tone="warn">No snapshot {day.missingDates.map(shortDay).join(", ")}</Badge>}
          {day.origin === "fixture" && <Badge tone="info">Sample</Badge>}
        </div>
        <div className="ml-auto flex items-center gap-5 text-[13px] text-muted">
          <span><span className="font-mono font-semibold text-ink tabular">{day.repoCount}</span> repos</span>
          <span><span className="font-mono font-semibold text-ink tabular">{day.newCount ?? "—"}</span> new</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </div>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="text-left">
                {["#", "Repository", "Stars today (GitHub)", "Net growth (ours)", "Status", "Language"].map((h, i) => (
                  <th key={h} className={`label px-4 py-2.5 font-semibold ${i >= 2 && i <= 3 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {day.top.map((r) => (
                <tr key={r.fullName} className="border-t border-border/70">
                  <td className="px-4 py-2 font-mono text-faint tabular">{r.rank}</td>
                  <td className="px-4 py-2">
                    <a className="font-medium hover:text-accent" href={`https://github.com/${r.fullName}`} target="_blank" rel="noopener noreferrer nofollow">{r.fullName}</a>
                    <span className="ml-2 text-[12px] text-faint">{r.categories.map((c) => CATEGORY_LABEL[c]).join(", ")}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular">{r.starsToday == null ? <span className="text-faint">not shown</span> : num(r.starsToday)}</td>
                  <td className={`px-4 py-2 text-right font-mono tabular ${r.netStarGrowth == null ? "text-faint" : r.netStarGrowth > 0 ? "text-pos" : ""}`}>
                    {r.netStarGrowth == null ? "unknown" : signed(r.netStarGrowth)}
                  </td>
                  <td className="px-4 py-2">
                    {r.appearance === "new" ? <Badge tone="accent">New</Badge> : r.appearance === "returning" ? <Badge tone="info">Returning</Badge> : r.appearance === "continuing" ? <span className="text-faint">Continuing</span> : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-4 py-2 text-muted">{r.language ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Which repositories were on the list on which collected days. Gaps are shown as gaps. */
function PresenceGrid({ days, failedDates }: { days: FeedHistoryDay[]; failedDates: Set<string> }) {
  const cols = useMemo(() => {
    const asc = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const out: Array<{ date: string; day: FeedHistoryDay | null }> = [];
    asc.forEach((d, i) => {
      if (i > 0) d.missingDates.forEach((m) => out.push({ date: m, day: null }));
      out.push({ date: d.date, day: d });
    });
    return out;
  }, [days]);
  const rows = useMemo(() => {
    const latest = cols.at(-1)?.day;
    const names = new Map<string, number>();
    cols.forEach((c) => c.day?.top.forEach((r) => names.set(r.fullName, (names.get(r.fullName) ?? 0) + 1)));
    const inLatest = new Set(latest?.top.map((r) => r.fullName));
    return [...names.keys()].sort((a, b) => Number(inLatest.has(b)) - Number(inLatest.has(a)) || names.get(b)! - names.get(a)! || a.localeCompare(b));
  }, [cols]);

  const scroller = useRef<HTMLDivElement>(null);
  // Newest days are on the right; start scrolled there on narrow screens.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [cols.length]);
  return (
    <div className="card overflow-x-auto p-4 sm:p-5" ref={scroller}>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-accent" /> On the list (darker = more stars today)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-faint/60" /> On the list, stars today not shown</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-surface-2" /> Not on the list</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-[repeating-linear-gradient(45deg,hsl(var(--border))_0_2px,transparent_2px_5px)]" /> No snapshot that day</span>
      </div>
      <div className="inline-grid items-center gap-x-1 gap-y-1 sm:gap-x-1.5" style={{ gridTemplateColumns: `minmax(120px, 280px) repeat(${cols.length}, 28px)` }}>
        <div className="sticky left-0 z-10 h-full bg-surface" />
        {cols.map((c) => (
          <div key={c.date} className={`pb-1 text-center font-mono text-[10.5px] leading-tight ${c.day ? "text-faint" : "text-warn"}`} title={c.day ? `Collected ${when(c.day.collectedAt)}` : failedDates.has(c.date) ? "Collection failed" : "No snapshot"}>
            {c.date.slice(8)}
            <br />
            {new Date(`${c.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" })}
          </div>
        ))}
        {rows.map((name) => (
          <Fragment key={name}>
            <div className="sticky left-0 z-10 truncate bg-surface pr-2 font-mono text-[12px]" title={name}>{name}</div>
            {cols.map((c) => {
              if (!c.day) return <div key={c.date} className="h-[22px] rounded-[4px] bg-[repeating-linear-gradient(45deg,hsl(var(--border))_0_2px,transparent_2px_5px)]" title={`${c.date}: no snapshot`} />;
              const r = c.day.top.find((x) => x.fullName === name);
              if (!r) return <div key={c.date} className="h-[22px] rounded-[4px] bg-surface-2" title={`${c.date}: not on the list`} />;
              if (r.starsToday == null) return <div key={c.date} className="h-[22px] rounded-[4px] border border-faint/60" title={`${c.date}: #${r.rank}, stars today not shown`} />;
              const o = Math.min(1, 0.25 + Math.log10(Math.max(10, r.starsToday)) / 5);
              return <div key={c.date} className="h-[22px] rounded-[4px] bg-accent" style={{ opacity: o }} title={`${c.date}: #${r.rank}, ${num(r.starsToday)} stars today`} />;
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default function History() {
  const h = useHistory();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (h.status === "loading") return (<><PageHeader eyebrow="History" title="Loading history…" /><div className="space-y-3"><CardSkeleton /><CardSkeleton /></div></>);
  if (h.status === "error" || h.data.days.length === 0) return <Empty title="No history yet">Snapshots will appear here after the first successful collection.</Empty>;

  const { days, failedRuns } = h.data;
  const failedDates = new Set(failedRuns.map((f) => f.date));
  const isFixture = days.some((d) => d.origin === "fixture");
  const items: Array<{ kind: "day"; day: FeedHistoryDay } | { kind: "fail"; f: (typeof failedRuns)[number] }> = [
    ...days.map((day) => ({ kind: "day" as const, day })),
    ...failedRuns.filter((f) => !days.some((d) => d.date === f.date)).map((f) => ({ kind: "fail" as const, f })),
  ].sort((a, b) => (b.kind === "day" ? b.day.date : b.f.date).localeCompare(a.kind === "day" ? a.day.date : a.f.date));

  return (
    <>
      <PageHeader eyebrow="History" title="Daily snapshots">
        Each day is compared only with the snapshot immediately before it. Gaps are shown as gaps, never filled in.
      </PageHeader>
      {isFixture && <div className="mb-5"><Notice tone="info" title="Sample data">This history is illustrative fixture data.</Notice></div>}

      <h2 className="label mb-3">Presence on the list</h2>
      <PresenceGrid days={days} failedDates={failedDates} />

      <h2 className="label mb-3 mt-10">Snapshots, newest first</h2>
      <div className="space-y-3">
        {items.map((it, i) =>
          it.kind === "day" ? (
            <DayCard key={it.day.date} day={it.day} open={open[it.day.date] ?? i === 0} onToggle={() => setOpen((o) => ({ ...o, [it.day.date]: !(o[it.day.date] ?? i === 0) }))} />
          ) : (
            <div key={`f-${it.f.date}`} className="flex flex-wrap items-center gap-3 rounded-card border border-dashed border-neg/40 px-5 py-3.5 text-[13.5px]" data-testid={`row-failed-${it.f.date}`}>
              <CircleSlash className="h-4 w-4 text-neg" aria-hidden />
              <span className="font-display font-extrabold">{shortDay(it.f.date)}</span>
              <span className="text-muted">Collection failed at {when(it.f.finishedAt)} — {it.f.message}. No snapshot was saved.</span>
            </div>
          ),
        )}
      </div>
    </>
  );
}
