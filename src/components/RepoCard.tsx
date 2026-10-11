import { ArrowDownRight, ArrowUpRight, Bell, Bookmark, BookmarkCheck, BookOpen, ExternalLink, Minus, Star } from "lucide-react";
import type { FeedLatest, FeedRepo } from "../../shared/schema";
import { CATEGORY_LABEL, langColour, num, safeHref, signed, spanText } from "../lib/format";
import { Badge } from "./ui";

type Cmp = NonNullable<FeedLatest["comparison"]>;

function unknownReason(r: FeedRepo, cmp: Cmp | null, field: "total" | "daily"): string {
  const a = r.comparison?.appearance;
  if (!cmp?.previous || a === "unknown") return "No previous snapshot";
  if (a === "new" || a === "returning") return "Not in previous list";
  return field === "total" ? "Total not recorded" : "Figure not shown";
}

function Metric({ label, value, sub, tone, testId, title }: { label: string; value: string; sub: string; tone?: "pos" | "neg" | "muted" | "warn"; testId: string; title?: string }) {
  const colour = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : tone === "muted" ? "text-faint" : "text-ink";
  return (
    <div className="min-w-0" title={title}>
      <p className="label leading-tight">{label}</p>
      <p data-testid={testId} className={`mt-1 font-mono text-[17px] font-semibold leading-tight tabular ${colour}`}>{value}</p>
      <p className={`mt-1 text-[11px] leading-snug ${tone === "warn" ? "font-semibold text-warn" : "text-faint"}`}>{sub}</p>
    </div>
  );
}

export function RepoCard({
  repo: r, cmp, saved, onToggleSave, onOpenNotes,
}: { repo: FeedRepo; cmp: Cmp | null; saved: boolean; onToggleSave: () => void; onOpenNotes: () => void }) {
  const c = r.comparison;
  const multi = !!cmp?.spansMultipleDays;
  const net = c?.netStarGrowth ?? null;
  const dd = c?.displayedDailyChange ?? null;
  const rankMove = c?.appearance === "continuing" && c.previousRank != null ? c.previousRank - r.rank : null;
  const id = r.fullName.replace("/", "__");
  const home = safeHref(r.homepage);

  return (
    <article data-testid={`card-repo-${id}`} className="card group flex flex-col p-5 transition-shadow hover:shadow-[0_1px_0_hsl(var(--border)),0_8px_24px_-12px_hsl(var(--text)/0.18)]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 font-mono text-[13px] font-semibold text-faint tabular" aria-label={`Rank ${r.rank} on GitHub Trending`}>
          {String(r.rank).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15.5px] font-bold leading-snug">
            <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="break-words hover:text-accent" data-testid={`link-repo-${id}`}>
              <span className="font-medium text-muted">{r.owner} / </span>
              {r.name}
            </a>
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {c?.appearance === "new" && <Badge tone="accent" title="Not in our previous snapshot and never seen before">New to our list</Badge>}
            {c?.appearance === "returning" && <Badge tone="info" title="Absent from our previous snapshot, but seen on an earlier date">Returning</Badge>}
            {rankMove !== null && (
              <Badge title={`Rank in previous snapshot: #${c!.previousRank}`}>
                {rankMove > 0 ? <ArrowUpRight className="h-3 w-3" /> : rankMove < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                was #{c!.previousRank}
              </Badge>
            )}
            {r.digestPick && (
              <Badge tone="warn" title="Matches the notification rule's relevance and stars-today threshold">
                <Bell className="h-3 w-3" /> Meets alert rule
              </Badge>
            )}
            {r.archived && <Badge>Archived</Badge>}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${r.fullName} from saved` : `Save ${r.fullName}`}
          data-testid={`button-save-${id}`}
          className={`-mr-1 -mt-1 rounded-lg p-2 transition-colors ${saved ? "text-accent" : "text-faint hover:bg-surface-2 hover:text-ink"}`}
        >
          {saved ? <BookmarkCheck className="h-[18px] w-[18px]" /> : <Bookmark className="h-[18px] w-[18px]" />}
        </button>
      </div>

      <p className="mt-3 line-clamp-3 text-[14px] text-muted">{r.description ?? <span className="italic text-faint">No description provided.</span>}</p>

      <div className="mt-4 grid grid-cols-3 gap-2.5 rounded-xl bg-surface-2/70 px-3.5 py-3">
        <Metric
          testId={`text-stars-today-${id}`}
          label="Stars today"
          value={r.starsToday == null ? "—" : num(r.starsToday)}
          tone={r.starsToday == null ? "muted" : undefined}
          sub={r.starsToday == null ? "Not shown" : "GitHub's figure"}
          title="GitHub's own 'stars today' figure, copied as displayed"
        />
        <Metric
          testId={`text-net-growth-${id}`}
          label="Net growth"
          value={net == null ? "Unknown" : signed(net)}
          tone={net == null ? "muted" : net > 0 ? "pos" : net < 0 ? "neg" : undefined}
          sub={net == null ? unknownReason(r, cmp, "total") : multi ? `over ${spanText(cmp!.spanHours)}` : `our snapshots`}
          title={net == null ? undefined : `Total stars now minus total stars at our previous collection (${spanText(cmp?.spanHours ?? null)} apart)`}
        />
        <Metric
          testId={`text-daily-change-${id}`}
          label="Daily Δ"
          value={dd == null ? "Unknown" : signed(dd)}
          tone={dd == null ? "muted" : dd > 0 ? "pos" : dd < 0 ? "neg" : undefined}
          sub={dd == null ? unknownReason(r, cmp, "daily") : "vs last display"}
          title="Change in GitHub's displayed 'stars today' figure since our previous snapshot"
        />
      </div>
      {multi && net != null && (
        <p className="mt-2 text-[11.5px] font-semibold text-warn">Comparison spans {spanText(cmp!.spanHours)}, not one day.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-muted">
        {r.language && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: langColour(r.language) }} aria-hidden />
            {r.language}
          </span>
        )}
        <span className="inline-flex items-center gap-1 tabular" title="Total stars displayed at collection time">
          <Star className="h-3.5 w-3.5" aria-hidden /> {num(r.totalStars)}
        </span>
        {r.license && <span>{r.license}</span>}
      </div>
      <p className="mt-1.5 text-[12px] text-faint">{r.categories.map((k) => CATEGORY_LABEL[k]).join(" · ")}</p>

      <div className="mt-auto flex items-center gap-2 pt-4">
        {r.summary ? (
          <button type="button" onClick={onOpenNotes} className="btn" data-testid={`button-notes-${id}`}>
            <BookOpen className="h-4 w-4" /> Learning notes
          </button>
        ) : (
          <span className="text-[12px] text-faint" title="Notes are generated only for selected repositories">No learning notes</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {home && (
            <a href={home} target="_blank" rel="noopener noreferrer nofollow" className="rounded-lg px-2 py-1.5 text-[12.5px] text-muted hover:bg-surface-2 hover:text-ink">
              Website
            </a>
          )}
          <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] text-muted hover:bg-surface-2 hover:text-ink">
            GitHub <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}
