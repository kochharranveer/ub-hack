import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

// Isolated fictional records and fake devices: never opens the user's microphone/camera.
const dir = await mkdtemp(path.join(tmpdir(), "panda-browser-"));
const output = path.resolve(
  process.env.PANDA_TEST_ARTIFACT_DIR || "work/browser",
);
await mkdir(output, { recursive: true });
const proc = spawn(process.execPath, ["scripts/run.mjs", "start", "all"], {
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PANDA_DATA_DIR: dir,
    PANDA_RUNTIME: "demo",
    PANDA_INTEGRATION: "connected",
    PANDA_AI_MODE: "demo",
    PANDA_TTS_MODE: "elevenlabs",
    PANDA_ELEVENLABS_API_KEY: "browser-test-placeholder",
    PANDA_ELEVENLABS_VOICE_ID: "test",
    PANDA_ELEVENLABS_MODEL_ID: "test",
  },
});
let logs = "",
  browser;
proc.stdout.on("data", (b) => (logs += b));
proc.stderr.on("data", (b) => (logs += b));
const origin = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin + "/api/context");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (proc.exitCode !== null) break;
    await sleep(300);
  }
  if (!ready) throw Error("Test servers failed to start: " + logs);
  browser = await chromium.launch({
    executablePath:
      process.env.PANDA_TEST_CHROME ||
      (process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : undefined),
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["microphone", "camera"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  // Exercise the real Web Audio/worklet path with fake input and a synthetic PCM reply.
  let requests = 0;
  await page.route("**/api/voice/speak", async (route) => {
    requests++;
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "audio/pcm", "X-Panda-Audio-Rate": "24000" },
      body: (() => {
        const data = Buffer.alloc(24000 * 2 * 3);
        for (let i = 0; i < data.length / 2; i++)
          data.writeInt16LE(
            Math.round(Math.sin((i * 2 * Math.PI * 330) / 24000) * 6500),
            i * 2,
          );
        return data;
      })(),
    });
  });

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollHeight),
    844,
  );
  await page.screenshot({ path: path.join(output, "panda-home.png") });
  // The entire home action opens Rehab even when general conversation start is unavailable.
  let generalStarts = 0;
  await page.route("**/api/voice/checkin/start", async (route) => {
    generalStarts++;
    await route.fulfill({
      status: 503,
      json: { ok: false, error: { message: "Test provider unavailable" } },
    });
  });
  const openedResponse = page.waitForResponse((r) =>
    r.url().endsWith("/api/voice/checkin/open-exercise"),
  );
  await page.getByText("Move a little", { exact: true }).click();
  const opened = (await (await openedResponse).json()).data;
  assert.equal(opened.checkin.stage, "exercise");
  assert.equal(generalStarts, 0);
  await page
    .getByRole("region", { name: "Exercise with Panda", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(output, "direct-rehab-entry.png") });
  await page
    .getByRole("button", { name: "Exit exercise", exact: true })
    .click();
  await page.unroute("**/api/voice/checkin/start");
  async function resetMemory() {
    const r = await page.request.delete(origin + "/api/voice/memory", {
      data: { confirm: true },
      headers: { Origin: origin },
    });
    assert.ok(r.ok());
    await page.reload();
    await page
      .getByText("Ready for a good day, Alex?", { exact: true })
      .waitFor();
  }
  await resetMemory();
  await page.getByRole("button", { name: "Use keyboard", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: /how.*elbow/i })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Your message" })
    .fill("Panda, open the rehab section");
  const askedResponse = page.waitForResponse((r) =>
    r.url().endsWith("/api/voice/checkin/open-exercise"),
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  assert.equal((await (await askedResponse).json()).data.navigation, "/rehab");
  await page
    .getByRole("region", { name: "Exercise with Panda", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Exit exercise", exact: true })
    .click();
  await resetMemory();
  await page.getByRole("button", { name: "Use keyboard", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Talk to Panda", exact: true })
      .count(),
    0,
  );
  const compose = page.getByRole("textbox", { name: "Your message" });
  await page
    .getByRole("status")
    .filter({ hasText: /how.*elbow/i })
    .waitFor();
  async function say(text, stage) {
    await compose.fill(text);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/voice/checkin/answer") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const body = await (await response).json();
    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(body.data.checkin.stage, stage);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .waitFor({ state: "visible" });
    await compose.waitFor();
  }
  await say("My elbow feels okay today", "medications");
  await say("No not yet", "food");
  await say("Soup and bread", "followup");
  await say("Tomorrow morning", "readiness");
  await say("Yes", "exercise");
  const workspace = page.getByRole("region", {
    name: "Exercise with Panda",
    exact: true,
  });
  await workspace.waitFor();
  assert.equal(new URL(page.url()).pathname, "/");
  const corner = page.getByRole("complementary", {
    name: "Panda exercise companion",
  });
  const cornerRect = await corner.boundingBox();
  assert.ok(cornerRect.x > 250 && cornerRect.y < 80);
  const videoRect = await page
    .getByLabel("Live camera preview", { exact: true })
    .boundingBox();
  assert.equal(videoRect.height, 844);
  await page.getByText("Seated knee extension", { exact: true }).waitFor();
  await workspace
    .getByRole("button", { name: "Use microphone mode", exact: true })
    .click();
  await workspace.locator('[data-phase="listening"]').waitFor();
  assert.equal(
    await workspace.getByRole("textbox", { name: "Your message" }).count(),
    0,
  );
  await page.screenshot({ path: path.join(output, "panda-guided-camera.png") });
  await workspace
    .getByRole("button", { name: "Use keyboard", exact: true })
    .click();
  await workspace
    .getByRole("button", { name: "Enable camera", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("video")?.videoWidth > 0,
  );
  await page
    .getByRole("region", { name: "Exercise setup", exact: true })
    .waitFor();
  await page
    .getByLabel("Exercise", { exact: true })
    .selectOption("static-quads");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    await page.locator("video").evaluate((video) => video.srcObject),
    null,
  );
  await page.getByRole("button", { name: "Start set", exact: true }).click();
  await page
    .getByRole("button", { name: "Start guided hold", exact: true })
    .click();
  await sleep(5300);
  await page
    .getByRole("button", { name: "Confirm this hold", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish and save", exact: true })
    .click();
  await page.getByText("Panda · exercise review", { exact: true }).waitFor();
  const memory = await page.request.get(origin + "/api/voice/memory");
  const saved = (await memory.json()).data;
  assert.ok(
    saved.events.some(
      (e) =>
        e.kind === "exercise_report" &&
        e.metadata.evidence === "patient_reported",
    ),
  );
  await page.screenshot({
    path: path.join(output, "guided-exercise-review.png"),
    fullPage: true,
  });
  await say("My leg felt a little tired", "pain_check");
  await say("No pain or discomfort", "complete");

  await page
    .getByRole("button", { name: "Exit exercise", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use microphone mode", exact: true })
    .click();
  await page
    .locator('[aria-label="Voice conversation"] [data-phase="speaking"]')
    .waitFor();
  const circle = page
    .locator('[aria-label="Voice conversation"] svg path')
    .first();
  const before = await circle.getAttribute("d");
  await sleep(180);
  assert.notEqual(await circle.getAttribute("d"), before);
  await page.screenshot({ path: path.join(output, "panda-voice-circle.png") });
  await page
    .getByRole("button", { name: "Interrupt Panda", exact: true })
    .click();
  await page.getByRole("heading", { name: /I’m listening/ }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/");
  assert.ok(requests > 0);
  await page
    .getByRole("button", { name: "End voice conversation", exact: true })
    .click();
  for (const [width, height] of [
    [320, 568],
    [390, 667],
    [430, 932],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollHeight),
      height,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    const control = await page
      .getByRole("button", { name: "Start voice conversation", exact: true })
      .boundingBox();
    assert.ok(control.y + control.height <= height);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: browser check-in, embedded guided hold, saved report, pain review, inline voice playback and interruption. Fake devices/audio only; physical acceptance remains pending.",
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
