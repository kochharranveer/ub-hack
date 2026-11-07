import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const seed = Number(process.argv[2] || 20261107);
if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw Error("Use an integer seed from 1 to 4294967295.");
let state = seed >>> 0;
const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
const firstNames = ["Alex", "Maya", "Jordan", "Priya", "Sam", "Elena", "Noah", "Avery", "Leah", "Daniel", "Nina", "Owen"];
const lastNames = ["Morgan", "Patel", "Rivera", "Kim", "Brooks", "Chen", "Reed", "Singh", "Bennett", "Lewis", "Shah", "Carter"];
const clinicians = ["Taylor Rowan", "Casey Ellis", "Drew Lane"];
const medicationReferences = [
  { name: "Atorvastatin", url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/020702s081lbl.pdf" },
  { name: "Metformin hydrochloride", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=30658e19-8e6e-49aa-a007-e414224797c5" },
];
const patients = firstNames.map((firstName, index) => {
  const serial = String(index + 1).padStart(3, "0");
  const id = "pat-demo-" + serial, planId = "plan-demo-" + serial;
  const metformin = index !== 0 && random() > 0.5;
  const medication = metformin
    ? { name: "Metformin hydrochloride", strength: "500 mg", dose: "1 tablet", route: "oral", times: ["08:00", "18:00"], withFood: true }
    : { name: "Atorvastatin", strength: "10 mg", dose: "1 tablet", route: "oral", times: ["20:00"], withFood: false };
  const clock = time => { const hour = Number(time.slice(0, 2)); return (hour % 12 || 12) + ":" + time.slice(3) + (hour >= 12 ? " PM" : " AM"); };
  const medicineTitles = medication.times.map(time =>
    medication.name + " " + medication.strength + " · " + medication.dose + " · " + clock(time) + (medication.withFood ? " with a meal" : ""));
  const titles = [...medicineTitles, "Exercise: use the demonstration elbow movement in Rehab.", "Schedule a check-in: request a time with the demo care team."];
  const instructions = titles.map((text, i) => ({ id: "line-" + (i + 1), text, sourceRef: "demo-patients.json#/patients/" + index + "/care/plan/instructions/" + i }));
  const requested = index !== 0 && random() > 0.55;
  const tasks = titles.map((title, i) => {
    const completed = index !== 0 && i < medicineTitles.length && random() > 0.7;
    return {
      id: index === 0 && i === 0 ? "task-demo-001" : "task-demo-" + serial + "-" + (i + 1),
      patientId: id, planId, planVersion: 1, title,
      status: completed ? "completed" : "pending", revision: completed ? 1 : 0,
      evidence: completed ? "patient_reported" : "unknown",
    };
  });
  return {
    id, synthetic: true, firstName, displayName: firstName + " " + lastNames[index],
    ageYears: 40 + Math.floor(random() * 36), timezone: "America/New_York",
    careTeam: { id: "team-demo-" + (index % clinicians.length + 1), clinicianName: clinicians[index % clinicians.length], synthetic: true },
    medications: [{ id: "med-demo-" + serial, ...medication, synthetic: true }],
    exercise: { exerciseId: "demo-elbow", title: "Demonstration elbow movement", tracking: "not_started", evidence: "none", synthetic: true },
    checkIn: { status: requested ? "requested" : "not_requested", preferredDate: "2026-11-" + String(9 + Math.floor(random() * 6)).padStart(2, "0"), booked: false, synthetic: true },
    care: {
      contractVersion: "2.0.0", patientId: id,
      plan: { id: planId, patientId: id, version: 1, status: "approved",
        sourceText: "FICTIONAL DEMO ONLY. Not a prescription or treatment recommendation.\n" + titles.join("\n"),
        instructions, approvedBy: "demo-clinician", demoOnly: true },
      drafts: [], tasks,
      help: requested ? [{ id: "help-demo-" + serial, patientId: id, quote: "I would like help scheduling a check-in with my care team.", status: "open", createdAt: "2026-11-07T15:00:00.000Z", acknowledgedBy: null }] : [],
      acknowledgements: [],
    },
  };
});
const dataset = {
  datasetVersion: "1.0.0", contractVersion: "2.0.0", synthetic: true, seed,
  referenceDate: "2026-11-07", defaultPatientId: "pat-demo-001",
  description: "Entirely fictional UI/test data. Medication schedules are illustrative samples, not prescriptions or clinically validated patient plans. No real patient records, exercise measurements or booked appointments.",
  medicationReferences, patients,
};
await writeFile(path.join(root, "packages/contracts/demo-patients.json"), JSON.stringify(dataset, null, 2) + "\n");
console.log("Generated " + patients.length + " fictional patient records with seed " + seed + ". Runtime stores were not changed.");
