import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/** Write JSON atomically: write a temp file in the same directory, then rename. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

export async function readJson<T = unknown>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw new Error(`Could not read ${file}: ${err?.message ?? err}`);
  }
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** UTC calendar date (YYYY-MM-DD) for an instant. */
export function utcDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function hoursBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

/** Every UTC date strictly between two dates. */
export function datesBetween(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const d = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`).getTime();
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getTime() < end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

export const log = {
  info: (...a: unknown[]) => console.log("[reporadar]", ...a),
  warn: (...a: unknown[]) => console.warn("[reporadar] WARN", ...a),
  error: (...a: unknown[]) => console.error("[reporadar] ERROR", ...a),
};
