import { z } from "zod";
import path from "node:path";
import type { Category, FeedRepo } from "../../shared/schema.js";
import type { NotificationConfig, Paths } from "./config.js";
import { readJson, writeJsonAtomic, log, fetchWithTimeout, hoursBetween } from "./util.js";
import type { Fetcher } from "./github.js";

type Rule = NotificationConfig["rule"];
type Candidate = Pick<FeedRepo, "fullName" | "starsToday" | "categories" | "description" | "url" | "language" | "totalStars"> & { summary?: FeedRepo["summary"] };

/** Relevance + threshold only (no delivery state). Safe to publish in the feed. */
export function meetsRule(r: Pick<FeedRepo, "starsToday" | "categories">, rule: Rule): boolean {
  if (r.starsToday === null) return false; // missing is not zero, and not "enough"
  if (r.starsToday < rule.minDisplayedStarsToday) return false;
  return r.categories.some((c) => rule.categories.includes(c as Category));
}

// --------------------------------------------------------------------------
// Delivery state (private: lives in state/, never copied into the feed)
// --------------------------------------------------------------------------

const DigestRecord = z.object({
  status: z.enum(["sending", "sent", "failed"]),
  repos: z.array(z.string()),
  at: z.string(),
  error: z.string().optional(),
});
export const DeliveryStateSchema = z.object({
  version: z.literal(1),
  /** fullName -> last time it was included in a SENT digest */
  notified: z.record(z.string(), z.string()),
  /** snapshot date -> digest attempt */
  digests: z.record(z.string(), DigestRecord),
});
export type DeliveryState = z.infer<typeof DeliveryStateSchema>;

export const emptyState = (): DeliveryState => ({ version: 1, notified: {}, digests: {} });

export async function loadDeliveryState(paths: Paths): Promise<DeliveryState> {
  const raw = await readJson(paths.deliveryFile);
  if (raw == null) return emptyState();
  const p = DeliveryStateSchema.safeParse(raw);
  if (!p.success) throw new Error(`state/delivery.json is invalid (${p.error.issues[0]?.message}); refusing to notify rather than risk duplicates.`);
  return p.data;
}

export function selectDiscoveries<T extends Candidate>(repos: T[], rule: Rule, state: DeliveryState, now: Date): T[] {
  const cooldownMs = rule.cooldownDays * 86_400_000;
  return repos
    .filter((r) => meetsRule(r, rule))
    .filter((r) => {
      const last = state.notified[r.fullName.toLowerCase()];
      return !last || now.getTime() - new Date(last).getTime() >= cooldownMs;
    })
    .sort((a, b) => (b.starsToday ?? 0) - (a.starsToday ?? 0))
    .slice(0, rule.maxPerDigest);
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Plain text (no parse_mode) so repository text cannot inject formatting or links. */
export function formatDigest(picks: Candidate[], cfg: NotificationConfig, snapshot: { date: string; collectedAt: string }): string {
  const lines = [`${cfg.digest.title} — ${snapshot.date}`, `Collected ${snapshot.collectedAt.replace("T", " ").slice(0, 16)} UTC`, ""];
  picks.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.fullName} — ${p.starsToday?.toLocaleString("en-GB")} stars today (as displayed by GitHub)`);
    if (p.description) lines.push(`   ${clip(p.description.replace(/\s+/g, " "), 180)}`);
    lines.push(`   ${p.url}`);
  });
  if (cfg.digest.siteUrl) lines.push("", `More: ${cfg.digest.siteUrl}`);
  return lines.join("\n");
}

export interface NotifyOptions {
  paths: Paths;
  config: NotificationConfig;
  repos: FeedRepo[];
  snapshot: { date: string; collectedAt: string } | null;
  staleAfterHours: number;
  /** Must be explicitly true AND config.enabled AND secrets present to send. */
  send: boolean;
  env?: Record<string, string | undefined>;
  now?: Date;
  fetcher?: Fetcher;
}

export type NotifyOutcome =
  | { status: "skipped"; reason: string }
  | { status: "dry-run"; text: string; picks: string[]; file: string }
  | { status: "sent"; picks: string[] }
  | { status: "failed"; error: string };

/**
 * At-most-once delivery per snapshot date:
 *  - "sending" is persisted BEFORE the API call. If a run dies mid-send the next
 *    run sees "sending" and does not resend (check Telegram manually).
 *  - Only a confirmed "sent" updates the 7-day cooldown.
 */
export async function runNotify(o: NotifyOptions): Promise<NotifyOutcome> {
  const now = o.now ?? new Date();
  const env = o.env ?? process.env;
  if (!o.snapshot) return { status: "skipped", reason: "No successful snapshot yet." };
  if (hoursBetween(o.snapshot.collectedAt, now.toISOString()) > o.staleAfterHours) {
    return { status: "skipped", reason: `Latest snapshot is stale (collected ${o.snapshot.collectedAt}); not notifying about old data.` };
  }
  const state = await loadDeliveryState(o.paths);
  const prior = state.digests[o.snapshot.date];
  if (prior?.status === "sent") return { status: "skipped", reason: `Digest for ${o.snapshot.date} already sent at ${prior.at}.` };
  if (prior?.status === "sending") {
    return { status: "skipped", reason: `Digest for ${o.snapshot.date} was interrupted mid-send at ${prior.at}; not resending automatically.` };
  }

  const picks = selectDiscoveries(o.repos, o.config.rule, state, now);
  if (picks.length === 0) return { status: "skipped", reason: "No repositories met the notification rule." };
  const text = formatDigest(picks, o.config, o.snapshot);
  const names = picks.map((p) => p.fullName);

  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const live = o.send && o.config.enabled && !!token && !!chatId;
  if (!live) {
    const file = path.join(o.paths.outboxDir, `${o.snapshot.date}.txt`);
    await writeJsonAtomic(file.replace(/\.txt$/, ".json"), { date: o.snapshot.date, picks: names, text, note: "Dry run — nothing was sent." });
    const why = !o.config.enabled ? "notifications disabled in config" : !o.send ? "--send not passed" : "Telegram secrets missing";
    log.info(`Dry run (${why}). Digest preview written to state/outbox/.`);
    return { status: "dry-run", text, picks: names, file: file.replace(/\.txt$/, ".json") };
  }

  state.digests[o.snapshot.date] = { status: "sending", repos: names, at: now.toISOString() };
  await writeJsonAtomic(o.paths.deliveryFile, state);
  try {
    const f = o.fetcher ?? fetchWithTimeout;
    const res = await f(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      timeoutMs: 15000,
    });
    if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
    const sentAt = new Date().toISOString();
    state.digests[o.snapshot.date] = { status: "sent", repos: names, at: sentAt };
    for (const n of names) state.notified[n.toLowerCase()] = sentAt;
    await writeJsonAtomic(o.paths.deliveryFile, state);
    return { status: "sent", picks: names };
  } catch (e: any) {
    // The request failed before Telegram accepted it, so a later retry is allowed.
    const error = (e?.message ?? String(e)).replace(token!, "***");
    state.digests[o.snapshot.date] = { status: "failed", repos: names, at: new Date().toISOString(), error };
    await writeJsonAtomic(o.paths.deliveryFile, state);
    return { status: "failed", error };
  }
}
