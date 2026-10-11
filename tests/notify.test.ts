import { mkdir, writeFile, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { formatDigest, loadDeliveryState, runNotify, selectDiscoveries, emptyState } from "../collector/src/notify.js";
import type { FeedRepo } from "../shared/schema.js";
import { notificationConfig, repo, tmpPaths } from "./helpers.js";

const fr = (name: string, starsToday: number | null, categories: FeedRepo["categories"] = ["ai"]): FeedRepo => ({
  ...repo(name, { starsToday }), categories, topics: [], license: null, homepage: null, archived: false, comparison: null, summary: null, digestPick: false,
});
const now = new Date("2026-10-11T07:00:00Z");
const snapshot = { date: "2026-10-11", collectedAt: "2026-10-11T06:00:00.000Z" };
const env = { TELEGRAM_BOT_TOKEN: "123:SECRET", TELEGRAM_CHAT_ID: "42" };

describe("notification rule", () => {
  it("applies relevance, threshold, cooldown and the max-3 cap", () => {
    const state = emptyState();
    state.notified["recent/one"] = "2026-10-08T00:00:00Z"; // 3 days ago -> blocked
    state.notified["old/one"] = "2026-10-01T00:00:00Z"; // 10 days ago -> allowed
    const repos = [
      fr("a/a", 900), fr("b/b", 99), fr("c/c", null), fr("d/d", 5000, ["other"]),
      fr("recent/one", 800), fr("old/one", 300), fr("e/e", 150, ["webdev"]), fr("f/f", 120, ["automation"]),
    ];
    expect(selectDiscoveries(repos, notificationConfig.rule, state, now).map((r) => r.fullName)).toEqual(["a/a", "old/one", "e/e"]);
  });

  it("formats a plain-text digest that labels GitHub's displayed number", () => {
    const text = formatDigest([fr("a/a", 900)], notificationConfig, snapshot);
    expect(text).toContain("900 stars today (as displayed by GitHub)");
  });
});

describe("runNotify", () => {
  const counting = () => {
    const calls: string[] = [];
    return { calls, fetcher: async (url: string) => (calls.push(url), new Response("{}", { status: 200 })) };
  };

  it("repeated runs send exactly once per snapshot", async () => {
    const paths = await tmpPaths();
    const { calls, fetcher } = counting();
    const o = { paths, config: notificationConfig, repos: [fr("a/a", 900)], snapshot, staleAfterHours: 30, send: true, env, now, fetcher };
    expect((await runNotify(o)).status).toBe("sent");
    expect((await runNotify(o)).status).toBe("skipped");
    expect(calls).toHaveLength(1);
    expect((await loadDeliveryState(paths)).notified["a/a"]).toBeDefined();
  });

  it("does not resend if a previous run was interrupted mid-send", async () => {
    const paths = await tmpPaths();
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(paths.deliveryFile, JSON.stringify({ version: 1, notified: {}, digests: { "2026-10-11": { status: "sending", repos: ["a/a"], at: "x" } } }));
    const { calls, fetcher } = counting();
    const r = await runNotify({ paths, config: notificationConfig, repos: [fr("a/a", 900)], snapshot, staleAfterHours: 30, send: true, env, now, fetcher });
    expect(r.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });

  it("a failed send is recorded, does not start the cooldown, redacts the token, and may be retried", async () => {
    const paths = await tmpPaths();
    const o = { paths, config: notificationConfig, repos: [fr("a/a", 900)], snapshot, staleAfterHours: 30, send: true, env, now };
    const r = await runNotify({ ...o, fetcher: async () => { throw new Error("boom 123:SECRET"); } });
    expect(r).toMatchObject({ status: "failed" });
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(await readFile(paths.deliveryFile, "utf8")).not.toContain("SECRET");
    expect((await loadDeliveryState(paths)).notified["a/a"]).toBeUndefined();
    expect((await runNotify({ ...o, fetcher: async () => new Response("{}") })).status).toBe("sent");
  });

  it("is a dry run unless enabled, --send and secrets are all present", async () => {
    const paths = await tmpPaths();
    const { calls, fetcher } = counting();
    const base = { paths, repos: [fr("a/a", 900)], snapshot, staleAfterHours: 30, now, fetcher };
    expect((await runNotify({ ...base, config: { ...notificationConfig, enabled: false }, send: true, env })).status).toBe("dry-run");
    expect((await runNotify({ ...base, config: notificationConfig, send: false, env })).status).toBe("dry-run");
    expect((await runNotify({ ...base, config: notificationConfig, send: true, env: {} })).status).toBe("dry-run");
    expect(calls).toHaveLength(0);
  });

  it("does not notify about stale data", async () => {
    const paths = await tmpPaths();
    const r = await runNotify({ paths, config: notificationConfig, repos: [fr("a/a", 900)], snapshot, staleAfterHours: 30, send: true, env, now: new Date("2026-10-13T12:00:00Z") });
    expect(r.status).toBe("skipped");
  });

  it("refuses to run on a corrupt delivery state (avoids duplicate sends)", async () => {
    const paths = await tmpPaths();
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(paths.deliveryFile, '{"version":2}');
    await expect(runNotify({ paths, config: notificationConfig, repos: [fr("a/a", 900)], snapshot, staleAfterHours: 30, send: true, env, now })).rejects.toThrow(/invalid/);
  });
});
