# Patient Care Hub and doctor portal integration

`/care` is the patient page. It shows medication prescribed, exercise prescribed, next follow-up, My requests, and exercise reports. It has no plan-import, approval, request-acknowledgement, or report-acknowledgement controls. Asmita's separate doctor portal owns those interfaces; the existing clinician APIs remain available and role-protected.

## One source of truth

In production both portals must use the same Supabase project and the same patient identifiers. Care persists the authoritative plan, tasks, requests and report acknowledgements in `care.patient_state`, keyed by `patient_id`. The data column contains `{ care, receipts }`; receipts are mutation idempotency records. Exercise sessions/reports remain in the Rehab tables in that database and Care reads them through the existing Rehab APIs. Patient and clinician server instances use the same Care service; there is no patient-only copy of a plan or request.

Use the existing authenticated Care API rather than independently overwriting the JSON document. It applies patient grants, row locks, role checks, revision/version conflicts and idempotency. The browser must never receive database credentials or choose a trusted role. A clinician must have a server-managed account role and an explicit patient grant. The selected patient is validated server-side.

- Read current patient: `GET /care/api/state` (approved plan, tasks, help requests, acknowledgements). Patients do not receive drafts.
- Patient creates a request: `POST /care/api/help` with `{ requestId, quote }`. The same record immediately appears in the assigned doctor's state snapshot. A lost response is retried with the same ID and text.
- Doctor acknowledges it: `POST /care/api/help/:id/ack` with `{ requestId }`. Patient sees `acknowledged` after refresh. Acknowledgement is not an appointment booking or a promise that someone was notified.
- Doctor drafts changes: `POST /care/api/plans/import` with `{ requestId, sourceText }`. Each non-empty line becomes an instruction with source attribution. Drafts are not patient-visible.
- Doctor publishes reviewed changes: `POST /care/api/plans/:id/approve` with `{ requestId, expectedCurrentVersion }`. This replaces the current approved plan and its current tasks atomically. Stale versions are rejected.
- Read saved reports: `GET /care/api/reports` and `GET /care/api/guided-reports`. Doctor acknowledges a verified report with `POST /care/api/reports/:id/ack` and `{ requestId }`.

The patient page reads on opening, returning to the tab, and every 15 seconds while visible. Refresh also reads immediately. Thus an approved doctor change or acknowledgement appears without a page reload. This is polling, not a Supabase Realtime subscription. An error leaves the last loaded information visible with a retry message. Initial failure does not substitute fictional data.

## Current display contract

The existing plan contract is text-based. Use explicit line labels such as `Medication:`, `Exercise:` and `Follow-up:` when authoring it. The patient UI groups those labels and common existing dose/exercise wording for display only; it preserves the approved text and provides all original instructions and sources in an expandable section. It does not infer doses, exercise targets, appointments or clinical outcomes. Structured prescription and appointment fields can be added in a versioned contract when the doctor/EHR integration supplies them.

Follow-up availability and booking remain pending. `Request a follow-up` opens an editable request and only saves it after the patient submits; it cannot claim a booked slot. No scheduling service or EHR has been connected by this change.

Local development continues to use the existing demo JSON stores. Hosting and the doctor portal itself are not deployed by this change. Matching database configuration alone does not wire an external portal: Asmita must call these endpoints with its verified clinician session and granted patient context.

## Verification

The production tests use real Postgres behavior through PGlite and the same RLS migrations: one patient submits a request, a separate clinician service sees and acknowledges it, the clinician publishes a reviewed plan, and a newly opened patient service sees the new plan/version/tasks. Another patient's records remain unchanged; patient acknowledgement and clinician plan approval are role-protected. Display tests reject draft/foreign plans and obsolete task completion while preserving original prescription text.

Browser verification on isolated fictional records also covered the follow-up request prefill, patient submission, subsequent clinician acknowledgement, saved report details, and an approved plan update appearing without reloading the page. Layouts were checked at 320px, 390px and 1280px; none had horizontal overflow. The Care production build and all 32 connected-app integration checks passed, along with the three standalone app checks. Yuvraj's archived source and published-history bundle remained unchanged.

## Asmita branch compatibility note

Read-only review of `origin/asmita/care` at `8ec94f4` found that its doctor portal's `patient-portal.ts` uses a local `JsonStore` and additional `patients[]` records. Updating a patient's medication or appointment fields there does not itself publish `care.plan` or replace its tasks. That branch has not been merged or changed here.

When connecting it, replace that separate local persistence with the shared patient-scoped service, and publish doctor-reviewed plan changes through the import/approval endpoints above. Use a verified, per-account patient selection rather than the demo store's global `selectedPatientId`. The branch's new appointment fields will also need an agreed patient-safe contract before the Next follow-up card can show booked visits. Merely pointing two separate local JSON files at the same patient ID will not synchronize the portals.

Exercise links open the single Panda camera experience at `/exercise?from=care`, and Exit returns to Care Hub. `/rehab` is now a compatibility redirect; its APIs remain unchanged. See [navigation verification](PATIENT_NAVIGATION_QA.md).
