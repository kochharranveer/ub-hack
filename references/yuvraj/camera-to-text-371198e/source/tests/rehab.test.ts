import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rehabService } from "../apps/rehab/src/server/service";
import { ReportSchema, type Session } from "../packages/contracts/rehab";
import { fixtureCare } from "../packages/contracts/fixtures";
async function setup(t: test.TestContext) {
  const d = await mkdtemp(path.join(tmpdir(), "panda-rehab-"));
  t.after(() => rm(d, { recursive: true, force: true }));
  return rehabService(path.join(d, "rehab.json"));
}
function report(s: Session) {
  return {
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
}
const start = {
  requestId: "start-001",
  planId: "plan-demo-001",
  planVersion: 1,
  exerciseId: "demo-elbow",
};
test("only the current approved plan can start a session", async (t) => {
  const r = await setup(t);
  await assert.rejects(
    () => r.start({ ...start, planVersion: 2 }, fixtureCare()),
    /changed/,
  );
  const c = fixtureCare();
  c.plan!.status = "draft";
  await assert.rejects(() => r.start(start, c), /changed/);
});
test("finish is immutable and retries do not create another report", async (t) => {
  const r = await setup(t);
  const s = await r.start(start, fixtureCare());
  assert.deepEqual(await r.start(start, fixtureCare()), s);
  const input = { requestId: "finish-001", report: report(s) };
  const q = await r.finish(s.id, input);
  assert.deepEqual(await r.finish(s.id, input), q);
  assert.equal((await r.reports()).length, 1);
  await assert.rejects(
    () => r.finish(s.id, { ...input, requestId: "finish-002" }),
    /already finished/,
  );
});
test("report cannot change session patient, plan or timestamps", async (t) => {
  const r = await setup(t);
  const s = await r.start(start, fixtureCare());
  for (const change of [
    { patientId: "someone-else" },
    { planVersion: 9 },
    { startedAt: "2020-01-01T00:00:00.000Z" },
  ])
    await assert.rejects(
      () =>
        r.finish(s.id, {
          requestId: "bad-finish",
          report: { ...report(s), ...change },
        }),
      /does not match/,
    );
  assert.equal((await r.reports()).length, 0);
});
test("unavailable tracking and simulation cannot masquerade as measured progress", () => {
  const s = {
    id: "session-001",
    patientId: "pat-demo-001",
    planId: "plan-demo-001",
    planVersion: 1,
    exerciseId: "demo-elbow" as const,
    startedAt: "2026-11-07T00:00:00.000Z",
    report: null,
  };
  const q = report(s);
  assert.equal(
    ReportSchema.safeParse({ ...q, evidence: "camera_estimated" }).success,
    false,
  );
  assert.equal(
    ReportSchema.safeParse({
      ...q,
      evidence: "camera_estimated",
      trackingQuality: "unavailable",
    }).success,
    false,
  );
  assert.equal(
    ReportSchema.safeParse({ ...q, endedAt: "2020-01-01T00:00:00.000Z" })
      .success,
    false,
  );
  assert.equal(
    ReportSchema.safeParse({
      ...q,
      evidence: "camera_estimated",
      trackingQuality: "unavailable",
      repetitions: 0,
      rangeDegrees: null,
    }).success,
    true,
  );
});
