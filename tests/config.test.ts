import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { loadConfigs } from "../collector/src/config.js";

describe("project configuration", () => {
  it("config files are valid and keep risky features off by default", async () => {
    const c = await loadConfigs();
    expect(c.notifications.enabled).toBe(false);
    expect(c.collector.summaries.enabled).toBe(false);
    expect(c.notifications.rule).toEqual({ categories: ["ai", "devtools", "automation", "webdev"], minDisplayedStarsToday: 100, cooldownDays: 7, maxPerDigest: 3 });
  });

  it("the CSP hash in vercel.json matches the inline theme script", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const hash = createHash("sha256").update(script).digest("base64");
    expect(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).toContain(`sha256-${hash}`);
  });

  it("no secrets or private state are referenced by frontend source", () => {
    const out = execSync("grep -rIlE 'TELEGRAM|LLM_API_KEY|delivery\\.json|state/' src || true", { cwd: new URL("..", import.meta.url).pathname }).toString();
    expect(out.trim()).toBe("");
  });
});
