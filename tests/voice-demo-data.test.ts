import test from "node:test";
import assert from "node:assert/strict";
import dataset from "../packages/contracts/demo-patients.json";
import { fixtureCare, demoPatientProfile } from "../packages/contracts/fixtures";
import { CareSnapshotSchema } from "../packages/contracts/care";
import { approvedMedicationTasks } from "../apps/panda/src/app/today-actions";
import type { VoiceContext } from "../packages/contracts/voice";

const context = (patientId: string): VoiceContext => {
  const care = fixtureCare(patientId);
  return { plan: care.plan, tasks: care.tasks, help: care.help, mode: "fixture",
    aiEngine: "demo_rules", aiConfigured: true, ttsEngine: "browser", ttsConfigured: true };
};
test("all fictional patients produce distinct contract-v2 snapshots without booked appointments or measurements", () => {
  assert.equal(dataset.synthetic, true);
  assert.equal(dataset.patients.length, 12);
  assert.equal(new Set(dataset.patients.map(p => p.id)).size, 12);
  const taskIds = dataset.patients.flatMap(p => p.care.tasks.map(t => t.id));
  assert.equal(new Set(taskIds).size, taskIds.length);
  for (const patient of dataset.patients) {
    assert.ok(CareSnapshotSchema.safeParse(patient.care).success);
    assert.equal(patient.care.patientId, patient.id);
    assert.equal(patient.care.plan.patientId, patient.id);
    assert.equal(patient.care.plan.demoOnly, true);
    assert.equal(patient.checkIn.booked, false);
    assert.equal(patient.exercise.evidence, "none");
    assert.ok(patient.care.plan.instructions.every(line => line.sourceRef.startsWith("demo-patients.json#/patients/")));
    assert.ok(patient.care.tasks.every(task => task.patientId === patient.id && task.planId === patient.care.plan.id));
  }
});
test("shared default preserves integration IDs and returns independent copies", () => {
  const a = fixtureCare(), b = fixtureCare();
  assert.equal(a.patientId, "pat-demo-001");
  assert.equal(a.plan?.id, "plan-demo-001");
  assert.equal(a.tasks[0].id, "task-demo-001");
  a.tasks[0].title = "Changed locally";
  assert.notEqual(b.tasks[0].title, a.tasks[0].title);
  assert.equal(demoPatientProfile(a.patientId)?.firstName, "Alex");
  assert.throws(() => fixtureCare("missing-patient"), /Unknown/);
});
test("medicine actions preserve exact approved task text and exclude stale or foreign records", () => {
  const c = context(dataset.defaultPatientId);
  const medications = approvedMedicationTasks(c);
  assert.equal(medications.length, 1);
  assert.equal(medications[0].title, fixtureCare().tasks[0].title);
  assert.match(medications[0].title, /Atorvastatin 10 mg/);
  assert.match(medications[0].title, /8:00 PM/);
  const med = medications[0];
  c.tasks = [{ ...med, patientId: "other" }, { ...med, planVersion: 2 }, { ...med, planId: "old-plan" }];
  assert.deepEqual(approvedMedicationTasks(c), []);
  assert.deepEqual(approvedMedicationTasks(null), []);
  assert.deepEqual(approvedMedicationTasks({ ...c, plan: null }), []);
});

test("Alex has a documented synthetic knee replacement and a matching untouched exercise baseline",()=>{
 const alex=dataset.patients.find(p=>p.id===dataset.defaultPatientId)!;
 assert.match(alex.care.plan.sourceText,/Procedure: left knee replacement surgery/);
 assert.doesNotMatch(alex.care.plan.sourceText,/elbow/i);
 assert.equal(alex.exercise.exerciseId,'seated-knee-extension');
 assert.equal(alex.exercise.tracking,'not_started');
 assert.ok(alex.care.tasks.every(t=>t.status==='pending'&&t.revision===0));
 assert.deepEqual(alex.care.help,[]);
});
