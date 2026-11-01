import { describe, expect, it } from "vitest";
import { githubClient } from "../collector/src/github.js";

function readmeApi(text: string, size = Buffer.byteLength(text)) {
  return new Response(JSON.stringify({
    sha: "sha-full",
    size,
    encoding: "base64",
    content: Buffer.from(text, "utf8").toString("base64"),
    html_url: "https://github.com/public-apis/public-apis/blob/master/README.md",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("GitHub README fetch", () => {
  it("truncates an oversized README and keeps the full-file SHA", async () => {
    const text = `${"A".repeat(250)}TAIL`;
    const gh = githubClient({
      userAgent: "test",
      timeoutMs: 1000,
      fetcher: async () => readmeApi(text, 335205),
    });
    const readme = await gh.readme("public-apis/public-apis", 100);
    expect(readme?.sha).toBe("sha-full");
    expect(readme?.text.startsWith("A")).toBe(true);
    expect(readme?.text).not.toContain("TAIL");
    expect(Buffer.byteLength(readme?.text ?? "")).toBeLessThanOrEqual(100);
  });

  it("still refuses a README above the inline decode limit", async () => {
    const gh = githubClient({
      userAgent: "test",
      timeoutMs: 1000,
      fetcher: async () => readmeApi("nope", 1_000_001),
    });
    await expect(gh.readme("a/b")).rejects.toThrow(/too large to decode/);
  });
});
