import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { careService } from "../apps/care/src/server/service";
async function setup(t: test.TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "panda-care-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "care.json");
  return { care: careService(file), file };
}
test("import is draft-only; review approval changes the authoritative version", async (t) => {
  const { care } = await setup(t);
  const draft = await care.importPlan({
    requestId: "import-001",
    sourceText: "Instruction one\nInstruction two",
  });
  assert.equal(draft.status, "draft");
  assert.equal((await care.snapshot()).plan?.version, 1);
  const plan = await care.approve(draft.id, {
    requestId: "approve-001",
    expectedCurrentVersion: 1,
  });
  assert.equal(plan.version, 2);
  assert.equal(plan.approvedBy, "demo-clinician");
  assert.equal((await care.snapshot()).tasks.length, 2);
});
test("idempotency preserves the original import result after approval", async (t) => {
  const { care } = await setup(t);
  const input = { requestId: "import-002", sourceText: "Review this line" };
  const d = await care.importPlan(input);
  await care.approve(d.id, {
    requestId: "approve-002",
    expectedCurrentVersion: 1,
  });
  assert.deepEqual(await care.importPlan(input), d);
  await assert.rejects(
    () => care.importPlan({ ...input, sourceText: "Changed text" }),
    /reused/,
  );
});
test("two drafts cannot both overwrite an approved plan", async (t) => {
  const { care } = await setup(t);
  const a = await care.importPlan({ requestId: "import-a1", sourceText: "A" }),
    b = await care.importPlan({ requestId: "import-b1", sourceText: "B" });
  await care.approve(a.id, {
    requestId: "approve-a1",
    expectedCurrentVersion: 1,
  });
  await assert.rejects(
    () =>
      care.approve(b.id, {
        requestId: "approve-b1",
        expectedCurrentVersion: 1,
      }),
    /Plan changed/,
  );
});
test("task completion is patient reported, revision protected and retry safe", async (t) => {
  const { care } = await setup(t);
  const input = {
    requestId: "complete1",
    expectedRevision: 0,
    evidence: "patient_reported",
  };
  const result = await care.confirm("task-demo-001", input);
  assert.equal(result.revision, 1);
  assert.equal(result.evidence, "patient_reported");
  assert.deepEqual(await care.confirm("task-demo-001", input), result);
  await assert.rejects(
    () => care.confirm("task-demo-001", { ...input, requestId: "complete2" }),
    /changed/,
  );
  await assert.rejects(() =>
    care.confirm("task-demo-001", {
      ...input,
      requestId: "complete3",
      evidence: "camera_estimated",
    }),
  );
});
test("help recorded and acknowledged are separate, durable states", async (t) => {
  const { care, file } = await setup(t);
  const input = { requestId: "help-001", quote: "Please contact me" };
  const h = await care.help(input);
  assert.equal(h.status, "open");
  await care.help(input);
  assert.equal((await care.snapshot()).help.length, 1);
  const reloaded = careService(file);
  assert.equal((await reloaded.snapshot()).help[0].status, "open");
  await reloaded.acknowledgeHelp(h.id, { requestId: "ack-help1" });
  assert.equal((await care.snapshot()).help[0].status, "acknowledged");
});
test("separate repository instances serialize concurrent writes to one local file", async (t) => {
  const { care, file } = await setup(t);
  const other = careService(file);
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      (i % 2 ? care : other).help({
        requestId: "parallel-" + i,
        quote: "request " + i,
      }),
    ),
  );
  assert.equal((await care.snapshot()).help.length, 12);
});
