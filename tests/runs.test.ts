import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectOnce } from "../collector/src/collect.js";
import { buildFeed } from "../collector/src/feed.js";
import { withLock, LockHeldError } from "../collector/src/lock.js";
import { listSnapshots, readRuns, snapshotPath, writeSnapshot } from "../collector/src/store.js";
import { collectorConfig, htmlResponse, notificationConfig, pageHtml, repo, rowHtml, snap, tmpPaths } from "./helpers.js";

const okPage = pageHtml([rowHtml("a/b", { today: "500" }), rowHtml("c/d", { today: "120" }), rowHtml("e/f")]);
const fetchOk = async () => htmlResponse(okPage);
const now = new Date("2026-10-11T06:00:00Z");

describe("collector runs", () => {
  it("repeated runs on the same day are safe: second run is skipped and leaves the file unchanged", async () => {
    const paths = await tmpPaths();
    const first = await collectOnce({ paths, config: collectorConfig, now, fetcher: fetchOk });
    expect(first.status).toBe("success");
    const before = await readFile(snapshotPath(paths, "2026-10-11"), "utf8");
    let fetched = 0;
    const second = await collectOnce({ paths, config: collectorConfig, now, fetcher: async () => (fetched++, htmlResponse(okPage)) });
    expect(second.status).toBe("skipped");
    expect(fetched).toBe(0);
    expect(await readFile(snapshotPath(paths, "2026-10-11"), "utf8")).toBe(before);
    expect((await readRuns(paths)).map((r) => r.status)).toEqual(["success", "skipped"]);
  });

  it("a failed fetch never overwrites an existing snapshot (forced rerun)", async () => {
    const paths = await tmpPaths();
    await collectOnce({ paths, config: collectorConfig, now, fetcher: fetchOk });
    const before = await readFile(snapshotPath(paths, "2026-10-11"), "utf8");
    const r = await collectOnce({ paths, config: collectorConfig, now, force: true, fetcher: async () => htmlResponse("busy", 503) });
    expect(r.status).toBe("failed");
    expect(await readFile(snapshotPath(paths, "2026-10-11"), "utf8")).toBe(before);
  });

  it("a page with too few rows (likely a layout change) is a failure, not an empty snapshot", async () => {
    const paths = await tmpPaths();
    const r = await collectOnce({ paths, config: collectorConfig, now, fetcher: async () => htmlResponse(pageHtml([rowHtml("a/b")])) });
    expect(r.status).toBe("failed");
    expect(await listSnapshots(paths)).toHaveLength(0);
  });

  it("ignores corrupt snapshot files instead of crashing or treating them as data", async () => {
    const paths = await tmpPaths();
    await writeSnapshot(paths, snap("2026-10-10", [repo("a/b")]));
    await writeFile(snapshotPath(paths, "2026-10-11"), "{ not json");
    expect((await listSnapshots(paths)).map((s) => s.date)).toEqual(["2026-10-10"]);
  });
});

describe("feed", () => {
  it("preserves the last good feed after a failed run and surfaces the failure", async () => {
    const paths = await tmpPaths();
    await writeSnapshot(paths, snap("2026-10-10", [repo("a/b")]));
    await collectOnce({ paths, config: collectorConfig, now, fetcher: async () => htmlResponse("down", 500) });
    const built = await buildFeed({ paths, collector: collectorConfig, notifications: notificationConfig, categories: { ai: ["ai"] }, now });
    expect(built!.latest.snapshot!.date).toBe("2026-10-10");
    expect(built!.latest.lastRun!.status).toBe("failed");
    expect(built!.history.failedRuns).toHaveLength(1);
  });

  it("with no snapshots, leaves any existing feed untouched", async () => {
    const paths = await tmpPaths();
    await mkdir(paths.feedDir, { recursive: true });
    await writeFile(path.join(paths.feedDir, "latest.json"), '{"keep":true}');
    expect(await buildFeed({ paths, collector: collectorConfig, notifications: notificationConfig, categories: {}, now })).toBeNull();
    expect(await readFile(path.join(paths.feedDir, "latest.json"), "utf8")).toBe('{"keep":true}');
  });

  it("first-ever snapshot produces unknown comparisons, not zeros", async () => {
    const paths = await tmpPaths();
    await writeSnapshot(paths, snap("2026-10-11", [repo("a/b")]));
    const built = await buildFeed({ paths, collector: collectorConfig, notifications: notificationConfig, categories: {}, now });
    expect(built!.latest.comparison!.previous).toBeNull();
    expect(built!.latest.repos[0].comparison).toMatchObject({ appearance: "unknown", netStarGrowth: null });
    expect(built!.history.days[0].newCount).toBeNull();
  });

  it("never leaks private delivery state into the public feed", async () => {
    const paths = await tmpPaths();
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(paths.deliveryFile, JSON.stringify({ version: 1, notified: { "a/b": "2026-10-10T00:00:00Z" }, digests: {} }));
    await writeSnapshot(paths, snap("2026-10-11", [repo("a/b")]));
    await buildFeed({ paths, collector: collectorConfig, notifications: notificationConfig, categories: {}, now });
    const text = await readFile(path.join(paths.feedDir, "latest.json"), "utf8");
    expect(text).not.toMatch(/notified|digests|TELEGRAM|chat_id/i);
  });
});

describe("lock", () => {
  it("prevents overlapping runs", async () => {
    const paths = await tmpPaths();
    let release!: () => void;
    const first = withLock(paths.lockFile, 30, () => new Promise<void>((r) => (release = r)));
    await new Promise((r) => setTimeout(r, 20));
    await expect(withLock(paths.lockFile, 30, async () => "second")).rejects.toBeInstanceOf(LockHeldError);
    release();
    await first;
    await expect(withLock(paths.lockFile, 30, async () => "third")).resolves.toBe("third");
  });

  it("replaces an abandoned (stale) lock", async () => {
    const paths = await tmpPaths();
    await mkdir(paths.stateDir, { recursive: true });
    await writeFile(paths.lockFile, "{}");
    await expect(withLock(paths.lockFile, 0, async () => "ok")).resolves.toBe("ok");
  });
});
