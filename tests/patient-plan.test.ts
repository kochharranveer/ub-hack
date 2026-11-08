import test from "node:test";
import assert from "node:assert/strict";
import { fixtureCare } from "../packages/contracts/fixtures";
import { patientPlan } from "../apps/care/src/app/patient-plan";

test("patient plan groups approved instructions without changing prescribed wording", () => {
  const care = fixtureCare();
  const groups = patientPlan(care);
  assert.equal(groups.medication[0].text, care.plan!.instructions[0].text);
  assert.equal(groups.exercise[0].text, care.plan!.instructions[1].text);
  assert.equal(groups.followUp[0].text, care.plan!.instructions[2].text);
  assert.equal(groups.medication[0].task?.id, care.tasks[0].id);
  care.plan!.instructions.push({
    id: "other",
    text: "Keep your discharge instructions nearby.",
    sourceRef: "reviewed:4",
  });
  assert.equal(
    patientPlan(care).other[0].text,
    "Keep your discharge instructions nearby.",
  );
});

test("draft, foreign and obsolete task records cannot appear as the current prescription", () => {
  const care = fixtureCare();
  care.tasks[0].planVersion += 1;
  assert.equal(patientPlan(care).medication[0].task, undefined);
  care.plan!.status = "draft";
  assert.deepEqual(patientPlan(care).medication, []);
  care.plan!.status = "approved";
  care.plan!.patientId = "someone-else";
  assert.deepEqual(patientPlan(care).medication, []);
  assert.deepEqual(patientPlan(null).exercise, []);
});
