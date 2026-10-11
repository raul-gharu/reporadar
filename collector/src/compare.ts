import type { ComparisonResult, RepoComparison, Snapshot, Appearance } from "../../shared/schema.js";
import { datesBetween, hoursBetween } from "./util.js";

/**
 * Compare the latest successful snapshot with the previous successful one.
 * Missing observations stay null. Nothing is ever defaulted to zero.
 *
 * @param earlierSeen lowercased fullNames seen in any snapshot BEFORE `previous`.
 */
export function compareSnapshots(
  latest: Snapshot,
  previous: Snapshot | null,
  earlierSeen: Set<string> = new Set(),
  multiDayThresholdHours = 26,
): ComparisonResult {
  const prevByName = new Map((previous?.repos ?? []).map((r) => [r.fullName.toLowerCase(), r]));
  const latestNames = new Set(latest.repos.map((r) => r.fullName.toLowerCase()));
  const repos: Record<string, RepoComparison> = {};

  for (const r of latest.repos) {
    const key = r.fullName.toLowerCase();
    const p = prevByName.get(key) ?? null;
    let appearance: Appearance;
    if (!previous) appearance = "unknown";
    else if (p) appearance = "continuing";
    else if (earlierSeen.has(key)) appearance = "returning";
    else appearance = "new";

    repos[r.fullName] = {
      fullName: r.fullName,
      appearance,
      netStarGrowth: p && p.totalStars !== null && r.totalStars !== null ? r.totalStars - p.totalStars : null,
      displayedDailyChange: p && p.starsToday !== null && r.starsToday !== null ? r.starsToday - p.starsToday : null,
      previousRank: p?.rank ?? null,
      previousCollectedAt: p ? previous!.collectedAt : null,
    };
  }

  const spanHours = previous ? Math.round(hoursBetween(previous.collectedAt, latest.collectedAt) * 10) / 10 : null;
  return {
    latest: { date: latest.date, collectedAt: latest.collectedAt },
    previous: previous ? { date: previous.date, collectedAt: previous.collectedAt } : null,
    spanHours,
    spansMultipleDays: spanHours !== null && spanHours > multiDayThresholdHours,
    missingDates: previous ? datesBetween(previous.date, latest.date) : [],
    repos,
    droppedOut: (previous?.repos ?? []).filter((r) => !latestNames.has(r.fullName.toLowerCase())).map((r) => r.fullName),
  };
}
