import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CachedSummarySchema,
  type CachedSummary,
  type FeedHistory,
  type FeedHistoryDay,
  type FeedLatest,
  type FeedRepo,
  type Snapshot,
} from "../../shared/schema.js";
import type { CategoryRules, CollectorConfig, NotificationConfig, Paths } from "./config.js";
import { categorise } from "./categorise.js";
import { compareSnapshots } from "./compare.js";
import { meetsRule } from "./notify.js";
import { listSnapshots, readRuns } from "./store.js";
import { readJson, writeJsonAtomic, log } from "./util.js";

export async function loadSummaries(paths: Paths): Promise<Map<string, CachedSummary>> {
  const out = new Map<string, CachedSummary>();
  let files: string[] = [];
  try {
    files = (await fs.readdir(paths.summariesDir)).filter((f) => f.endsWith(".json"));
  } catch {
    return out;
  }
  for (const f of files) {
    const p = CachedSummarySchema.safeParse(await readJson(path.join(paths.summariesDir, f)).catch(() => null));
    if (p.success) out.set(p.data.fullName.toLowerCase(), p.data);
    else log.warn(`Ignoring invalid cached summary ${f}`);
  }
  return out;
}

export function toFeedRepos(
  snap: Snapshot,
  previous: Snapshot | null,
  earlier: Snapshot[],
  rules: CategoryRules,
  notif: NotificationConfig,
  summaries: Map<string, CachedSummary>,
  multiDayThresholdHours: number,
) {
  const earlierSeen = new Set(earlier.flatMap((s) => s.repos.map((r) => r.fullName.toLowerCase())));
  const cmp = compareSnapshots(snap, previous, earlierSeen, multiDayThresholdHours);
  const repos: FeedRepo[] = snap.repos.map((r) => {
    const m = snap.meta[r.fullName];
    const categories = categorise({ ...r, topics: m?.topics }, rules);
    return {
      ...r,
      categories,
      topics: m?.topics ?? [],
      license: m?.license ?? null,
      homepage: m?.homepage ?? null,
      archived: m ? m.archived : null,
      comparison: cmp.repos[r.fullName] ?? null,
      summary: summaries.get(r.fullName.toLowerCase()) ?? null,
      digestPick: meetsRule({ starsToday: r.starsToday, categories }, notif.rule),
    };
  });
  const { repos: _omit, ...cmpMeta } = cmp;
  return { repos, comparison: cmpMeta };
}

/**
 * Build public/feed/latest.json + history.json from successful snapshots.
 * Only allow-listed, public fields are written. Private delivery state and run
 * internals stay in data/ and state/. If there is no snapshot at all, the
 * existing feed (if any) is left untouched.
 */
export async function buildFeed(opts: {
  paths: Paths;
  collector: CollectorConfig;
  notifications: NotificationConfig;
  categories: CategoryRules;
  now?: Date;
}): Promise<{ latest: FeedLatest; history: FeedHistory } | null> {
  const { paths, collector, notifications, categories } = opts;
  const now = opts.now ?? new Date();
  const snaps = await listSnapshots(paths);
  const runs = await readRuns(paths);
  const summaries = await loadSummaries(paths);
  const lastRunRec = runs.at(-1) ?? null;

  if (snaps.length === 0) {
    log.warn("No successful snapshots; keeping the existing feed unchanged.");
    return null;
  }

  const latestSnap = snaps.at(-1)!;
  const prevSnap = snaps.at(-2) ?? null;
  const { repos, comparison } = toFeedRepos(
    latestSnap, prevSnap, snaps.slice(0, -2), categories, notifications, summaries, collector.multiDayThresholdHours,
  );

  const latest: FeedLatest = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    origin: latestSnap.origin,
    staleAfterHours: collector.staleAfterHours,
    snapshot: { date: latestSnap.date, collectedAt: latestSnap.collectedAt, sourceUrl: latestSnap.source.url, warnings: latestSnap.warnings.slice(0, 20) },
    comparison,
    repos,
    lastRun: lastRunRec ? { status: lastRunRec.status, finishedAt: lastRunRec.finishedAt, message: lastRunRec.message.slice(0, 300) } : null,
  };

  const recent = snaps.slice(-collector.historyDaysInFeed);
  const days: FeedHistoryDay[] = recent.map((s) => {
    const idx = snaps.indexOf(s);
    const prev = idx > 0 ? snaps[idx - 1] : null;
    const { repos: fr, comparison: c } = toFeedRepos(s, prev, snaps.slice(0, Math.max(0, idx - 1)), categories, notifications, new Map(), collector.multiDayThresholdHours);
    return {
      date: s.date,
      collectedAt: s.collectedAt,
      origin: s.origin,
      repoCount: s.repos.length,
      previousDate: c.previous?.date ?? null,
      spanHours: c.spanHours,
      spansMultipleDays: c.spansMultipleDays,
      missingDates: c.missingDates,
      newCount: prev ? fr.filter((r) => r.comparison?.appearance === "new").length : null,
      top: fr.map((r) => ({
        fullName: r.fullName,
        rank: r.rank,
        starsToday: r.starsToday,
        totalStars: r.totalStars,
        netStarGrowth: r.comparison?.netStarGrowth ?? null,
        appearance: r.comparison?.appearance ?? "unknown",
        language: r.language,
        categories: r.categories,
      })),
    };
  });

  const history: FeedHistory = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    days: days.reverse(),
    failedRuns: runs
      .filter((r) => r.status === "failed")
      .slice(-20)
      .map((r) => ({ date: r.date, finishedAt: r.finishedAt, message: r.message.slice(0, 200) }))
      .reverse(),
  };

  await writeJsonAtomic(path.join(paths.feedDir, "latest.json"), latest);
  await writeJsonAtomic(path.join(paths.feedDir, "history.json"), history);
  log.info(`Feed written: ${repos.length} repos, ${days.length} history day(s), origin=${latest.origin}.`);
  return { latest, history };
}
