import path from "node:path";
import { ROOT, loadConfigs, makePaths } from "./config.js";
import { collectOnce } from "./collect.js";
import { buildFeed } from "./feed.js";
import { githubClient } from "./github.js";
import { withLock, LockHeldError } from "./lock.js";
import { runNotify } from "./notify.js";
import { listSnapshots } from "./store.js";
import { llmFromEnv, runSummaries } from "./summarise.js";
import { generateFixtures } from "./fixtures.js";
import { log } from "./util.js";

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (f: string) => args.includes(f);
const opt = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const configs = await loadConfigs();
  const dataDir = opt("--data") ? path.resolve(opt("--data")!) : path.join(ROOT, "data");
  const paths = makePaths(dataDir);
  const gh = githubClient({ token: process.env.GITHUB_TOKEN, userAgent: configs.collector.userAgent, timeoutMs: configs.collector.requestTimeoutMs });

  const feed = async () => {
    // Before the first real collection, build the site from labelled sample data.
    let p = paths;
    if (!opt("--data") && (await listSnapshots(paths)).length === 0) {
      log.warn("No real snapshots in data/ yet; building the feed from fixtures/data (labelled as sample data).");
      p = makePaths(path.join(ROOT, "fixtures/data"));
    }
    return buildFeed({ paths: p, ...configs });
  };

  switch (cmd) {
    case "fixtures":
      log.info(`Fixtures written to ${await generateFixtures()}`);
      return;
    case "collect": {
      const r = await withLock(paths.lockFile, configs.collector.lockStaleAfterMinutes, () =>
        collectOnce({ paths, config: configs.collector, force: flag("--force"), github: gh }),
      );
      log.info(r.status, r.status === "failed" ? r.error : "");
      process.exitCode = r.status === "failed" ? 1 : 0;
      return;
    }
    case "feed":
      await feed();
      return;
    case "summarise": {
      const built = await buildFeed({ paths, ...configs });
      if (!built) return;
      log.info(JSON.stringify(await runSummaries({ paths, config: configs.collector, repos: built.latest.repos, github: gh, llm: llmFromEnv() })));
      await buildFeed({ paths, ...configs });
      return;
    }
    case "notify": {
      const built = await buildFeed({ paths, ...configs });
      if (!built) return;
      const r = await runNotify({ paths, config: configs.notifications, repos: built.latest.repos, snapshot: built.latest.snapshot, staleAfterHours: configs.collector.staleAfterHours, send: flag("--send") });
      log.info(JSON.stringify(r));
      return;
    }
    case "daily": {
      // One locked pipeline: collect -> summaries -> feed -> notify.
      await withLock(paths.lockFile, configs.collector.lockStaleAfterMinutes, async () => {
        const c = await collectOnce({ paths, config: configs.collector, github: gh });
        if (c.status !== "failed") {
          const pre = await buildFeed({ paths, ...configs });
          if (pre) log.info("summaries:", JSON.stringify(await runSummaries({ paths, config: configs.collector, repos: pre.latest.repos, github: gh, llm: llmFromEnv() })));
        }
        // Always rebuild: on failure this keeps the last good data and surfaces the failed run.
        const built = await buildFeed({ paths, ...configs });
        if (c.status === "failed") {
          log.error("Collection failed; last good feed preserved, notifications skipped.");
          process.exitCode = 1;
          return;
        }
        if (built) log.info("notify:", JSON.stringify(await runNotify({ paths, config: configs.notifications, repos: built.latest.repos, snapshot: built.latest.snapshot, staleAfterHours: configs.collector.staleAfterHours, send: flag("--send") })));
      });
      return;
    }
    default:
      console.log("Usage: tsx collector/src/cli.ts <fixtures|collect [--force]|feed [--data dir]|summarise|notify [--send]|daily [--send]>");
      process.exitCode = 2;
  }
}

main().catch((e) => {
  if (e instanceof LockHeldError) {
    log.warn(e.message, "Exiting without changes.");
    process.exitCode = 0;
    return;
  }
  log.error(e?.stack ?? e);
  process.exitCode = 1;
});
