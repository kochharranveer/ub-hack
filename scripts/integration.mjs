import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import assert from "node:assert/strict";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const port of [3000, 3001, 3002])
  await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (error) =>
      reject(
        Error(
          `Cannot listen on port ${port} (${error.code}). Stop existing Panda servers if it is occupied, or allow local networking.`,
        ),
      ),
    );
    s.listen(port, "127.0.0.1", () => s.close(resolve));
  });
const dir = await mkdtemp(path.join(tmpdir(), "panda-integration-"));
const proc = spawn(process.execPath, ["scripts/run.mjs", "start", "all"], {
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PANDA_DATA_DIR: dir,
    PANDA_INTEGRATION: "connected",
    PANDA_AI_MODE: "demo",
    PANDA_TTS_MODE: "browser",
  },
});
let logs = "";
proc.stdout.on("data", (b) => {
  logs += b;
});
proc.stderr.on("data", (b) => {
  logs += b;
});
const origin = "http://127.0.0.1:3000";
async function api(url, body, status = 200) {
  const r = await fetch(origin + url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(r.status, status, await r.clone().text());
  const out = await r.json();
  assert.equal(out.ok, status === 200);
  return out.data;
}
let checks = 0;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await Promise.all(
        ["/api/health", "/care/api/health", "/rehab/api/health"].map(
          async (p) => {
            const r = await fetch(origin + p);
            if (!r.ok) throw Error("not ready");
          },
        ),
      );
      ready = true;
      break;
    } catch {
      if (proc.exitCode !== null) break;
      await sleep(300);
    }
  }
  if (!ready) throw Error("Servers failed to start: " + logs);
  for (const [route, label] of [
    ["/", "Talk to Panda"],
    ["/care", "A clear plan."],
    ["/rehab", "Exercise workspace"],
  ]) {
    const r = await fetch(origin + route);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes(label), route + " missing its own app markup");
    const css = [...html.matchAll(/href="([^" ]+\.css(?:\?[^" ]*)?)"/g)].map(
      (m) => m[1],
    );
    assert.ok(css.length, route + " no CSS");
    for (const asset of css) {
      const res = await fetch(origin + asset);
      assert.equal(res.status, 200, asset);
    }
    checks++;
  }
  const initial = await api("/care/api/state");
  assert.equal(initial.plan.version, 1);
  checks++;
  const context = await api("/api/context");
  assert.equal(context.mode, "connected");
  assert.equal(context.aiEngine, "demo_rules");
  assert.equal(context.ttsEngine, "browser");
  checks++;
  const turn = {
    requestId: "integration-help",
    text: "Please help me contact my care team",
  };
  const proposal = await api("/api/voice/turn", turn);
  assert.ok(proposal.proposalId);
  assert.deepEqual(await api("/api/voice/turn", turn), proposal);
  assert.equal((await api("/care/api/state")).help.length, 0);
  checks++;
  await api("/api/voice/turn", { ...turn, text: "Changed payload" }, 409);
  checks++;
  const confirmation = await api("/api/voice/confirm", {
    proposalId: proposal.proposalId,
  });
  assert.match(confirmation.message, /not acknowledged/);
  await api("/api/voice/confirm", { proposalId: proposal.proposalId });
  let state = await api("/care/api/state");
  assert.equal(state.help.length, 1);
  assert.equal(state.help[0].status, "open");
  checks++;
  const history = await api("/api/voice/history");
  assert.equal(history.length, 1);
  assert.match(history[0].reply.message, /not acknowledged/);
  assert.equal(history[0].reply.proposalId, undefined);
  const dismissed = await api("/api/voice/turn", { requestId: "integration-dismiss", text: "Please help with another question" });
  await api("/api/voice/cancel", { proposalId: dismissed.proposalId });
  await api("/api/voice/confirm", { proposalId: dismissed.proposalId });
  assert.equal((await api("/care/api/state")).help.length, 1);
  checks++;
  await api("/care/api/help/" + state.help[0].id + "/ack", {
    requestId: "integration-ack-help",
  });
  assert.equal((await api("/api/context")).help[0].status, "acknowledged");
  checks++;
  const s = await api("/rehab/api/sessions", {
    requestId: "integration-start",
    planId: initial.plan.id,
    planVersion: 1,
    exerciseId: "demo-elbow",
  });
  const report = {
    sessionId: s.id,
    patientId: s.patientId,
    planId: s.planId,
    planVersion: s.planVersion,
    exerciseId: s.exerciseId,
    startedAt: s.startedAt,
    endedAt: new Date().toISOString(),
    repetitions: 3,
    rangeDegrees: 90,
    trackingQuality: "simulated",
    evidence: "simulated",
    terminationReason: "completed",
  };
  const finish = { requestId: "integration-finish", report };
  await api("/rehab/api/sessions/" + s.id + "/finish", finish);
  await api("/rehab/api/sessions/" + s.id + "/finish", finish);
  assert.equal((await api("/care/api/reports")).length, 1);
  checks++;
  await api("/care/api/reports/" + s.id + "/ack", {
    requestId: "integration-report-ack",
  });
  assert.equal(
    (await api("/care/api/state")).acknowledgements[0].sessionId,
    s.id,
  );
  checks++;
  const task = await api("/api/voice/turn", {
    requestId: "integration-task",
    text: "Confirm task task-demo-001",
  });
  await api("/api/voice/confirm", { proposalId: task.proposalId });
  assert.equal(
    (await api("/care/api/state")).tasks[0].evidence,
    "patient_reported",
  );
  checks++;
  await api(
    "/care/api/tasks/task-demo-001/confirm",
    {
      requestId: "integration-stale",
      expectedRevision: 0,
      evidence: "patient_reported",
    },
    409,
  );
  checks++;
  const draft = await api("/care/api/plans/import", {
    requestId: "integration-import",
    sourceText: "Demo approved instruction\nSecond line",
  });
  assert.equal((await api("/api/context")).plan.version, 1);
  checks++;
  const staleProposal = await api("/api/voice/turn", { requestId: "integration-stale-proposal", text: "Please help with this plan" });
  await api("/care/api/plans/" + draft.id + "/approve", {
    requestId: "integration-approve",
    expectedCurrentVersion: 1,
  });
  assert.equal((await api("/api/context")).plan.version, 2);
  assert.equal((await api("/rehab/api/context")).plan.version, 2);
  assert.equal((await api("/care/api/reports"))[0].planVersion, 1);
  checks++;
  await api("/api/voice/confirm", { proposalId: staleProposal.proposalId }, 409);
  assert.equal((await api("/care/api/state")).help.length, 1);
  checks++;
  await api(
    "/rehab/api/sessions",
    {
      requestId: "integration-stale-start",
      planId: initial.plan.id,
      planVersion: 1,
      exerciseId: "demo-elbow",
    },
    409,
  );
  checks++;
  await api(
    "/rehab/api/sessions/" + s.id + "/finish",
    {
      requestId: "integration-fake",
      report: { ...report, evidence: "camera_estimated" },
    },
    400,
  );
  checks++;

  // Full guided check-in on fresh synthetic v3 data, including the persistent Rehab bridge.
  const guidedDraft=await api("/care/api/plans/import",{requestId:"guided-plan-import",sourceText:"Medicine: Atorvastatin 10 mg, 1 tablet at 8 PM. Synthetic example.\nExercise: demonstration elbow movement.\nSchedule a follow-up request."});
  const guidedPlan=await api("/care/api/plans/"+guidedDraft.id+"/approve",{requestId:"guided-plan-approve",expectedCurrentVersion:2});
  let guided=await api("/api/voice/checkin/start",{requestId:"guided-start"});
  assert.equal(guided.checkin.stage,"medications");
  guided=await api("/api/voice/checkin/answer",{requestId:"guided-med",checkinId:guided.checkin.id,expectedStage:guided.checkin.stage,text:"Yes"});
  assert.ok(guided.proposalId);
  assert.equal((await api("/care/api/state")).tasks[0].status,"pending");
  checks++;
  await api("/api/voice/confirm",{proposalId:guided.proposalId});
  guided=await api("/api/voice/checkin/continue",{requestId:"guided-med-continue",checkinId:guided.checkin.id,proposalId:guided.proposalId});
  assert.equal(guided.checkin.stage,"food");checks++;
  guided=await api("/api/voice/checkin/answer",{requestId:"guided-food",checkinId:guided.checkin.id,expectedStage:guided.checkin.stage,text:"Oatmeal and a banana"});
  assert.equal(guided.checkin.stage,"readiness");
  assert.match(guided.message,/availability is pending/);checks++;
  guided=await api("/api/voice/checkin/answer",{requestId:"guided-ready",checkinId:guided.checkin.id,expectedStage:guided.checkin.stage,text:"Yes"});
  assert.equal(guided.checkin.stage,"exercise");checks++;
  const guidedSession=await api("/rehab/api/sessions",{requestId:"guided-session",planId:guidedPlan.id,planVersion:guidedPlan.version,exerciseId:"demo-elbow"});
  assert.equal((await api("/rehab/api/sessions/"+guidedSession.id)).patientId,initial.patientId);
  await api("/api/voice/exercise-feedback",{requestId:"guided-start-feedback",checkinId:guided.checkin.id,event:{version:"1.0.0",type:"session_started",sessionId:guidedSession.id,planId:guidedSession.planId,planVersion:guidedSession.planVersion}});
  checks++;
  await api("/rehab/api/sessions/"+guidedSession.id+"/finish",{requestId:"guided-finish",report:{
    ...report,sessionId:guidedSession.id,patientId:guidedSession.patientId,planId:guidedSession.planId,planVersion:guidedSession.planVersion,startedAt:guidedSession.startedAt,endedAt:new Date().toISOString(),
  }});
  guided=await api("/api/voice/exercise-feedback",{requestId:"guided-report-feedback",checkinId:guided.checkin.id,event:{version:"1.0.0",type:"report_saved",sessionId:guidedSession.id}});
  assert.equal(guided.checkin.stage,"exercise_review");assert.match(guided.message,/simulated/);checks++;
  guided=await api("/api/voice/checkin/answer",{requestId:"guided-review",checkinId:guided.checkin.id,expectedStage:guided.checkin.stage,text:"My arm felt tired."});
  assert.equal(guided.checkin.stage,"pain_check");
  guided=await api("/api/voice/checkin/answer",{requestId:"guided-pain",checkinId:guided.checkin.id,expectedStage:guided.checkin.stage,text:"No pain or discomfort"});
  assert.equal(guided.checkin.stage,"complete");checks++;
  const memory=await api("/api/voice/memory");
  assert.equal(memory.retention,"until_deleted");
  assert.ok(memory.events.some(event=>event.kind==="food" && event.quote==="Oatmeal and a banana"));
  assert.ok(memory.events.some(event=>event.kind==="exercise_report" && event.source==="rehab_report"));checks++;

  console.log(
    `PASS: ${checks} integrated checks across three built apps, one gateway origin, versioned plans, voice confirmation, reports, acknowledgement and assets.`,
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  const done = new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) resolve();
    else proc.once("exit", resolve);
  });
  const kill = (signal) => {
    try {
      if (process.platform !== "win32") process.kill(-proc.pid, signal);
      else proc.kill(signal);
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
  };
  kill("SIGTERM");
  await Promise.race([done, sleep(3500)]);
  kill("SIGKILL");
  await rm(dir, { recursive: true, force: true });
}
await import("./standalone.mjs");
