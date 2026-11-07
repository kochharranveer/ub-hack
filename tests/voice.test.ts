import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { careService } from "../apps/care/src/server/service";
import {
  voiceService,
  type Classifier,
} from "../apps/panda/src/server/service";
import { demoCommand } from "../apps/panda/src/server/provider";
import { VoiceCommandSchema } from "../packages/contracts/voice";
import { callPeer } from "../packages/platform/peers";
async function setup(t: test.TestContext, classifier?: Classifier) {
  const d = await mkdtemp(path.join(tmpdir(), "panda-voice-"));
  t.after(() => rm(d, { recursive: true, force: true }));
  const care = careService(path.join(d, "care.json"));
  let writes = 0;
  const voice = voiceService(
    path.join(d, "voice.json"),
    {
      mode: "connected",
      snapshot: () => care.snapshot(),
      write: async (route, body) => {
        writes++;
        return route === "help"
          ? care.help(body)
          : care.confirm(route.split("/")[1], body);
      },
    },
    classifier ||
      (async (text, c) => ({
        command: demoCommand(text, c),
        engine: "demo_rules",
      })),
  );
  return { care, voice, writes: () => writes };
}
test("read plan uses authoritative source lines without a write", async (t) => {
  const { voice, writes } = await setup(t);
  const r = await voice.turn({ requestId: "read-plan1", text: "show my plan" });
  assert.ok(r.sourceRefs?.length);
  assert.equal(writes(), 0);
});
test("voice help is a proposal until confirmed; confirmation retries write once", async (t) => {
  const { voice, care, writes } = await setup(t);
  const input = { requestId: "voice-help1", text: "Please help me" };
  const r = await voice.turn(input);
  assert.ok(r.proposalId);
  assert.equal((await care.snapshot()).help.length, 0);
  assert.deepEqual(await voice.turn(input), r);
  const saved = await voice.confirm({ proposalId: r.proposalId });
  assert.match(saved.message, /not acknowledged/);
  assert.deepEqual(await voice.confirm({ proposalId: r.proposalId }), saved);
  assert.equal(writes(), 1);
  assert.equal((await care.snapshot()).help.length, 1);
});
test("voice completion routes through the care owner and preserves evidence", async (t) => {
  const { voice, care } = await setup(t);
  const r = await voice.turn({
    requestId: "voice-done1",
    text: "Confirm task task-demo-001",
  });
  await voice.confirm({ proposalId: r.proposalId });
  const task = (await care.snapshot()).tasks[0];
  assert.equal(task.status, "completed");
  assert.equal(task.evidence, "patient_reported");
});
test("plan changes invalidate an outstanding voice proposal", async (t) => {
  const { voice, care, writes } = await setup(t);
  const r = await voice.turn({ requestId: "voice-help2", text: "I need help" });
  const d = await care.importPlan({
    requestId: "new-plan1",
    sourceText: "New approved context",
  });
  await care.approve(d.id, {
    requestId: "approve-new1",
    expectedCurrentVersion: 1,
  });
  await assert.rejects(
    () => voice.confirm({ proposalId: r.proposalId }),
    /Plan changed/,
  );
  assert.equal(writes(), 0);
});
test("unknown tools and invalid model-selected tasks are rejected", async (t) => {
  assert.equal(
    VoiceCommandSchema.safeParse({ name: "change_dose", args: {} }).success,
    false,
  );
  const { voice, writes } = await setup(t, async () => ({
    engine: "openai",
    command: {
      name: "confirm_task",
      args: { taskId: "invented", expectedRevision: 0 },
    },
  }));
  await assert.rejects(
    () => voice.turn({ requestId: "invalid-ai1", text: "Done" }),
    /missing/,
  );
  assert.equal(writes(), 0);
});
test("voice retry with changed text is a conflict", async (t) => {
  const { voice } = await setup(t);
  await voice.turn({ requestId: "same-turn1", text: "show my plan" });
  await assert.rejects(
    () => voice.turn({ requestId: "same-turn1", text: "help" }),
    /reused/,
  );
});
test("unavailable connected peers return failure rather than a success fixture", async () => {
  const prev = process.env.PANDA_CARE_ORIGIN;
  process.env.PANDA_CARE_ORIGIN = "http://127.0.0.1:1";
  try {
    await assert.rejects(() => callPeer("care", "state"), /no fallback/);
  } finally {
    if (prev) process.env.PANDA_CARE_ORIGIN = prev;
    else delete process.env.PANDA_CARE_ORIGIN;
  }
});
