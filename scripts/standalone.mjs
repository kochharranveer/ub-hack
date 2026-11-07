import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [app, port, base, context] of [
  ["panda", 3000, "", "context"],
  ["care", 3001, "/care", "state"],
  ["rehab", 3002, "/rehab", "context"],
]) {
  const dir = await mkdtemp(path.join(tmpdir(), "panda-solo-"));
  const proc = spawn(process.execPath, ["scripts/run.mjs", "start", app], {
    detached: process.platform !== "win32",
    stdio: "ignore",
    env: {
      ...process.env,
      PANDA_INTEGRATION: "fixture",
      PANDA_AI_MODE: "demo",
      PANDA_TTS_MODE: "browser",
      PANDA_DATA_DIR: dir,
    },
  });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}${base}/api/health`);
        if (r.ok) {
          const h = await r.json();
          assert.equal(h.app, app);
          assert.equal(h.mode, "fixture");
          ready = true;
          break;
        }
      } catch {}
      await sleep(200);
    }
    assert.ok(ready, app + " did not start");
    const r = await fetch(`http://127.0.0.1:${port}${base}/api/${context}`);
    assert.equal(r.status, 200);
    const out = await r.json();
    assert.equal(out.ok, true);
    assert.equal(out.data.plan.version, 1);
    console.log("PASS: " + app + " runs alone with explicit fixture peers.");
  } finally {
    try {
      if (process.platform !== "win32") process.kill(-proc.pid, "SIGTERM");
      else proc.kill("SIGTERM");
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
    await sleep(500);
    try {
      if (process.platform !== "win32") process.kill(-proc.pid, "SIGKILL");
      else proc.kill("SIGKILL");
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
    await rm(dir, { recursive: true, force: true });
  }
}
