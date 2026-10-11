import type { FeedLatest } from "../../shared/schema";
import { ago, hoursSince, shortDay, spanText, when } from "../lib/format";
import { Notice } from "./ui";

/** Timestamps, comparison window and every data-quality warning, in one place. */
export function FeedStatus({ feed }: { feed: FeedLatest }) {
  const snap = feed.snapshot;
  const cmp = feed.comparison;
  if (!snap) return null;
  const age = hoursSince(snap.collectedAt);
  const stale = age > feed.staleAfterHours;
  const failedAfter = feed.lastRun?.status === "failed" && feed.lastRun.finishedAt > snap.collectedAt;

  return (
    <div className="space-y-3">
      <dl className="card grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-3.5">
          <dt className="label">Collected</dt>
          <dd className="mt-1 text-[14px] font-semibold" data-testid="text-collected-at" title={snap.collectedAt}>{when(snap.collectedAt)}</dd>
          <dd className={`text-[12.5px] ${stale ? "font-semibold text-warn" : "text-faint"}`}>{ago(snap.collectedAt)}{stale ? " · stale" : ""}</dd>
        </div>
        <div className="px-5 py-3.5">
          <dt className="label">Compared with</dt>
          {cmp?.previous ? (
            <>
              <dd className="mt-1 text-[14px] font-semibold" data-testid="text-previous-at" title={cmp.previous.collectedAt}>{when(cmp.previous.collectedAt)}</dd>
              <dd className="text-[12.5px] text-faint">previous successful snapshot</dd>
            </>
          ) : (
            <>
              <dd className="mt-1 text-[14px] font-semibold">No previous snapshot</dd>
              <dd className="text-[12.5px] text-faint">growth cannot be calculated yet</dd>
            </>
          )}
        </div>
        <div className="px-5 py-3.5">
          <dt className="label">Comparison window</dt>
          <dd className={`mt-1 font-mono text-[14px] font-semibold tabular ${cmp?.spansMultipleDays ? "text-warn" : ""}`} data-testid="text-span">{spanText(cmp?.spanHours ?? null)}</dd>
          <dd className={`text-[12.5px] ${cmp?.spansMultipleDays ? "font-semibold text-warn" : "text-faint"}`}>
            {cmp?.spansMultipleDays ? "spans more than one day" : cmp?.previous ? "about one day" : "—"}
          </dd>
        </div>
      </dl>

      {feed.origin === "fixture" && (
        <Notice tone="info" title="Sample data" testId="notice-fixture">
          These numbers are illustrative fixtures for building the interface, not real observations. Repository names and descriptions are real; the history and daily figures are invented. Live collection replaces this automatically.
        </Notice>
      )}
      {stale && (
        <Notice tone="warn" title="This data is stale" testId="notice-stale">
          The last successful collection was {ago(snap.collectedAt)} ({when(snap.collectedAt)}). Figures describe that moment, not now.
        </Notice>
      )}
      {failedAfter && (
        <Notice tone="error" title="The most recent collection failed" testId="notice-failed">
          {when(feed.lastRun!.finishedAt)}: {feed.lastRun!.message}. Showing the last good snapshot instead.
        </Notice>
      )}
      {cmp?.spansMultipleDays && (
        <Notice tone="warn" title={`Comparison spans ${spanText(cmp.spanHours)}`} testId="notice-multiday">
          Net growth covers {cmp.previous && shortDay(cmp.previous.date)} → {shortDay(cmp.latest.date)}
          {cmp.missingDates.length > 0 && <> with no snapshot for {cmp.missingDates.map(shortDay).join(", ")}</>}. It is not a one-day figure.
        </Notice>
      )}
    </div>
  );
}
