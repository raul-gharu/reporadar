import { promises as fs } from "node:fs";
import path from "node:path";
import { SnapshotSchema, RunRecordSchema, type Snapshot, type RunRecord } from "../../shared/schema.js";
import type { Paths } from "./config.js";
import { readJson, writeJsonAtomic, log } from "./util.js";

export function snapshotPath(paths: Paths, date: string) {
  return path.join(paths.snapshotsDir, `${date}.json`);
}

/** All VALID snapshots, oldest first. Corrupt files are reported and ignored. */
export async function listSnapshots(paths: Paths): Promise<Snapshot[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(paths.snapshotsDir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  } catch (e: any) {
    if (e?.code !== "ENOENT") throw e;
  }
  const out: Snapshot[] = [];
  for (const f of files) {
    let raw: unknown;
    try {
      raw = await readJson(path.join(paths.snapshotsDir, f));
    } catch (e: any) {
      log.warn(`Ignoring unreadable snapshot ${f}: ${e?.message ?? e}`);
      continue;
    }
    const parsed = SnapshotSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
    else log.warn(`Ignoring invalid snapshot ${f}: ${parsed.error.issues[0]?.message}`);
  }
  return out.sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
}

export async function writeSnapshot(paths: Paths, snap: Snapshot) {
  const valid = SnapshotSchema.parse(snap); // never persist something we cannot read back
  await writeJsonAtomic(snapshotPath(paths, valid.date), valid);
}

export async function readRuns(paths: Paths): Promise<RunRecord[]> {
  const raw = await readJson<unknown[]>(paths.runsFile);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const p = RunRecordSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

export async function appendRun(paths: Paths, run: RunRecord, keep = 120) {
  const runs = await readRuns(paths);
  runs.push(RunRecordSchema.parse(run));
  await writeJsonAtomic(paths.runsFile, runs.slice(-keep));
}
