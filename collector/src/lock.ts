import { promises as fs } from "node:fs";
import path from "node:path";
import { log } from "./util.js";

export class LockHeldError extends Error {}

/**
 * Exclusive file lock (O_EXCL create). Prevents overlapping local runs.
 * In GitHub Actions the workflow `concurrency` group is the primary guard;
 * this is a second line of defence. A lock older than `staleMinutes` is
 * assumed abandoned (crashed run) and replaced.
 */
export async function withLock<T>(lockFile: string, staleMinutes: number, fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(lockFile), { recursive: true });
  const body = JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() });
  try {
    await fs.writeFile(lockFile, body, { flag: "wx" });
  } catch (e: any) {
    if (e?.code !== "EEXIST") throw e;
    const stat = await fs.stat(lockFile).catch(() => null);
    const ageMin = stat ? (Date.now() - stat.mtimeMs) / 60000 : Infinity;
    if (ageMin < staleMinutes) {
      throw new LockHeldError(`Another RepoRadar run holds ${lockFile} (age ${ageMin.toFixed(1)} min).`);
    }
    log.warn(`Replacing stale lock (${ageMin.toFixed(1)} min old).`);
    await fs.rm(lockFile, { force: true });
    await fs.writeFile(lockFile, body, { flag: "wx" });
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lockFile, { force: true });
  }
}
