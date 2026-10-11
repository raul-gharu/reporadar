import { useState } from "react";
import { Bookmark, Download, ExternalLink, Trash2 } from "lucide-react";
import { useLatest } from "../lib/feed";
import { useBookmarks } from "../lib/storage";
import { langColour, num, shortDay, when } from "../lib/format";
import { Empty, Notice, PageHeader } from "../components/ui";
import { NotesDialog } from "../components/NotesDialog";
import type { CachedSummary } from "../../shared/schema";

export default function Saved() {
  const bm = useBookmarks();
  const feed = useLatest();
  const [notes, setNotes] = useState<CachedSummary | null>(null);
  const latest = feed.status === "ready" ? feed.data : null;
  const list = Object.values(bm.items).sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reporadar-saved-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader eyebrow="Saved" title="Your saved repositories">
        Stored only in this browser. Nothing is sent anywhere.
      </PageHeader>
      {!bm.persistent && <div className="mb-5"><Notice tone="neutral" title="Session-only">Local storage is blocked here, so this list lasts until you close the page.</Notice></div>}
      {list.length === 0 ? (
        <Empty title="Nothing saved yet" icon={<Bookmark className="h-9 w-9" />}>
          Use the bookmark button on any card in Today to keep a repository here.
        </Empty>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <p className="text-[13px] text-muted">{list.length} saved</p>
            <button className="btn ml-auto" onClick={exportJson} data-testid="button-export"><Download className="h-4 w-4" /> Export</button>
            <button className="btn" onClick={() => window.confirm("Remove all saved repositories from this browser?") && bm.clear()} data-testid="button-clear-saved"><Trash2 className="h-4 w-4" /> Clear all</button>
          </div>
          <ul className="space-y-3">
            {list.map((b) => {
              const now = latest?.repos.find((r) => r.fullName.toLowerCase() === b.fullName.toLowerCase());
              return (
                <li key={b.fullName} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start" data-testid={`card-saved-${b.fullName.replace("/", "__")}`}>
                  <div className="min-w-0 flex-1">
                    <a href={b.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-[15.5px] font-bold hover:text-accent">
                      {b.fullName} <ExternalLink className="h-3.5 w-3.5 text-faint" />
                    </a>
                    {b.description && <p className="mt-1 line-clamp-2 text-[14px] text-muted">{b.description}</p>}
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[12.5px] text-faint">
                      {b.language && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: langColour(b.language) }} />{b.language}</span>}
                      <span>Saved {when(b.savedAt)}</span>
                    </p>
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-4 rounded-xl bg-surface-2/70 px-4 py-3 text-[12.5px] sm:w-[340px]">
                    <div>
                      <p className="label">When saved</p>
                      <p className="mt-1 font-mono text-ink tabular">{b.seen.starsToday == null ? "not shown" : num(b.seen.starsToday)} <span className="font-sans text-faint">today</span></p>
                      <p className="font-mono text-muted tabular">{num(b.seen.totalStars)} <span className="font-sans text-faint">total</span></p>
                      <p className="mt-0.5 text-faint">snapshot {shortDay(b.seen.date)}</p>
                    </div>
                    <div>
                      <p className="label">Latest snapshot</p>
                      {now ? (
                        <>
                          <p className="mt-1 font-mono text-ink tabular">{now.starsToday == null ? "not shown" : num(now.starsToday)} <span className="font-sans text-faint">today</span></p>
                          <p className="font-mono text-muted tabular">{num(now.totalStars)} <span className="font-sans text-faint">total</span></p>
                          <p className="mt-0.5 text-faint">#{now.rank} on {latest && shortDay(latest.snapshot!.date)}</p>
                        </>
                      ) : (
                        <p className="mt-1 text-muted">Not on the latest list{latest?.snapshot ? ` (${shortDay(latest.snapshot.date)})` : ""}. Current figures unknown.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 sm:flex-col">
                    {now?.summary && <button className="btn" onClick={() => setNotes(now.summary)}>Notes</button>}
                    <button className="btn" onClick={() => bm.remove(b.fullName)} aria-label={`Remove ${b.fullName}`} data-testid={`button-remove-${b.fullName.replace("/", "__")}`}>Remove</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {notes && <NotesDialog summary={notes} onClose={() => setNotes(null)} />}
    </>
  );
}
