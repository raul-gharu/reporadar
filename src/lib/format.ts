import type { Category } from "../../shared/schema";

const nf = new Intl.NumberFormat("en-GB");
export const num = (n: number | null | undefined) => (n == null ? "—" : nf.format(n));
export const signed = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${nf.format(Math.abs(n))}`);

/** Local time with zone, e.g. "Sun 11 Oct 2026, 07:14 BST". */
export function when(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
}
export function dayLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
export function shortDay(date: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
export function ago(iso: string, now = Date.now()) {
  const h = (now - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
export const hoursSince = (iso: string, now = Date.now()) => (now - new Date(iso).getTime()) / 3_600_000;
export const spanText = (h: number | null) => (h == null ? "—" : h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`);

export const CATEGORY_LABEL: Record<Category, string> = {
  ai: "AI", devtools: "Developer tools", automation: "Automation", webdev: "Web development", data: "Data", security: "Security", other: "Other",
};
export const CATEGORY_ORDER: Category[] = ["ai", "devtools", "automation", "webdev", "data", "security", "other"];

/** Only http(s) links are ever rendered from feed data. */
export function safeHref(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const LANG_COLOURS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#e3c22e", Python: "#3572A5", Rust: "#c4724a", Go: "#00ADD8", "C++": "#f34b7d", C: "#6e6e6e",
  HTML: "#e34c26", CSS: "#563d7c", Java: "#b07219", Kotlin: "#A97BFF", Swift: "#F05138", Ruby: "#701516", Assembly: "#8a7f5c",
  "Jupyter Notebook": "#DA5B0B", Shell: "#89e051", "C#": "#178600", PHP: "#4F5D95", Dart: "#00B4AB", Vue: "#41b883", Zig: "#ec915c",
};
export const langColour = (l: string | null) => (l ? LANG_COLOURS[l] ?? "#8b8b8b" : "transparent");
