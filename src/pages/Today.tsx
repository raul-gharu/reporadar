import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { Category, FeedRepo } from "../../shared/schema";
import { useLatest } from "../lib/feed";
import { CATEGORY_LABEL, CATEGORY_ORDER, dayLabel, num } from "../lib/format";
import { useBookmarks } from "../lib/storage";
import { RepoCard } from "../components/RepoCard";
import { NotesDialog } from "../components/NotesDialog";
import { FeedStatus } from "../components/FeedStatus";
import { CardSkeleton, Empty, Notice, PageHeader } from "../components/ui";

type SortKey = "rank" | "starsToday" | "netStarGrowth" | "displayedDailyChange" | "totalStars";
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "rank", label: "GitHub's order" },
  { key: "starsToday", label: "Stars today (GitHub)" },
  { key: "netStarGrowth", label: "Net growth (ours)" },
  { key: "displayedDailyChange", label: "Daily figure change" },
  { key: "totalStars", label: "Total stars" },
];

const value = (r: FeedRepo, k: SortKey): number | null =>
  k === "netStarGrowth" ? r.comparison?.netStarGrowth ?? null : k === "displayedDailyChange" ? r.comparison?.displayedDailyChange ?? null : (r[k] as number | null);

/** Unknown values always sort last; they are never treated as zero. */
export function sortRepos(repos: FeedRepo[], k: SortKey) {
  if (k === "rank") return [...repos].sort((a, b) => a.rank - b.rank);
  return [...repos].sort((a, b) => {
    const va = value(a, k), vb = value(b, k);
    if (va === null && vb === null) return a.rank - b.rank;
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va || a.rank - b.rank;
  });
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <p className="font-mono text-[22px] font-semibold leading-none tabular">{value}</p>
      <p className="mt-1.5 text-[12.5px] text-muted">{label}</p>
    </div>
  );
}

export default function Today() {
  const feed = useLatest();
  const bm = useBookmarks();
  const [cats, setCats] = useState<Category[]>([]);
  const [lang, setLang] = useState("all");
  const [sort, setSort] = useState<SortKey>("rank");
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyRule, setOnlyRule] = useState(false);
  const [q, setQ] = useState("");
  const [notesFor, setNotesFor] = useState<FeedRepo | null>(null);

  const data = feed.status === "ready" ? feed.data : null;
  const languages = useMemo(() => [...new Set((data?.repos ?? []).map((r) => r.language).filter(Boolean) as string[])].sort(), [data]);
  const presentCats = useMemo(() => CATEGORY_ORDER.filter((c) => data?.repos.some((r) => r.categories.includes(c))), [data]);

  const shown = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return sortRepos(
      data.repos.filter(
        (r) =>
          (cats.length === 0 || r.categories.some((c) => cats.includes(c))) &&
          (lang === "all" || r.language === lang) &&
          (!onlyNew || r.comparison?.appearance === "new") &&
          (!onlyRule || r.digestPick) &&
          (!needle || r.fullName.toLowerCase().includes(needle) || (r.description ?? "").toLowerCase().includes(needle)),
      ),
      sort,
    );
  }, [data, cats, lang, sort, onlyNew, onlyRule, q]);

  if (feed.status === "loading")
    return (
      <>
        <PageHeader eyebrow="Today" title="Loading the latest snapshot…" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}</div>
      </>
    );
  if (feed.status === "error" || !data?.snapshot)
    return (
      <Empty title="No feed available yet">
        {feed.status === "error" ? `The feed could not be loaded (${feed.error}).` : "No successful snapshot has been collected."} Run <code className="font-mono">npm run feed</code> to build it.
      </Empty>
    );

  const cmp = data.comparison;
  const newCount = cmp?.previous ? data.repos.filter((r) => r.comparison?.appearance === "new").length : null;
  const returning = cmp?.previous ? data.repos.filter((r) => r.comparison?.appearance === "returning").length : null;
  const ruleCount = data.repos.filter((r) => r.digestPick).length;
  const filtersOn = cats.length > 0 || lang !== "all" || onlyNew || onlyRule || q !== "";
  const toggleCat = (c: Category) => setCats((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  return (
    <>
      <PageHeader eyebrow={`Today · ${dayLabel(data.snapshot.date)}`} title="What's gaining traction on GitHub">
        GitHub's own "stars today", plus what changed between our two most recent daily snapshots.
      </PageHeader>

      <FeedStatus feed={data} />

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 sm:grid-cols-4">
        <Stat label="Repositories in list" value={num(data.repos.length)} hint="Rows collected from GitHub Trending (daily)" />
        <Stat label="New to our list" value={newCount == null ? "—" : num(newCount)} hint="Not in the previous snapshot and never seen before" />
        <Stat label="Returning" value={returning == null ? "—" : num(returning)} hint="Absent from the previous snapshot but seen earlier" />
        <Stat label="Meet the alert rule" value={num(ruleCount)} hint="Relevant category and at least the minimum displayed stars today" />
      </div>

      <section aria-label="Filters" className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="mr-1 h-4 w-4 text-faint" aria-hidden />
          <button className="chip" aria-pressed={cats.length === 0} onClick={() => setCats([])} data-testid="chip-category-all">All</button>
          {presentCats.map((c) => (
            <button key={c} className="chip" aria-pressed={cats.includes(c)} onClick={() => toggleCat(c)} data-testid={`chip-category-${c}`}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[180px] flex-1 sm:max-w-[260px]">
            <span className="sr-only">Search repositories</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or description" className="select w-full pl-8" data-testid="input-search" />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Language
            <select className="select" value={lang} onChange={(e) => setLang(e.target.value)} data-testid="select-language">
              <option value="all">All languages</option>
              {languages.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Sort
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} data-testid="select-sort">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <button className="chip" aria-pressed={onlyNew} onClick={() => setOnlyNew((v) => !v)} disabled={newCount == null} data-testid="toggle-new">New to list</button>
          <button className="chip" aria-pressed={onlyRule} onClick={() => setOnlyRule((v) => !v)} data-testid="toggle-rule">Meets alert rule</button>
          {filtersOn && (
            <button className="inline-flex items-center gap-1 px-2 text-[13px] text-muted hover:text-ink" onClick={() => { setCats([]); setLang("all"); setOnlyNew(false); setOnlyRule(false); setQ(""); }} data-testid="button-clear-filters">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
        {sort !== "rank" && <p className="text-[12.5px] text-faint">Repositories with an unknown value for this sort are listed last.</p>}
      </section>

      {!bm.persistent && (
        <div className="mt-4"><Notice tone="neutral" title="Bookmarks are session-only here">This browser is blocking local storage, so saved repositories will be forgotten when you close the page.</Notice></div>
      )}

      <p className="mb-3 mt-6 text-[13px] text-muted" data-testid="text-result-count">
        Showing {shown.length} of {data.repos.length}
      </p>
      {shown.length === 0 ? (
        <Empty title="Nothing matches these filters">Try removing a category or language.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => (
            <RepoCard key={r.fullName} repo={r} cmp={cmp} saved={bm.isSaved(r.fullName)} onToggleSave={() => bm.toggle(r, data.snapshot!)} onOpenNotes={() => setNotesFor(r)} />
          ))}
        </div>
      )}

      {cmp && cmp.droppedOut.length > 0 && (
        <section className="mt-10">
          <h2 className="label mb-2">Left the list since the previous snapshot</h2>
          <p className="mb-3 text-[13.5px] text-muted">We only observe repositories while they are on the Trending page, so their current figures are unknown.</p>
          <div className="flex flex-wrap gap-2">
            {cmp.droppedOut.map((n) => (
              <a key={n} href={`https://github.com/${n}`} target="_blank" rel="noopener noreferrer nofollow" className="chip font-mono text-[12.5px]">{n}</a>
            ))}
          </div>
        </section>
      )}

      {data.snapshot.warnings.length > 0 && (
        <details className="mt-8 text-[13px] text-muted">
          <summary className="cursor-pointer select-none font-medium">Collection notes ({data.snapshot.warnings.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{data.snapshot.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}

      {notesFor?.summary && <NotesDialog summary={notesFor.summary} onClose={() => setNotesFor(null)} />}
    </>
  );
}
