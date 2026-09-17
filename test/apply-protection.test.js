import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("apply-protection requires a token before calling GitHub", () => {
  const result = spawnSync(process.execPath, ["src/apply-protection.js", "--owner", "acme", "--repo", "app"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, GITHUB_TOKEN: "" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GITHUB_TOKEN/);
});
