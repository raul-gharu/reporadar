import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCount, parseTrendingHtml, ParserError } from "../collector/src/parseTrending.js";
import { pageHtml, rowHtml } from "./helpers.js";

describe("parseCount", () => {
  it("parses separators and suffixes", () => {
    expect(parseCount("1,234")).toBe(1234);
    expect(parseCount(" 12\n ")).toBe(12);
    expect(parseCount("1.2k")).toBe(1200);
  });
  it("returns null (not zero) for missing or garbage", () => {
    expect(parseCount(undefined)).toBeNull();
    expect(parseCount("")).toBeNull();
    expect(parseCount("n/a")).toBeNull();
  });
});

describe("parseTrendingHtml", () => {
  it("parses the saved live GitHub Trending page", () => {
    const html = readFileSync(new URL("../fixtures/html/trending-live.html", import.meta.url), "utf8");
    const { repos } = parseTrendingHtml(html);
    expect(repos.length).toBeGreaterThanOrEqual(5);
    const first = repos[0];
    expect(first.fullName).toBe("morluto/rea");
    expect(first.language).toBe("TypeScript");
    expect(first.totalStars).toBe(89905);
    expect(first.forks).toBe(19788);
    expect(first.starsToday).toBe(25585);
    expect(repos.map((r) => r.rank)).toEqual(repos.map((_, i) => i + 1));
  });

  it("records missing 'stars today', language and description as null", () => {
    const { repos, warnings } = parseTrendingHtml(pageHtml([rowHtml("a/b", { today: null, lang: null, desc: null })]));
    expect(repos[0].starsToday).toBeNull();
    expect(repos[0].language).toBeNull();
    expect(repos[0].description).toBeNull();
    expect(warnings.join(" ")).toMatch(/stars today/);
  });

  it("de-duplicates repeated repositories (case-insensitive) and keeps ranks contiguous", () => {
    const { repos, warnings } = parseTrendingHtml(pageHtml([rowHtml("a/b"), rowHtml("A/B"), rowHtml("c/d")]));
    expect(repos.map((r) => r.fullName)).toEqual(["a/b", "c/d"]);
    expect(repos.map((r) => r.rank)).toEqual([1, 2]);
    expect(warnings.some((w) => w.includes("duplicate"))).toBe(true);
  });

  it("skips rows with malformed links instead of guessing", () => {
    const bad = rowHtml("a/b").replace('href="/a/b"', 'href="javascript:alert(1)"');
    const { repos } = parseTrendingHtml(pageHtml([bad, rowHtml("c/d")]));
    expect(repos.map((r) => r.fullName)).toEqual(["c/d"]);
  });

  it("throws a ParserError when GitHub changes the layout", () => {
    expect(() => parseTrendingHtml("<html><div class='repo-card'>x</div></html>")).toThrow(ParserError);
  });

  it("finds 'stars today' even if its element moves", () => {
    const moved = rowHtml("a/b", { today: null }).replace("</h2>", "</h2><div>9,876 stars today</div>");
    expect(parseTrendingHtml(pageHtml([moved])).repos[0].starsToday).toBe(9876);
  });

  it("keeps untrusted description as plain text", () => {
    const { repos } = parseTrendingHtml(pageHtml([rowHtml("a/b", { desc: "<img src=x onerror=alert(1)>Nice" })]));
    expect(repos[0].description).toBe("Nice");
  });
});
