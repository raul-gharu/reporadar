import { describe, expect, it } from "vitest";
import { compareSnapshots } from "../collector/src/compare.js";
import { repo, snap } from "./helpers.js";

describe("compareSnapshots", () => {
  it("with no previous snapshot, everything is unknown — never zero", () => {
    const c = compareSnapshots(snap("2026-10-11", [repo("a/b")]), null);
    expect(c.previous).toBeNull();
    expect(c.spanHours).toBeNull();
    expect(c.repos["a/b"]).toMatchObject({ appearance: "unknown", netStarGrowth: null, displayedDailyChange: null });
  });

  it("computes net growth and displayed-daily change for continuing repos", () => {
    const prev = snap("2026-10-10", [repo("a/b", { totalStars: 1000, starsToday: 150 })]);
    const latest = snap("2026-10-11", [repo("a/b", { totalStars: 1240, starsToday: 230 })]);
    expect(compareSnapshots(latest, prev).repos["a/b"]).toMatchObject({ appearance: "continuing", netStarGrowth: 240, displayedDailyChange: 80 });
  });

  it("keeps null when either observation is missing", () => {
    const prev = snap("2026-10-10", [repo("a/b", { totalStars: null, starsToday: 150 })]);
    const latest = snap("2026-10-11", [repo("a/b", { totalStars: 1240, starsToday: null })]);
    const r = compareSnapshots(latest, prev).repos["a/b"];
    expect(r.netStarGrowth).toBeNull();
    expect(r.displayedDailyChange).toBeNull();
  });

  it("distinguishes new, returning and dropped repositories", () => {
    const prev = snap("2026-10-10", [repo("x/y")]);
    const latest = snap("2026-10-11", [repo("a/b"), repo("old/one")]);
    const c = compareSnapshots(latest, prev, new Set(["old/one"]));
    expect(c.repos["a/b"].appearance).toBe("new");
    expect(c.repos["old/one"].appearance).toBe("returning");
    expect(c.repos["old/one"].netStarGrowth).toBeNull();
    expect(c.droppedOut).toEqual(["x/y"]);
  });

  it("flags comparisons spanning more than one day and lists missing dates", () => {
    const c = compareSnapshots(snap("2026-10-09", [repo("a/b")], "06:41"), snap("2026-10-07", [repo("a/b")], "06:11"));
    expect(c.spanHours).toBe(48.5);
    expect(c.spansMultipleDays).toBe(true);
    expect(c.missingDates).toEqual(["2026-10-08"]);
  });

  it("does not flag a normal ~24h comparison", () => {
    const c = compareSnapshots(snap("2026-10-11", [repo("a/b")], "07:10"), snap("2026-10-10", [repo("a/b")], "06:00"));
    expect(c.spansMultipleDays).toBe(false);
  });
});
