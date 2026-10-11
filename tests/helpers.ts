import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { makePaths, type CollectorConfig, type NotificationConfig } from "../collector/src/config.js";
import type { Snapshot, TrendingRepo } from "../shared/schema.js";

export async function tmpPaths() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "reporadar-"));
  return makePaths(path.join(dir, "data"), path.join(dir, "state"), path.join(dir, "feed"));
}

export const collectorConfig: CollectorConfig = {
  trendingUrl: "https://github.com/trending?since=daily",
  userAgent: "test",
  requestTimeoutMs: 1000,
  minReposForValidSnapshot: 2,
  staleAfterHours: 30,
  multiDayThresholdHours: 26,
  historyDaysInFeed: 30,
  lockStaleAfterMinutes: 30,
  enrichWithGitHubApi: false,
  summaries: { enabled: true, maxPerRun: 2, maxReadmeChars: 5000, maxOutputTokens: 500, promptVersion: "t1", selected: [] },
};

export const notificationConfig: NotificationConfig = {
  enabled: true,
  channel: "telegram",
  rule: { categories: ["ai", "devtools", "automation", "webdev"], minDisplayedStarsToday: 100, cooldownDays: 7, maxPerDigest: 3 },
  digest: { title: "Test digest", siteUrl: null },
};

export function repo(fullName: string, over: Partial<TrendingRepo> = {}): TrendingRepo {
  const [owner, name] = fullName.split("/");
  return { rank: 1, fullName, owner, name, url: `https://github.com/${fullName}`, description: "An AI agent toolkit", language: "TypeScript", totalStars: 1000, forks: 10, starsToday: 200, ...over };
}

export function snap(date: string, repos: TrendingRepo[], time = "06:00"): Snapshot {
  return {
    schemaVersion: 1, date, collectedAt: `${date}T${time}:00.000Z`,
    source: { url: "https://github.com/trending?since=daily", since: "daily", parserVersion: "test" },
    origin: "live", repos: repos.map((r, i) => ({ ...r, rank: i + 1 })), meta: {}, warnings: [],
  };
}

/** Minimal Trending-like HTML row builder for parser tests. */
export function rowHtml(fullName: string, o: { stars?: string; forks?: string; today?: string | null; lang?: string | null; desc?: string | null } = {}) {
  const [owner, name] = fullName.split("/");
  return `<article class="Box-row">
  <h2 class="h3 lh-condensed"><a href="/${fullName}" class="Link"><span class="text-normal">${owner} /</span> ${name}</a></h2>
  ${o.desc === null ? "" : `<p class="col-9">${o.desc ?? "A thing"}</p>`}
  <div class="f6">
    ${o.lang === null ? "" : `<span><span itemprop="programmingLanguage">${o.lang ?? "Go"}</span></span>`}
    <a href="/${fullName}/stargazers">${o.stars ?? "1,234"}</a>
    <a href="/${fullName}/forks">${o.forks ?? "56"}</a>
    ${o.today === null ? "" : `<span class="d-inline-block float-sm-right">${o.today ?? "321"} stars today</span>`}
  </div></article>`;
}
export const pageHtml = (rows: string[]) => `<html><body><div class="Box">${rows.join("\n")}</div></body></html>`;

export function htmlResponse(html: string, status = 200) {
  return new Response(html, { status, headers: { "content-type": "text/html" } });
}
