import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const dir = await mkdtemp(path.join(tmpdir(), "panda-yuvraj-http-")),
  origin = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const preload = new URL(
  "../tests/fixtures/gemini-upstream-provider.mjs",
  import.meta.url,
).href;
const proc = spawn(process.execPath, ["scripts/run.mjs", "start", "all"], {
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_OPTIONS: `--import=${preload}`,
    PANDA_YUVRAJ_TEST_PROVIDER: "synthetic",
    PANDA_RUNTIME: "demo",
    PANDA_DATA_DIR: dir,
    PANDA_INTEGRATION: "connected",
    PANDA_AI_MODE: "demo",
    PANDA_TTS_MODE: "browser",
    PANDA_GEMINI_API_KEY: "synthetic-private",
    REHAB_GEMINI_MODE: "controlled",
    REHAB_GEMINI_MODEL: "test-model",
  },
});
let logs = "";
proc.stdout.on("data", (b) => (logs += b));
proc.stderr.on("data", (b) => (logs += b));
async function api(route, body) {
  const r = await fetch(origin + route, {
    method: body ? "POST" : "GET",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(r.status, 200, await r.clone().text());
  const out = await r.json();
  assert.equal(out.ok, true);
  return out.data;
}
const frames = Array.from({ length: 3 }, (_, i) => ({
  offsetMs: 1000 + i * 500,
  personCount: 1,
  landmarks: Array.from({ length: 33 }, () => [0.2, 0.3, 0, 1, 1]),
}));
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
  if (!ready) throw Error(logs);
  const opened = await api("/api/voice/checkin/open-exercise", {
    requestId: randomUUID(),
  });
  const calibrationId = randomUUID();
  const calibrated = await api("/rehab/api/cv/v1/calibrate", {
    requestId: calibrationId,
    exerciseId: "seated-knee-extension",
    side: "left",
    requestedPosition: "auto",
    frames,
  });
  assert.equal(calibrated.accepted, true);
  const calibrationCue = await api("/api/voice/exercise-feedback", {
    requestId: randomUUID(),
    checkinId: opened.checkin.id,
    event: { version: "1.0.0", type: "guided_calibration", calibrationId },
  });
  assert.equal(calibrationCue.message, calibrated.cue);
  assert.ok(calibrationCue.exerciseCue);
  const session = await api("/rehab/api/cv/v1/sessions", {
    requestId: randomUUID(),
    exerciseId: "seated-knee-extension",
    side: "left",
    evidence: "camera_estimated",
    startedAtUtc: new Date().toISOString(),
    calibration: { startAngleDeg: 90, targetAngleDeg: 160 },
  });
  assert.equal(session.analysisMethod, "gemini_landmark_analysis");
  await api("/api/voice/exercise-feedback", {
    requestId: randomUUID(),
    checkinId: opened.checkin.id,
    event: {
      version: "1.0.0",
      type: "guided_session_started",
      sessionId: session.id,
    },
  });
  await api(`/rehab/api/cv/v1/sessions/${session.id}/events`, {
    requestId: randomUUID(),
    event: {
      eventId: randomUUID(),
      sequence: 1,
      observedOffsetMs: 0,
      type: "tracking_changed",
      valid: true,
    },
  });
  const analyzed = await api(
    `/rehab/api/cv/v1/sessions/${session.id}/analyze`,
    { requestId: randomUUID(), batchSequence: 1, frames },
  );
  assert.equal(analyzed.session.completedReps, 1);
  const cue = await api("/api/voice/exercise-feedback", {
    requestId: randomUUID(),
    checkinId: opened.checkin.id,
    event: {
      version: "1.0.0",
      type: "guided_analysis",
      sessionId: session.id,
      batchSequence: 1,
    },
  });
  assert.equal(cue.message, analyzed.analysis.cue);
  assert.ok(cue.exerciseCue);
  const report = await api(`/rehab/api/cv/v1/sessions/${session.id}/finish`, {
    requestId: randomUUID(),
    lastMeasurementSequence: 1,
    report: {
      observedEndedAtUtc: new Date().toISOString(),
      completionStatus: "incomplete",
      terminationReason: "finished",
      timing: {
        elapsedTimeMs: 3000,
        activeTimeMs: 3000,
        pausedTimeMs: 0,
        userPausedTimeMs: 0,
        trackingPausedTimeMs: 0,
        otherPausedTimeMs: 0,
      },
    },
  });
  assert.equal(report.completedReps, 1);
  const reviewed = await api("/api/voice/exercise-feedback", {
    requestId: randomUUID(),
    checkinId: opened.checkin.id,
    event: {
      version: "1.0.0",
      type: "guided_report_saved",
      sessionId: session.id,
    },
  });
  assert.equal(reviewed.checkin.stage, "exercise_review");
  assert.equal(
    (await api("/care/api/guided-reports"))[0].sessionId,
    session.id,
  );
  await api(`/care/api/reports/${session.id}/ack`, { requestId: randomUUID() });
  const memory = await api("/api/voice/memory");
  for (const source of ["gemini_calibration", "gemini_rep_analysis"])
    assert.ok(memory.events.some((e) => e.metadata.textSource === source));
  assert.doesNotMatch(
    await readFile(path.join(dir, "rehab-cv.json"), "utf8"),
    /"landmarks"/,
  );
  console.log(
    "PASS: upstream calibration and movement analysis → verified Panda speech/context → report review → Care acknowledgement, over the actual gateway HTTP APIs. Provider responses are synthetic test fixtures.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  try {
    if (process.platform !== "win32") process.kill(-proc.pid, "SIGTERM");
    else proc.kill("SIGTERM");
  } catch {}
  await sleep(800);
  try {
    if (process.platform !== "win32") process.kill(-proc.pid, "SIGKILL");
    else proc.kill("SIGKILL");
  } catch {}
  await rm(dir, { recursive: true, force: true });
}
