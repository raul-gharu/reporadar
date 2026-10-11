import path from "node:path";
import { z } from "zod";
import { readJson } from "./util.js";
import type { Category } from "../../shared/schema.js";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

const CategoryEnum = z.enum(["ai", "devtools", "automation", "webdev", "data", "security", "other"]);

export const CollectorConfigSchema = z.object({
  trendingUrl: z.string().url(),
  userAgent: z.string().min(1),
  requestTimeoutMs: z.number().int().positive(),
  minReposForValidSnapshot: z.number().int().positive(),
  staleAfterHours: z.number().positive(),
  multiDayThresholdHours: z.number().positive(),
  historyDaysInFeed: z.number().int().positive(),
  lockStaleAfterMinutes: z.number().positive(),
  enrichWithGitHubApi: z.boolean(),
  summaries: z.object({
    enabled: z.boolean(),
    maxPerRun: z.number().int().min(0).max(20),
    maxReadmeChars: z.number().int().positive().max(50000),
    maxOutputTokens: z.number().int().positive().max(4000),
    promptVersion: z.string(),
    selected: z.array(z.string()),
  }),
});
export type CollectorConfig = z.infer<typeof CollectorConfigSchema>;

export const NotificationConfigSchema = z.object({
  enabled: z.boolean(),
  channel: z.literal("telegram"),
  rule: z.object({
    categories: z.array(CategoryEnum).min(1),
    minDisplayedStarsToday: z.number().int().nonnegative(),
    cooldownDays: z.number().int().nonnegative(),
    maxPerDigest: z.number().int().positive().max(10),
  }),
  digest: z.object({ title: z.string(), siteUrl: z.string().url().nullable() }),
});
export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

export type CategoryRules = Partial<Record<Category, string[]>>;

export interface Paths {
  dataDir: string;
  snapshotsDir: string;
  summariesDir: string;
  runsFile: string;
  stateDir: string;
  deliveryFile: string;
  outboxDir: string;
  lockFile: string;
  feedDir: string;
}

export function makePaths(dataDir = path.join(ROOT, "data"), stateDir = path.join(ROOT, "state"), feedDir = path.join(ROOT, "public", "feed")): Paths {
  return {
    dataDir,
    snapshotsDir: path.join(dataDir, "snapshots"),
    summariesDir: path.join(dataDir, "summaries"),
    runsFile: path.join(dataDir, "runs.json"),
    stateDir,
    deliveryFile: path.join(stateDir, "delivery.json"),
    outboxDir: path.join(stateDir, "outbox"),
    lockFile: path.join(stateDir, "collector.lock"),
    feedDir,
  };
}

function strip(o: unknown) {
  const { $comment, ...rest } = o as any;
  return rest;
}

export async function loadConfigs(configDir = path.join(ROOT, "config")) {
  const collector = CollectorConfigSchema.parse(strip((await readJson(path.join(configDir, "collector.json"))) ?? {}));
  const notifications = NotificationConfigSchema.parse(strip((await readJson(path.join(configDir, "notifications.json"))) ?? {}));
  const categories = strip((await readJson<CategoryRules>(path.join(configDir, "categories.json"))) ?? {}) as CategoryRules;
  return { collector, notifications, categories };
}
