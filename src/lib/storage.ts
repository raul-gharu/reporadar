import { useCallback, useEffect, useState } from "react";
import type { FeedRepo } from "../../shared/schema";

/**
 * Browser-local bookmarks. Nothing leaves the device. If storage is blocked
 * (private mode, sandboxed previews) we fall back to memory and say so.
 */
const KEY = "reporadar:bookmarks:v1";
let memory: Record<string, Bookmark> = {};
let storageOk: boolean | null = null;

export interface Bookmark {
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  savedAt: string;
  /** Observation at the moment of saving, with its timestamp. */
  seen: { date: string; collectedAt: string; starsToday: number | null; totalStars: number | null };
}

function probe(): boolean {
  if (storageOk !== null) return storageOk;
  try {
    const k = "__rr_probe";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    storageOk = true;
  } catch {
    storageOk = false;
  }
  return storageOk;
}

function read(): Record<string, Bookmark> {
  if (!probe()) return memory;
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function write(v: Record<string, Bookmark>) {
  memory = v;
  if (probe()) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* quota or blocked: memory copy still works this session */
    }
  }
  window.dispatchEvent(new Event("reporadar:bookmarks"));
}

export function useBookmarks() {
  const [items, setItems] = useState<Record<string, Bookmark>>(() => read());
  useEffect(() => {
    const sync = () => setItems(read());
    window.addEventListener("reporadar:bookmarks", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("reporadar:bookmarks", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const toggle = useCallback((r: FeedRepo, snapshot: { date: string; collectedAt: string }) => {
    const cur = read();
    const k = r.fullName.toLowerCase();
    if (cur[k]) delete cur[k];
    else
      cur[k] = {
        fullName: r.fullName, url: r.url, description: r.description, language: r.language, savedAt: new Date().toISOString(),
        seen: { date: snapshot.date, collectedAt: snapshot.collectedAt, starsToday: r.starsToday, totalStars: r.totalStars },
      };
    write({ ...cur });
  }, []);
  const remove = useCallback((fullName: string) => {
    const cur = read();
    delete cur[fullName.toLowerCase()];
    write({ ...cur });
  }, []);
  const clear = useCallback(() => write({}), []);
  const isSaved = useCallback((fullName: string) => !!items[fullName.toLowerCase()], [items]);
  return { items, toggle, remove, clear, isSaved, persistent: probe() };
}

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      window.localStorage.setItem("reporadar:theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}
