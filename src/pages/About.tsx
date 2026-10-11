import type { ReactNode } from "react";
import notifications from "../../config/notifications.json";
import collector from "../../config/collector.json";
import { CATEGORY_LABEL } from "../lib/format";
import type { Category } from "../../shared/schema";
import { PageHeader } from "../components/ui";

function Def({ term, children, tag }: { term: string; tag: string; children: ReactNode }) {
  return (
    <div className="card p-5">
      <p className="label">{tag}</p>
      <h3 className="mt-1 text-[15.5px] font-bold">{term}</h3>
      <div className="mt-1.5 text-[14px] text-muted">{children}</div>
    </div>
  );
}

export default function About() {
  const rule = notifications.rule;
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="About" title="How RepoRadar works">
        A small personal tool: once a day it reads GitHub Trending, keeps a dated snapshot, and compares it with the one before. That's it — no database, no monitoring of every repository.
      </PageHeader>

      <h2 className="label mb-3">The four numbers, and what they are not</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Def tag="From GitHub" term="Stars today">
          GitHub's own "N stars today" figure, copied exactly as displayed at our collection time. We don't know GitHub's exact window or method.
        </Def>
        <Def tag="Calculated by us" term="Net growth">
          Total stars at our latest collection minus total stars at our previous collection. Only shown when the repository was on both lists. If our snapshots are more than {collector.multiDayThresholdHours} hours apart, it's labelled as a multi-day figure.
        </Def>
        <Def tag="Calculated by us" term="Daily figure change">
          How GitHub's displayed "stars today" moved between our two snapshots. It describes momentum of GitHub's figure, not a star count.
        </Def>
        <Def tag="Calculated by us" term="New to our list">
          Not in our previous snapshot and never seen in any earlier one. "Returning" means it was absent last time but seen before.
        </Def>
      </div>
      <p className="mt-4 text-[14px] text-muted">
        A missing observation is shown as unknown — never as zero. We only see repositories while they're on the Trending page, so a repository that left the list has no current figures here.
      </p>

      <h2 className="label mb-3 mt-10">Freshness</h2>
      <ul className="space-y-2 text-[14px] text-muted">
        <li>Every page shows the actual collection time in your local time zone (hover for UTC).</li>
        <li>Data older than {collector.staleAfterHours} hours is labelled stale.</li>
        <li>If a collection fails, the last good snapshot stays up and the failure is shown.</li>
      </ul>

      <h2 className="label mb-3 mt-10">Daily digest rule</h2>
      <div className="card p-5 text-[14px]">
        <ul className="space-y-1.5">
          <li><span className="text-muted">Relevant to:</span> {rule.categories.map((c) => CATEGORY_LABEL[c as Category]).join(", ")}</li>
          <li><span className="text-muted">At least</span> <span className="font-mono font-semibold">{rule.minDisplayedStarsToday}</span> <span className="text-muted">stars today, as displayed by GitHub</span></li>
          <li><span className="text-muted">Not notified within the last</span> <span className="font-mono font-semibold">{rule.cooldownDays}</span> <span className="text-muted">days</span></li>
          <li><span className="text-muted">At most</span> <span className="font-mono font-semibold">{rule.maxPerDigest}</span> <span className="text-muted">discoveries per digest</span></li>
        </ul>
        <p className="mt-3 text-[13px] text-faint">
          Delivery is currently {notifications.enabled ? "enabled" : "switched off"}. Categories come from transparent keyword rules on the name, description and GitHub topics. "Meets alert rule" on a card checks relevance and the threshold only; who was notified when is kept private.
        </p>
      </div>

      <h2 className="label mb-3 mt-10">Learning notes</h2>
      <p className="text-[14px] text-muted">
        Notes are written only for selected repositories, using their GitHub metadata and README fetched through the GitHub API. Repository code is never downloaded or run. README text is treated as untrusted; model output must pass a strict schema check, may only cite the repository's own links, and technologies are kept only if they appear in the source text. Notes are cached per README version and there's a hard limit per run.
      </p>

      <h2 className="label mb-3 mt-10">Privacy</h2>
      <p className="text-[14px] text-muted">
        Saved repositories and your theme choice live in this browser's local storage. There are no accounts, cookies or analytics. The site contains only public GitHub data.
      </p>
    </div>
  );
}
