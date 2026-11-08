import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import assert from "node:assert/strict";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (const port of [3000, 3001, 3002])
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
const dir = await mkdtemp(path.join(tmpdir(), "panda-voice-recovery-")),
  wav = path.join(dir, "synthetic-input.wav");
const rate = 48000,
  duration = 10,
  buffer = Buffer.alloc(44 + rate * duration * 2);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(buffer.length - 8, 4);
buffer.write("WAVEfmt ", 8);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(rate, 24);
buffer.writeUInt32LE(rate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(buffer.length - 44, 40);
for (let i = 0; i < rate * duration; i++) {
  const t = i / rate,
    voiced = (t >= 2 && t < 2.4) || (t >= 5 && t < 5.4);
  buffer.writeInt16LE(
    voiced ? Math.round(Math.sin((i * 2 * Math.PI * 220) / rate) * 5000) : 0,
    44 + i * 2,
  );
}
await writeFile(wav, buffer);
const preload = new URL(
  "../tests/fixtures/transcription-provider.mjs",
  import.meta.url,
).href;
const proc = spawn(process.execPath, ["scripts/run.mjs", "start", "all"], {
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_OPTIONS: `--import=${preload}`,
    PANDA_TRANSCRIPTION_TEST_PROVIDER: "synthetic",
    PANDA_DATA_DIR: dir,
    PANDA_RUNTIME: "demo",
    PANDA_INTEGRATION: "connected",
    PANDA_AI_MODE: "demo",
    PANDA_TTS_MODE: "elevenlabs",
    PANDA_ELEVENLABS_API_KEY: "synthetic-key",
    PANDA_ELEVENLABS_VOICE_ID: "test",
    PANDA_ELEVENLABS_MODEL_ID: "test",
  },
});
let logs = "",
  browser;
proc.stdout.on("data", (b) => (logs += b));
proc.stderr.on("data", (b) => (logs += b));
const origin = "http://127.0.0.1:3000";
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin + "/api/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (proc.exitCode !== null) break;
    await sleep(300);
  }
  if (!ready) throw Error("Test servers failed: " + logs);
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PANDA_TEST_CHROME ||
      (process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : undefined),
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${wav}`,
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  let answers = 0,
    transcripts = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().endsWith("/api/voice/checkin/answer")) answers++;
    if (r.url().endsWith("/api/voice/transcribe")) transcripts++;
  });
  await page.goto(origin);
  await page
    .getByText("Ready for a good day, Alex?", { exact: true })
    .waitFor();
  const start = page.waitForResponse((r) =>
    r.url().endsWith("/api/voice/checkin/start"),
  );
  const noWords = page.waitForResponse((r) =>
    r.url().endsWith("/api/voice/transcribe"),
  );
  const continued = page.waitForResponse((r) =>
    r.url().endsWith("/api/voice/checkin/answer"),
  );
  await page
    .getByRole("button", { name: "Talk to Panda", exact: true })
    .click();
  const checkin = (await (await start).json()).data.checkin.id;
  const empty = await noWords;
  assert.equal(empty.status(), 200);
  assert.equal((await empty.json()).data.text, "");
  await page.getByRole("heading", { name: /I’m listening/ }).waitFor();
  assert.equal(answers, 0);
  assert.equal(
    await page.getByText(/Speech could not be transcribed/).count(),
    0,
  );
  const output = path.resolve(
    process.env.PANDA_TEST_ARTIFACT_DIR || "work/voice-recovery",
  );
  await mkdir(output, { recursive: true });
  await page.screenshot({
    path: path.join(output, "panda-keeps-listening.png"),
  });
  const answered = (await (await continued).json()).data;
  assert.equal(answered.checkin.id, checkin);
  assert.equal(answered.checkin.stage, "medications");
  assert.equal(answers, 1);
  assert.ok(transcripts >= 2);
  await page.getByRole("heading", { name: /I’m listening/ }).waitFor();
  assert.deepEqual(errors, []);
  await page
    .getByRole("button", { name: "End voice conversation", exact: true })
    .click();
  console.log(
    "PASS: actual Worklet capture → silent/empty server transcription → automatic re-listening → next valid utterance advances the SAME check-in once. Synthetic microphone/provider fixtures; no real microphone used.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  try {
    if (process.platform === "win32") proc.kill("SIGTERM");
    else process.kill(-proc.pid, "SIGTERM");
  } catch {}
  await sleep(800);
  try {
    if (process.platform === "win32") proc.kill("SIGKILL");
    else process.kill(-proc.pid, "SIGKILL");
  } catch {}
  await rm(dir, { recursive: true, force: true });
}
