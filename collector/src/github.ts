import { z } from "zod";
import type { RepoMeta } from "../../shared/schema.js";
import { fetchWithTimeout } from "./util.js";

/**
 * Minimal GitHub REST client. Reads metadata and README text only.
 * Repository code is never cloned, installed or executed.
 */
export type Fetcher = (url: string, init?: RequestInit & { timeoutMs?: number }) => Promise<Response>;

const API = "https://api.github.com";

const RepoApiSchema = z.object({
  full_name: z.string(),
  topics: z.array(z.string()).optional().default([]),
  license: z.object({ spdx_id: z.string().nullable().optional(), name: z.string().nullable().optional() }).nullable().optional(),
  homepage: z.string().nullable().optional(),
  archived: z.boolean().optional().default(false),
  pushed_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  default_branch: z.string().nullable().optional(),
  html_url: z.string(),
});

const ReadmeApiSchema = z.object({
  sha: z.string(),
  size: z.number(),
  encoding: z.string(),
  content: z.string(),
  html_url: z.string().url(),
});

export interface GitHubClientOptions {
  token?: string;
  userAgent: string;
  timeoutMs: number;
  fetcher?: Fetcher;
}

export function githubClient(opts: GitHubClientOptions) {
  const f: Fetcher = opts.fetcher ?? fetchWithTimeout;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": opts.userAgent,
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  async function getJson(path: string) {
    const res = await f(`${API}${path}`, { headers, timeoutMs: opts.timeoutMs });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API ${path} -> HTTP ${res.status}`);
    return res.json();
  }

  return {
    async repoMeta(fullName: string): Promise<RepoMeta | null> {
      const raw = await getJson(`/repos/${fullName}`);
      if (!raw) return null;
      const r = RepoApiSchema.parse(raw);
      const homepage = r.homepage && /^https?:\/\//i.test(r.homepage) ? r.homepage.slice(0, 300) : null;
      return {
        fullName,
        fetchedAt: new Date().toISOString(),
        topics: r.topics.slice(0, 50),
        license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : r.license?.name ?? null,
        homepage,
        archived: r.archived,
        pushedAt: r.pushed_at ?? null,
        createdAt: r.created_at ?? null,
        defaultBranch: r.default_branch ?? null,
      };
    },

    /** README as plain text, capped to `maxBytes` before decoding is used. */
    async readme(fullName: string, maxBytes = 200_000): Promise<{ text: string; sha: string; htmlUrl: string } | null> {
      const raw = await getJson(`/repos/${fullName}/readme`);
      if (!raw) return null;
      const r = ReadmeApiSchema.parse(raw);
      if (r.encoding !== "base64") throw new Error(`Unexpected README encoding ${r.encoding}`);
      if (r.size > maxBytes) throw new Error(`README too large (${r.size} bytes)`);
      return { text: Buffer.from(r.content, "base64").toString("utf8"), sha: r.sha, htmlUrl: r.html_url };
    },
  };
}
export type GitHubClient = ReturnType<typeof githubClient>;
