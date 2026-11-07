# Synthetic patient dataset

Twelve entirely fictional patient records are in `packages/contracts/demo-patients.json`.
The default app fixture is Alex Morgan, `pat-demo-001`.

Each record includes a name, age, timezone, fictional care-team assignment, named medication/strength/dose/times, a demonstration exercise, check-in request state, and a full contract-2.0.0 Care snapshot. No exercise measurements or booked appointments are invented. Every record and plan is labelled synthetic/demo-only. These are UI/test examples, not prescriptions or clinically validated treatment plans.

The same `fixtureCare()` supplies Panda, Care and Rehab. Existing default patient, plan and first task IDs are preserved. `fixtureCare(patientId)` lets teammates validate other records explicitly; the app still runs one active demo identity. This change does not add multi-patient authorization or a patient switcher.

Regenerate reproducibly:

```sh
npm run seed:demo
npm run seed:demo -- 12345
```

Generation updates the checked-in fixture file only. It does not replace existing Care plans or reset runtime stores. A fresh store loads the seed; standalone Panda reads the seed directly. Leave any existing connected Care store intact and use the owner's review/approval workflow for changes.

Today's actions are:

1. **Take medicines:** exact current approved task text, including the medication details present in that task. Completion still requires Panda's separate confirmation and Care's revision checks. Missing details remain pending.
2. **Exercise:** ordinary navigation to `/rehab`, stopping voice on exit.
3. **Schedule check-in:** prepares an editable help request. The user sends it, reviews the proposal and confirms it. A recorded request is not a booked appointment.

Contract v2 has no structured task category. Panda's medicine grouping recognises explicit medication terms/strength units, preserves the source title verbatim, and excludes stale/foreign tasks. Unrecognised tasks remain available in Care. A richer medication/category contract should be reviewed with Asmita.

Panda context adds an optional synthetic `patient` profile for the current Care patient ID, used for the greeting. The full twelve-patient dataset is not added to that response.

Medication examples use standard labelled product names/strengths for display realism. Schedules and patient assignments are fabricated; they are not recommendations. Source references checked:

- [Atorvastatin label](https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/020702s081lbl.pdf)
- [Metformin hydrochloride label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=30658e19-8e6e-49aa-a007-e414224797c5)

Validation: 41 tests passed, all three builds passed, and 19 connected checks plus three standalone fixture checks passed.
