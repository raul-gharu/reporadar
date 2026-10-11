import { SCHEMA_VERSION, type RepoMeta, type Snapshot } from "../../shared/schema.js";
import type { CollectorConfig, Paths } from "./config.js";
import { parseTrendingHtml, PARSER_VERSION } from "./parseTrending.js";
import { appendRun, listSnapshots, writeSnapshot } from "./store.js";
import { fetchWithTimeout, log, utcDate } from "./util.js";
import type { Fetcher, GitHubClient } from "./github.js";

export interface CollectOptions {
  paths: Paths;
  config: CollectorConfig;
  now?: Date;
  /** Replace an existing successful snapshot for today. */
  force?: boolean;
  fetcher?: Fetcher;
  github?: GitHubClient | null;
}

export type CollectOutcome =
  | { status: "success"; snapshot: Snapshot }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

/**
 * Collect GitHub Trending once. Safe to rerun:
 *  - If today's successful snapshot already exists it is left alone (unless force).
 *  - A failure never deletes or overwrites an existing snapshot.
 *  - The snapshot is written atomically only after it validates.
 */
export async function collectOnce(opts: CollectOptions): Promise<CollectOutcome> {
  const now = opts.now ?? new Date();
  const startedAt = now.toISOString();
  const date = utcDate(now);
  const runId = `${startedAt}-${process.pid}`;
  const record = async (status: "success" | "skipped" | "failed", message: string) =>
    appendRun(opts.paths, { runId, startedAt, finishedAt: new Date().toISOString(), status, date, message });

  const existing = (await listSnapshots(opts.paths)).find((s) => s.date === date);
  if (existing && !opts.force) {
    const reason = `Snapshot for ${date} already collected at ${existing.collectedAt}; nothing to do.`;
    await record("skipped", reason);
    return { status: "skipped", reason };
  }

  try {
    const f = opts.fetcher ?? fetchWithTimeout;
    const res = await f(opts.config.trendingUrl, {
      headers: { "User-Agent": opts.config.userAgent, Accept: "text/html" },
      timeoutMs: opts.config.requestTimeoutMs,
    });
    if (!res.ok) throw new Error(`Trending page returned HTTP ${res.status}`);
    const html = await res.text();
    const collectedAt = new Date().toISOString();
    const { repos, warnings } = parseTrendingHtml(html);
    if (repos.length < opts.config.minReposForValidSnapshot) {
      throw new Error(`Only ${repos.length} repositories parsed (minimum ${opts.config.minReposForValidSnapshot}); treating as a failed collection.`);
    }

    const meta: Record<string, RepoMeta> = {};
    if (opts.github && opts.config.enrichWithGitHubApi) {
      for (const r of repos) {
        try {
          const m = await opts.github.repoMeta(r.fullName);
          if (m) meta[r.fullName] = m;
        } catch (e: any) {
          warnings.push(`${r.fullName}: metadata unavailable (${e?.message ?? e}).`);
        }
      }
    }

    const snapshot: Snapshot = {
      schemaVersion: SCHEMA_VERSION,
      date,
      collectedAt,
      source: { url: opts.config.trendingUrl, since: "daily", parserVersion: PARSER_VERSION },
      origin: "live",
      repos,
      meta,
      warnings,
    };
    await writeSnapshot(opts.paths, snapshot);
    await record("success", `Collected ${repos.length} repositories${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.`);
    log.info(`Saved snapshot ${date} (${repos.length} repos).`);
    return { status: "success", snapshot };
  } catch (e: any) {
    const error = e?.message ?? String(e);
    log.error(`Collection failed: ${error}`);
    await record("failed", error);
    return { status: "failed", error };
  }
}
