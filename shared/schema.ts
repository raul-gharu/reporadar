/**
 * RepoRadar shared data model.
 *
 * Rules that every part of the system follows:
 *  - A missing observation is `null`, never `0`.
 *  - Every value carries the timestamp of the observation it came from.
 *  - "Displayed stars today" is GitHub's own number, copied verbatim.
 *  - "Net star growth" is OUR difference in total stars between two of OUR
 *    collection timestamps. It is only defined when both observations exist.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

const fullName = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "expected owner/name");

/** One row as displayed on github.com/trending at collection time. */
export const TrendingRepoSchema = z.object({
  rank: z.number().int().positive(),
  fullName,
  owner: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  /** Total stars shown on the trending page. null if not displayed/parseable. */
  totalStars: z.number().int().nonnegative().nullable(),
  forks: z.number().int().nonnegative().nullable(),
  /** GitHub's displayed "N stars today". null if not displayed/parseable. */
  starsToday: z.number().int().nonnegative().nullable(),
});
export type TrendingRepo = z.infer<typeof TrendingRepoSchema>;

/** Optional enrichment from the GitHub REST API (never from repo code). */
export const RepoMetaSchema = z.object({
  fullName,
  fetchedAt: z.string().datetime(),
  topics: z.array(z.string()).max(50),
  license: z.string().nullable(),
  homepage: z.string().nullable(),
  archived: z.boolean(),
  pushedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  defaultBranch: z.string().nullable(),
});
export type RepoMeta = z.infer<typeof RepoMetaSchema>;

export const SnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** UTC date of collection, YYYY-MM-DD. One successful snapshot per date. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  collectedAt: z.string().datetime(),
  source: z.object({
    url: z.string().url(),
    since: z.literal("daily"),
    parserVersion: z.string(),
  }),
  /** "fixture" snapshots are sample data and are labelled as such in the UI. */
  origin: z.enum(["live", "fixture"]),
  repos: z.array(TrendingRepoSchema).min(1),
  meta: z.record(z.string(), RepoMetaSchema).default({}),
  warnings: z.array(z.string()).default([]),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

/** Run log entry. Failed runs are recorded here and never produce a snapshot. */
export const RunRecordSchema = z.object({
  runId: z.string(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  status: z.enum(["success", "skipped", "failed"]),
  date: z.string(),
  message: z.string(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type Appearance =
  /** Not in the previous snapshot and never seen in any earlier snapshot. */
  | "new"
  /** Not in the previous snapshot, but seen in an earlier one. */
  | "returning"
  /** Present in both latest and previous snapshot. */
  | "continuing"
  /** No previous snapshot exists, so we cannot say. */
  | "unknown";

export interface RepoComparison {
  fullName: string;
  appearance: Appearance;
  /** Latest totalStars − previous totalStars. null when either is missing. */
  netStarGrowth: number | null;
  /** Latest starsToday − previous starsToday. null when either is missing. */
  displayedDailyChange: number | null;
  previousRank: number | null;
  previousCollectedAt: string | null;
}

export interface ComparisonResult {
  latest: { date: string; collectedAt: string };
  previous: { date: string; collectedAt: string } | null;
  /** Hours between our two collection timestamps. null with no previous. */
  spanHours: number | null;
  /** True when the comparison window is longer than one day (see config). */
  spansMultipleDays: boolean;
  /** Dates between previous and latest with no successful snapshot. */
  missingDates: string[];
  repos: Record<string, RepoComparison>;
  /** In previous but not latest. We do NOT know their current numbers. */
  droppedOut: string[];
}

// ---------------------------------------------------------------------------
// Learning summaries (AI output — always validated before use)
// ---------------------------------------------------------------------------

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const LearningSummaryBodySchema = z
  .object({
    whatItDoes: shortText(600),
    intendedUsers: z.array(shortText(160)).min(1).max(5),
    documentedTechnologies: z.array(shortText(60)).max(12),
    learningOpportunities: z.array(shortText(240)).min(1).max(5),
    smallExperiment: z.object({
      title: shortText(120),
      steps: z.array(shortText(240)).min(1).max(6),
    }),
    caveats: z.array(shortText(240)).min(1).max(6),
    sources: z
      .array(z.object({ label: shortText(80), url: z.string().url() }))
      .min(1)
      .max(8),
  })
  .strict();
export type LearningSummaryBody = z.infer<typeof LearningSummaryBodySchema>;

export const CachedSummarySchema = z.object({
  fullName,
  cacheKey: z.string(),
  generatedAt: z.string().datetime(),
  model: z.string(),
  promptVersion: z.string(),
  readmeSha: z.string().nullable(),
  origin: z.enum(["live", "fixture"]),
  summary: LearningSummaryBodySchema,
  /** Things the validator removed or flagged (e.g. ungrounded technologies). */
  validationNotes: z.array(z.string()),
});
export type CachedSummary = z.infer<typeof CachedSummarySchema>;

// ---------------------------------------------------------------------------
// Public feed (the ONLY data the frontend sees)
// ---------------------------------------------------------------------------

export type Category = "ai" | "devtools" | "automation" | "webdev" | "data" | "security" | "other";

export interface FeedRepo extends TrendingRepo {
  categories: Category[];
  topics: string[];
  license: string | null;
  homepage: string | null;
  archived: boolean | null;
  comparison: RepoComparison | null;
  summary: CachedSummary | null;
  /** Whether this repo met the notification rule in this snapshot. */
  digestPick: boolean;
}

export interface FeedLatest {
  schemaVersion: 1;
  generatedAt: string;
  origin: "live" | "fixture";
  staleAfterHours: number;
  snapshot: { date: string; collectedAt: string; sourceUrl: string; warnings: string[] } | null;
  comparison: Omit<ComparisonResult, "repos"> | null;
  repos: FeedRepo[];
  /** Most recent run attempt, so a failure after the last good feed is visible. */
  lastRun: { status: RunRecord["status"]; finishedAt: string; message: string } | null;
}

export interface FeedHistoryDay {
  date: string;
  collectedAt: string;
  origin: "live" | "fixture";
  repoCount: number;
  /** Comparison against the snapshot immediately before it. */
  previousDate: string | null;
  spanHours: number | null;
  spansMultipleDays: boolean;
  missingDates: string[];
  newCount: number | null;
  top: Array<{
    fullName: string;
    rank: number;
    starsToday: number | null;
    totalStars: number | null;
    netStarGrowth: number | null;
    appearance: Appearance;
    language: string | null;
    categories: Category[];
  }>;
}

export interface FeedHistory {
  schemaVersion: 1;
  generatedAt: string;
  days: FeedHistoryDay[];
  failedRuns: Array<{ date: string; finishedAt: string; message: string }>;
}
