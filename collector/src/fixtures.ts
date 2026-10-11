/**
 * Generates SAMPLE data for development and the first UI build.
 * Repository names, descriptions, topics and the latest total-star counts come
 * from real public GitHub API responses saved in fixtures/api. Daily "stars
 * today" values and the earlier history are invented to exercise every UI
 * state, so every snapshot is marked origin:"fixture" and the UI labels it.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION, type RepoMeta, type RunRecord, type Snapshot, type CachedSummary, type LearningSummaryBody } from "../../shared/schema.js";
import { ROOT, makePaths } from "./config.js";
import { PARSER_VERSION } from "./parseTrending.js";
import { writeSnapshot } from "./store.js";
import { writeJsonAtomic } from "./util.js";
import { cacheKeyFor, sanitiseReadme, summaryFile, validateSummaryOutput } from "./summarise.js";

const DATES = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-09", "2026-10-10", "2026-10-11"];
const TIMES = ["06:12", "06:09", "06:15", "06:11", "06:41", "06:13", "06:14"];
const M = "missing" as const; // displayed on the list, but "stars today" not shown
type Cell = number | null | typeof M;

const TABLE: Record<string, Cell[]> = {
  "morluto/rea":                 [null, null, null, 3100, 9800, 18400, 25585],
  "boykopovar/AnyPS5":           [null, null, null, null, null, 2100, 3977],
  "storytold/artcraft":          [null, null, null, null, null, null, 2956],
  "cathrynlavery/diagram-design":[null, null, 640, 820, null, 950, 1083],
  "bilawalsidhu/gods-eye-view":  [1200, 980, 760, null, null, null, 872],
  "lyogavin/airllm":             [null, null, null, null, null, 610, 541],
  "chrislgarry/Apollo-11":       [null, 420, null, null, null, null, 496],
  "pytorch/pytorch":             [null, null, null, null, null, null, 314],
  "microsoft/markitdown":        [null, null, null, 1450, 1210, 980, 640],
  "browser-use/browser-use":     [880, 760, 690, 540, 410, 380, M],
  "n8n-io/n8n":                  [520, 470, 450, 430, 380, 360, 330],
  "sherlock-project/sherlock":   [null, null, null, null, null, 260, 190],
  "ollama/ollama":               [610, 540, 500, 470, null, null, null],
  "astral-sh/uv":                [300, 280, null, null, null, null, null],
  "shadcn-ui/ui":                [410, 390, 360, 330, 300, null, null],
  "microsoft/playwright":        [null, 250, 240, 220, 210, 205, null],
  "supabase/supabase":           [290, null, null, null, 260, 240, null],
  "tailwindlabs/tailwindcss":    [null, null, 220, 200, 190, null, null],
};

async function apiFixture(fullName: string) {
  return JSON.parse(await fs.readFile(path.join(ROOT, "fixtures/api", fullName.replace("/", "_") + ".json"), "utf8"));
}

export async function generateFixtures(outDir = path.join(ROOT, "fixtures/data")) {
  await fs.rm(outDir, { recursive: true, force: true });
  const paths = makePaths(outDir, path.join(outDir, "_state"), path.join(outDir, "_feed"));
  const api: Record<string, any> = {};
  for (const n of Object.keys(TABLE)) api[n] = await apiFixture(n);

  // Hidden "true" totals per day, walked backwards from the real current count.
  const totals: Record<string, number[]> = {};
  for (const [n, cells] of Object.entries(TABLE)) {
    const t: number[] = new Array(DATES.length);
    t[DATES.length - 1] = api[n].stargazers_count;
    for (let k = DATES.length - 2; k >= 0; k--) {
      const next = cells[k + 1];
      const gainNext = typeof next === "number" ? Math.round(next * 0.97) : 45;
      const gapDays = k === 3 ? 2 : 1; // 10-07 -> 10-09 skips a day
      t[k] = Math.max(0, t[k + 1] - gainNext * gapDays);
    }
    totals[n] = t;
  }

  const runs: RunRecord[] = [];
  for (let d = 0; d < DATES.length; d++) {
    const date = DATES[d];
    const collectedAt = `${date}T${TIMES[d]}:00.000Z`;
    const rows = Object.entries(TABLE)
      .filter(([, c]) => c[d] !== null)
      .map(([n, c]) => ({ n, today: c[d] === M ? null : (c[d] as number) }))
      .sort((a, b) => (b.today ?? -1) - (a.today ?? -1));
    const meta: Record<string, RepoMeta> = {};
    const repos = rows.map((r, i) => {
      const a = api[r.n];
      meta[r.n] = {
        fullName: r.n, fetchedAt: collectedAt, topics: a.topics ?? [],
        license: a.license?.spdx_id && a.license.spdx_id !== "NOASSERTION" ? a.license.spdx_id : a.license?.name ?? null,
        homepage: a.homepage && /^https?:\/\//.test(a.homepage) ? a.homepage : null,
        archived: !!a.archived, pushedAt: a.pushed_at ?? null, createdAt: a.created_at ?? null, defaultBranch: a.default_branch ?? null,
      };
      const [owner, name] = r.n.split("/");
      // On 10-10 the page did not show sherlock's total (exercises a null comparison today).
      const totalStars = date === "2026-10-10" && r.n === "sherlock-project/sherlock" ? null : totals[r.n][d];
      return { rank: i + 1, fullName: r.n, owner, name, url: `https://github.com/${r.n}`, description: a.description ?? null, language: a.language ?? null, totalStars, forks: a.forks_count ?? null, starsToday: r.today };
    });
    const warnings = repos.filter((r) => r.starsToday === null).map((r) => `${r.fullName}: "stars today" not displayed; recorded as missing.`);
    if (date === "2026-10-10") warnings.push(`sherlock-project/sherlock: total stars not displayed; recorded as missing.`);
    const snap: Snapshot = {
      schemaVersion: SCHEMA_VERSION, date, collectedAt,
      source: { url: "https://github.com/trending?since=daily", since: "daily", parserVersion: PARSER_VERSION },
      origin: "fixture", repos, meta, warnings,
    };
    await writeSnapshot(paths, snap);
    runs.push({ runId: `fixture-${date}`, startedAt: collectedAt, finishedAt: collectedAt.replace(/:00\.000Z$/, ":38.000Z"), status: "success", date, message: `Collected ${repos.length} repositories.` });
    if (date === "2026-10-07") {
      runs.push({ runId: "fixture-2026-10-08", startedAt: "2026-10-08T06:10:00.000Z", finishedAt: "2026-10-08T06:10:21.000Z", status: "failed", date: "2026-10-08", message: "Trending page returned HTTP 503" });
    }
    if (date === "2026-10-10") {
      runs.push({ runId: "fixture-2026-10-10-rerun", startedAt: "2026-10-10T09:02:00.000Z", finishedAt: "2026-10-10T09:02:01.000Z", status: "skipped", date, message: "Snapshot for 2026-10-10 already collected at 2026-10-10T06:13:00.000Z; nothing to do." });
    }
  }
  await writeJsonAtomic(paths.runsFile, runs);

  // Two hand-written summaries, grounded in the saved README fixtures, pushed
  // through the SAME validator as model output.
  for (const [fullName, body] of Object.entries(FIXTURE_SUMMARIES)) {
    const readmeRaw = JSON.parse(await fs.readFile(path.join(ROOT, "fixtures/readme", fullName.replace("/", "_") + ".json"), "utf8"));
    const text = sanitiseReadme(Buffer.from(readmeRaw.content, "base64").toString("utf8"), 20000);
    const a = api[fullName];
    const allowedUrls = [`https://github.com/${fullName}`, readmeRaw.html_url, a.homepage].filter(Boolean);
    const v = validateSummaryOutput(JSON.stringify(body), { allowedUrls, sourceText: [fullName, a.description, a.language, (a.topics ?? []).join(" "), text].join("\n") });
    if (!v.ok) throw new Error(`Fixture summary for ${fullName} failed validation: ${v.errors.join("; ")}`);
    const cached: CachedSummary = {
      fullName, cacheKey: cacheKeyFor(fullName, readmeRaw.sha, "learn-v1", "fixture"), generatedAt: "2026-10-11T06:20:00.000Z",
      model: "fixture (hand-written, no model call)", promptVersion: "learn-v1", readmeSha: readmeRaw.sha, origin: "fixture",
      summary: v.summary, validationNotes: v.notes,
    };
    await writeJsonAtomic(summaryFile(paths, fullName), cached);
  }
  return outDir;
}

const FIXTURE_SUMMARIES: Record<string, LearningSummaryBody> = {
  "microsoft/markitdown": {
    whatItDoes: "A lightweight Python utility that converts files such as PDF, PowerPoint, Word, Excel, images, audio, HTML, CSV/JSON/XML, ZIP files, YouTube URLs and EPubs into Markdown, aimed at LLM and text-analysis pipelines rather than high-fidelity human-readable conversion.",
    intendedUsers: ["Developers building LLM or RAG pipelines that need document text", "People who want a command-line tool to turn documents into Markdown"],
    documentedTechnologies: ["Python", "Markdown", "OpenAI", "Document Intelligence", "uv"],
    learningOpportunities: [
      "See how one API (convert) can route many file types to format-specific converters.",
      "Learn why Markdown is a token-efficient intermediate format for LLM input.",
      "Read the Security Considerations section to understand the risks of converting untrusted inputs.",
    ],
    smallExperiment: {
      title: "Convert one of your own PDFs and compare the Markdown",
      steps: [
        "Create a fresh Python virtual environment as described in the README.",
        "Install the package with pip install 'markitdown[all]'.",
        "Run markitdown on a PDF you created yourself and redirect the output to a .md file.",
        "Compare headings, lists and tables in the Markdown against the original document.",
      ],
    },
    caveats: [
      "The README says it performs I/O with the privileges of the current process; do not pass untrusted inputs to it directly.",
      "Output is meant for text-analysis tools and may not suit high-fidelity conversion for people.",
      "LLM image descriptions require your own OpenAI-compatible client and incur that provider's costs.",
    ],
    sources: [
      { label: "Repository", url: "https://github.com/microsoft/markitdown" },
      { label: "README", url: "https://github.com/microsoft/markitdown/blob/main/README.md" },
    ],
  },
  "morluto/rea": {
    whatItDoes: "REA (Reverse Engineer Anything) is an MCP server and CLI that lets a coding agent inspect native binaries, JavaScript and Electron apps, .NET assemblies and websites without their source code, returning findings together with the evidence and limitations behind them.",
    intendedUsers: ["Developers who use coding agents such as Claude Code, Codex, Cursor or Gemini CLI", "People curious how a feature in an existing app is implemented"],
    documentedTechnologies: ["MCP", "Node.js", "npm", "Electron", "JavaScript", "Hopper", "Ghidra", "IDA", "Bun"],
    learningOpportunities: [
      "Study how an MCP server exposes analysis tools to an agent and returns evidence with each result.",
      "Learn what static analysis of an Electron app reveals: modules, imports and Electron boundaries.",
      "Compare agent-driven workflows with running the same commands from a terminal.",
    ],
    smallExperiment: {
      title: "Statically inspect an Electron app you own",
      steps: [
        "Read the Quick start and the CLI and Evidence guide in the repository first.",
        "Inside a disposable VM or container with Node.js 22+, extract an Electron app you built yourself.",
        "Run the documented analyze-javascript-application command with --json against that directory.",
        "Review the modules, imports and Electron boundaries it reports against what you know of your app.",
      ],
    },
    caveats: [
      "Setup changes your agent configuration; the README asks you to review the proposed changes before approving them.",
      "Native analysis depends on Hopper, Ghidra or IDA being installed, and support varies by target and host.",
      "Only analyse software you are licensed and permitted to reverse engineer.",
      "The README notes that REA changes quickly, so commands may differ between releases.",
    ],
    sources: [
      { label: "Repository", url: "https://github.com/morluto/rea" },
      { label: "README", url: "https://github.com/morluto/rea/blob/main/README.md" },
      { label: "Project website", url: "https://rea.tools/" },
    ],
  },
};
