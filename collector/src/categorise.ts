import type { Category } from "../../shared/schema.js";
import type { CategoryRules } from "./config.js";

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Keyword-based categories. Deterministic and explainable; no AI involved. */
export function categorise(
  input: { fullName: string; description: string | null; language: string | null; topics?: string[] },
  rules: CategoryRules,
): Category[] {
  const haystack = [
    input.fullName.replace(/[\/_-]/g, " "),
    input.description ?? "",
    (input.topics ?? []).join(" ").replace(/-/g, " "),
    (input.topics ?? []).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  const out: Category[] = [];
  for (const [cat, words] of Object.entries(rules) as [Category, string[]][]) {
    if (!Array.isArray(words)) continue;
    if (words.some((w) => new RegExp(`(^|[^a-z0-9])${escapeRe(w.toLowerCase())}([^a-z0-9]|$)`).test(haystack))) out.push(cat);
  }
  // Language is a weak signal for web development only.
  if (!out.includes("webdev") && ["TypeScript", "JavaScript", "HTML", "CSS", "Vue", "Svelte", "Astro"].includes(input.language ?? "")) {
    out.push("webdev");
  }
  return out.length ? out : ["other"];
}
