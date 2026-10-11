import * as cheerio from "cheerio";
import { TrendingRepoSchema, type TrendingRepo } from "../../shared/schema.js";

/** Bump whenever parsing logic changes; recorded in every snapshot. */
export const PARSER_VERSION = "trending-html-2";

export class ParserError extends Error {}

/** "1,234" -> 1234; "" / undefined / garbage -> null (never 0). */
export function parseCount(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const m = raw.replace(/\s+/g, " ").trim().match(/^([\d,.]+)\s*([kKmM])?$/);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (m[2]) n *= m[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
  return Math.round(n);
}

export interface ParseResult {
  repos: TrendingRepo[];
  warnings: string[];
}

/**
 * Parse the GitHub Trending HTML page. Pure function: no network, no I/O.
 * Treats the HTML as untrusted: only text content and validated hrefs are kept.
 */
export function parseTrendingHtml(html: string, baseUrl = "https://github.com"): ParseResult {
  const $ = cheerio.load(html);
  const rows = $("article.Box-row");
  const warnings: string[] = [];
  const repos: TrendingRepo[] = [];
  const seen = new Set<string>();

  if (rows.length === 0) {
    throw new ParserError("No repository rows (article.Box-row) found — GitHub may have changed the page layout.");
  }

  rows.each((i, el) => {
    const row = $(el);
    const href = (row.find("h2 a").first().attr("href") ?? "").trim();
    const m = href.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
    if (!m) {
      warnings.push(`Row ${i + 1}: could not read repository link (${JSON.stringify(href.slice(0, 80))}); skipped.`);
      return;
    }
    const [, owner, name] = m;
    const fullName = `${owner}/${name}`;
    const key = fullName.toLowerCase();
    if (seen.has(key)) {
      warnings.push(`Row ${i + 1}: duplicate ${fullName}; kept first occurrence.`);
      return;
    }

    const description = row.find("p").first().text().replace(/\s+/g, " ").trim() || null;
    const language = row.find('[itemprop="programmingLanguage"]').first().text().trim() || null;

    const starsText = row.find('a[href$="/stargazers"]').first().text();
    const forksText = row.find('a[href$="/forks"]').first().text();
    const totalStars = parseCount(starsText);
    const forks = parseCount(forksText);

    // "1,234 stars today" lives in a trailing span; match on text, not position.
    let starsToday: number | null = null;
    const todayMatch = row.text().replace(/\s+/g, " ").match(/([\d,.]+[kKmM]?)\s+stars?\s+today/i);
    if (todayMatch) starsToday = parseCount(todayMatch[1]);
    else warnings.push(`${fullName}: "stars today" not displayed; recorded as missing.`);
    if (totalStars === null) warnings.push(`${fullName}: total stars not displayed; recorded as missing.`);

    const candidate = {
      rank: repos.length + 1,
      fullName,
      owner,
      name,
      url: new URL(`/${owner}/${name}`, baseUrl).toString(),
      description: description ? description.slice(0, 500) : null,
      language,
      totalStars,
      forks,
      starsToday,
    };
    const parsed = TrendingRepoSchema.safeParse(candidate);
    if (!parsed.success) {
      warnings.push(`${fullName}: failed validation (${parsed.error.issues[0]?.message}); skipped.`);
      return;
    }
    seen.add(key);
    repos.push(parsed.data);
  });

  if (repos.length === 0) throw new ParserError("Rows were found but none could be parsed.");
  return { repos, warnings };
}
