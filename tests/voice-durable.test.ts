import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { careService } from "../apps/care/src/server/service";
import { voiceService, type CareBridge, type Classifier } from "../apps/panda/src/server/service";
import { SqliteVoiceRepository, RETENTION_MS } from "../apps/panda/src/server/repository";
import { demoCommand } from "../apps/panda/src/server/provider";
import { fixtureCare } from "../packages/contracts/fixtures";
import type { VoiceReply } from "../packages/contracts/voice";

const route: Classifier = async (text, care) => ({ command: demoCommand(text, care), engine: "demo_rules" });
async function directory(t: test.TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "voice-durable-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test("lost Care response retries the stable proposal ID and creates one help record", async t => {
  const dir = await directory(t);
  const care = careService(path.join(dir, "care.json"));
  const payloads: unknown[] = [];
  const bridge: CareBridge = {
    mode: "connected", snapshot: () => care.snapshot(),
    write: async (_path, body) => {
      payloads.push(body);
      const result = await care.help(body);
      if (payloads.length === 1) throw new Error("response lost after durable Care commit");
      return result;
    },
  };
  const file = path.join(dir, "voice.sqlite");
  const first = voiceService(file, bridge, route);
  const input = { requestId: "lost-response-help", text: "Please help.  These are my\nexact words." };
  const proposal = await first.turn(input);
  await assert.rejects(() => first.confirm({ proposalId: proposal.proposalId }), /response lost/);
  const restarted = voiceService(file, bridge, route);
  assert.deepEqual(await restarted.turn(input), proposal);
  await restarted.confirm({ proposalId: proposal.proposalId });
  assert.deepEqual(payloads[0], payloads[1]);
  assert.equal((await care.snapshot()).help.length, 1);
  assert.equal((await care.snapshot()).help[0].quote, input.text);
  assert.equal((await restarted.history())[0].reply.proposalId, undefined);
});
test("lost task response retries original revision after Care already completed it", async t => {
  const dir = await directory(t);
  const care = careService(path.join(dir, "care.json"));
  let attempts = 0;
  const voice = voiceService(path.join(dir, "voice.sqlite"), {
    mode: "connected", snapshot: () => care.snapshot(),
    write: async (url, body) => {
      const result = await care.confirm(url.split("/")[1], body);
      if (++attempts === 1) throw new Error("lost response");
      return result;
    },
  }, route);
  const proposal = await voice.turn({ requestId: "lost-task-response", text: "Confirm task task-demo-001" });
  await assert.rejects(() => voice.confirm({ proposalId: proposal.proposalId }), /lost response/);
  const result = await voice.confirm({ proposalId: proposal.proposalId });
  assert.match(result.message, /completion saved/);
  assert.equal((await care.snapshot()).tasks[0].revision, 1);
});
test("concurrent service instances share durable receipts and confirm once", async t => {
  const dir = await directory(t);
  const care = careService(path.join(dir, "care.json"));
  let writes = 0;
  const bridge: CareBridge = { mode: "connected", snapshot: () => care.snapshot(), write: async (_url, body) => { writes++; return care.help(body); } };
  const file = path.join(dir, "voice.sqlite");
  const a = voiceService(file, bridge, route), b = voiceService(file, bridge, route);
  const input = { requestId: "concurrent-turn-1", text: "Please help" };
  const [one, two] = await Promise.all([a.turn(input), b.turn(input)]);
  assert.deepEqual(one, two);
  const results = await Promise.all([a.confirm({ proposalId: one.proposalId }), b.confirm({ proposalId: one.proposalId })]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(writes, 1);
});
test("proposal expiry and a changed integration mode cannot write", async t => {
  const dir = await directory(t);
  let now = Date.now();
  let writes = 0;
  const bridge: CareBridge = { mode: "fixture", snapshot: async () => fixtureCare(), write: async () => { writes++; } };
  const file = path.join(dir, "voice.sqlite");
  const voice = voiceService(file, bridge, route, new SqliteVoiceRepository(file, () => now), () => now);
  const p = await voice.turn({ requestId: "expiring-proposal", text: "help please" });
  const connected = voiceService(file, { ...bridge, mode: "connected" }, route);
  await assert.rejects(() => connected.confirm({ proposalId: p.proposalId }), /mode changed/);
  now += 5 * 60 * 1000;
  await assert.rejects(() => voice.confirm({ proposalId: p.proposalId }), /expired/);
  assert.equal((await voice.history())[0].reply.proposalId, undefined);
  assert.equal(writes, 0);
});
test("dismissed proposals stay dismissed after restart and never execute", async t => {
  const dir = await directory(t);
  let writes = 0;
  const bridge: CareBridge = { mode: "connected", snapshot: async () => fixtureCare(), write: async () => { writes++; } };
  const file = path.join(dir, "voice.sqlite");
  const voice = voiceService(file, bridge, route);
  const proposal = await voice.turn({ requestId: "dismiss-proposal", text: "Please help" });
  const cancelled = await voice.cancel({ proposalId: proposal.proposalId });
  assert.deepEqual(await voiceService(file, bridge, route).confirm({ proposalId: proposal.proposalId }), cancelled);
  assert.equal(writes, 0);
});
test("classifier outputs are validated at service boundary and quotes are replaced", async t => {
  const dir = await directory(t);
  const bridge: CareBridge = { mode: "fixture", snapshot: async () => fixtureCare(), write: async () => { throw Error("must not write"); } };
  const invalid = voiceService(path.join(dir, "bad.sqlite"), bridge,
    (async () => ({ engine: "gemini", command: { name: "delete_plan", args: {} } })) as unknown as Classifier);
  await assert.rejects(() => invalid.turn({ requestId: "unknown-tool-test", text: "please" }));
  assert.equal((await invalid.history()).length, 0);
  const paraphrased = voiceService(path.join(dir, "quote.sqlite"), bridge,
    async () => ({ engine: "gemini", command: { name: "request_help", args: { quote: "paraphrase" } } }));
  const value = "I need help.  My exact words.";
  assert.ok((await paraphrased.turn({ requestId: "verbatim-quote-1", text: value })).message.includes(value));
});
test("retention prunes sensitive records; failed transactions leave no partial proposal", async t => {
  const dir = await directory(t);
  let now = Date.now();
  const file = path.join(dir, "voice.sqlite");
  const repo = new SqliteVoiceRepository(file, () => now);
  const bridge: CareBridge = { mode: "fixture", snapshot: async () => fixtureCare(), write: async () => {} };
  const voice = voiceService(file, bridge, route, repo, () => now);
  const p = await voice.turn({ requestId: "retention-turn-1", text: "Please help" });
  await assert.rejects(() => repo.transaction(tx => {
    const proposal = tx.proposal(p.proposalId!)!;
    tx.saveProposal({ ...proposal, id: "rollback-proposal" });
    throw Error("rollback");
  }), /rollback/);
  assert.equal(await repo.transaction(tx => tx.proposal("rollback-proposal")), undefined);
  now += RETENTION_MS + 1;
  assert.deepEqual(await voice.history(), []);
  await assert.rejects(() => voice.confirm({ proposalId: p.proposalId }), /not found/i);
});
test("receipt replay works while Care is offline, and preserves the original engine", async t => {
  const dir = await directory(t);
  let offline = false;
  const bridge: CareBridge = { mode: "fixture", snapshot: async () => { if (offline) throw Error("offline"); return fixtureCare(); }, write: async () => {} };
  const voice = voiceService(path.join(dir, "voice.sqlite"), bridge, async (text, c) => ({ command: demoCommand(text, c), engine: "gemini" }));
  const input = { requestId: "offline-retry-1", text: "Please help" };
  const p = await voice.turn(input);
  offline = true;
  assert.deepEqual(await voice.turn(input), p);
  offline = false;
  assert.equal((await voice.confirm({ proposalId: p.proposalId })).engine, "gemini");
});
test("conversation cap rejects a new receipt without evicting a valid retry", async t => {
  const dir = await directory(t);
  const repo = new SqliteVoiceRepository(path.join(dir, "voice.sqlite"));
  const reply: VoiceReply = { mode: "fixture", engine: "demo_rules", message: "Test" };
  await repo.transaction(tx => {
    for (let i = 0; i < 1000; i++) tx.saveTurn({ requestId: "capacity-" + i, text: "Test", reply, at: new Date().toISOString() }, "same");
  });
  await assert.rejects(() => repo.transaction(tx => tx.saveTurn({ requestId: "overflow", text: "Test", reply, at: new Date().toISOString() }, "same")), /capacity/);
  assert.ok(await repo.transaction(tx => tx.receipt("capacity-0")));
  assert.equal((await repo.transaction(tx => tx.history())).length, 50);
});

test("an accepted confirmation recovers after proposal expiry; ambiguous writes cannot be dismissed", async t => {
  const dir = await directory(t);
  let now = Date.now(), attempts = 0;
  const care = careService(path.join(dir, "care.json"));
  const file = path.join(dir, "voice.sqlite");
  const bridge: CareBridge = {
    mode: "connected", snapshot: () => care.snapshot(),
    write: async (_url, body) => {
      const value = await care.help(body);
      if (++attempts === 1) throw Error("lost after commit");
      return value;
    },
  };
  const voice = voiceService(file, bridge, route, new SqliteVoiceRepository(file, () => now), () => now);
  const p = await voice.turn({ requestId: "confirmed-before-expiry", text: "Please help" });
  await assert.rejects(() => voice.confirm({ proposalId: p.proposalId }), /lost after commit/);
  await assert.rejects(() => voice.cancel({ proposalId: p.proposalId }), /already submitted/);
  now += 6 * 60 * 1000;
  assert.ok((await voice.history())[0].reply.proposalId);
  assert.match((await voice.confirm({ proposalId: p.proposalId })).message, /recorded/);
  assert.equal((await care.snapshot()).help.length, 1);
});
test("accepted but unresolved confirmations still fail closed on plan change", async t => {
  const dir = await directory(t);
  const care = careService(path.join(dir, "care.json"));
  let offline = true;
  const voice = voiceService(path.join(dir, "voice.sqlite"), {
    mode: "connected", snapshot: () => care.snapshot(),
    write: async (_url, body) => { if (offline) throw Error("offline"); return care.help(body); },
  }, route);
  const p = await voice.turn({ requestId: "pending-plan-change", text: "Please help" });
  await assert.rejects(() => voice.confirm({ proposalId: p.proposalId }), /offline/);
  const draft = await care.importPlan({ requestId: "new-plan-pending", sourceText: "New source line" });
  await care.approve(draft.id, { requestId: "approve-pending-plan", expectedCurrentVersion: 1 });
  offline = false;
  await assert.rejects(() => voice.confirm({ proposalId: p.proposalId }), /Plan changed/);
  assert.equal((await care.snapshot()).help.length, 0);
});
