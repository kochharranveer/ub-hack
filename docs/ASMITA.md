# Asmita — Care hub / complete-function guide, revision 4

Your app is `apps/care`, served at `/care`. You own the doctor-facing care-management loop: FHIR source → reviewed draft → approved patient plan → checklist status → clinician follow-through. This local prototype stores Care data in JSON; a shared database is deferred. **Ranveer owns all Voice AI and the separate patient CareHub. Yuvraj owns all computer vision/exercise reports and the separate patient Exercise app.**

## 1. Exact responsibilities

| Complete function | What you build |
| --- | --- |
| Care plans | Import, extraction/source review, clinician approval/version history, patient-readable plan |
| Daily checklist | Tasks derived from approved plan, patient confirmation, revisions/idempotency, evidence labels |
| Human handoff | Help request records, clinician patient workspace, acknowledgement, patient-visible status |
| Report acknowledgement | Fetch Y's saved reports; display estimates/quality and store an acknowledgement referencing session ID |
| FHIR/EHR integration | Connect to a FHIR server and import sourced CarePlans as drafts; database connection is deferred |
| Product design | Shared tokens/accessibility/navigation conventions in `packages/ui`; each teammate builds their own screens |
| Later | Appointments, caregiver access and installable-app experience; PDF/OCR if time after the working text loop |

Owned paths: `apps/care/**`, `packages/contracts/care.ts`, `tests/care*`, `packages/ui/**`. You also own care/demo story documents. Ranveer coordinates root dependencies/lock/gateway/identity setup, but not your domain backend. Yuvraj owns measurement/report persistence, including the report producer API.

## 2. Start independently

Join the ONE Classroom team repo Ranveer created. Clone the same repo; do not create a disconnected design-only project.

```bash
git clone <SHARED_CLASSROOM_REPO_URL> panda-care
cd panda-care
npm ci
cp .env.example .env.local
git switch -c asmita/care
npm run dev:asmita
```

Open http://localhost:3001/care. You can import/review/approve and use local Care storage without either teammate's server. Report list is an explicit empty fixture in solo mode. For integration, stop the solo app and run `npm run dev`; use http://localhost:3000/care. All cross-app links are intended for that shared entry.

Read `docs/OWNERSHIP.md`, `SHARED_CONTRACT.md`, `API_STATUS.md`, `BUILD_ORDER.md`. This is a three-app v2 contract, replacing the older shared single-app approach.

## 3. What the starter already implements

Working FHIR R4 capability check and active CarePlan import to a sourced draft; HAPI `patient-t1` was synced through the service layer. Care currently uses local JSON storage. Fixed demo clinician/patient identities are not real authentication. PDF/OCR, editable structured extraction, full historical approvals, real appointment booking/caregivers/PWA are not implemented.

### Your exact build order

1. Exercise `.txt` → draft → review → approve. Check the patient/voice-approved plan stays unchanged until approval. Never auto-approve extracted model output.
2. Build your accessible plan/review interface: source on one side, editable proposed instructions on the other; each instruction has provenance. Add a safe unsupported/ambiguous-document state. Keep large controls, readable text, keyboard focus and explicit loading/error states.
3. Finish the care domain model and API. Retain immutable historical approvals; capture approver/time; use optimistic concurrency. A newer plan must not rewrite Yuvraj's older session references.
4. Build patient and clinician routes/response shapes separately. The starter's single demo toggle exposes all synthetic data for convenience; it is not a permissions mechanism. Real patient responses must not expose drafts or clinician-private notes.
5. Finish checklist derivation and confirmation. Keep patient-reported evidence separate from camera estimates. Reject stale revisions and retired task IDs; stable request IDs protect retries.
6. Finish clinician help handling: open → acknowledged, who/when, and a useful next-step response. A created record is not delivered care or emergency dispatch. Persist updates before showing acknowledged.
7. Connect Yuvraj's finished-report endpoint. Render its measurements as estimates, show tracking quality, termination reason, captured plan version and simulated/live evidence. Store your own `{sessionId,by,at}` acknowledgement; never modify or copy his authoritative report table.
8. Improve shared design tokens/navigation/components. Give both teammates reusable tokens and examples; don't become responsible for building their UI. Ask them to implement their own accessible screens.
9. Once core is stable, add PDF/OCR extraction into the same draft-review API. Keep model/file limits and parse errors explicit. Extracted medication instructions must preserve the source and require clinician review; do not invent or auto-change treatment.
10. Test on phone and desktop, run the three-app loop, and record the honest short demo/submission.

## 4. API and data you own

| API | Required behavior |
| --- | --- |
| GET `/care/api/state` | Current demo context; later split patient-safe and clinician-only responses |
| POST `/care/api/plans/import` | Draft only; source text/provenance retained |
| POST `/care/api/plans/:id/approve` | Explicit authorized clinician action; current-version check |
| POST `/care/api/tasks/:id/confirm` | Patient self-report + expectedRevision; idempotent |
| POST `/care/api/help` | Verbatim user quote; recorded/open state |
| POST `/care/api/help/:id/ack` | Clinician acknowledgement with identity/time |
| GET `/care/api/reports` | Server fetch of Y's finished reports; no synthetic fallback on peer failure |
| POST `/care/api/reports/:id/ack` | Verify report exists and belongs to patient; persist acknowledgement reference |

Your domain tables belong in `care.*` when replacing local JSON: patients/relationships, documents/drafts, plan versions/instructions, tasks/events, help, report acknowledgements. You write their migrations and authorization policies. Use Ranveer's future verified identity helper, but authorize plan approval, patient access and acknowledgement in your own service. No other app writes your tables.

Preserve the stable v2 schemas in `packages/contracts/care.ts`. Core `/state` must not fetch reports, because Y's context calls it; avoid circular requests. Report fetch is a separate endpoint. No repeated auto-refresh should generate new mutation IDs.

## 5. Handoffs

To Ranveer: current approved plan/version, task IDs/revisions, confirmation/help routes, truthful patient status. His assistant calls your services; you do not build his prompt, audio, conversation API, model provider or calls.

To Yuvraj: approved plan/version and, for a real product, explicit clinician-approved exercise assignment/config. The starter assigns a demonstration movement to every demo plan; that is not a medical prescription. His service rejects stale starts. You consume his finished report by HTTP and acknowledge it in your store. You do not implement his session/backend/report save.

For real accounts: Ranveer supplies sign-in/session verification; you own care relationships, clinician actions and patient-safe field filtering. Schema/API changes affecting R/Y require their review.

## 6. Remaining workflows you own after MVP

- Appointments: request/review/calendar UI, APIs/storage, availability/booking confirmation and tests. A requested slot is not a booked visit. Ranveer's future EHR adapter can provide external availability/booking; he does not own your appointment-state workflow.
- Caregiver experience: invitations, verified relationship/access grants, consent, allowed status views and revocation. Caregivers read original domain APIs; no shadow patient database.
- Installable-app experience: manifest/icons/install state/offline shell. Don't cache sensitive authenticated responses or promise reliable reminders from a service worker. Server reminders/calls belong to Ranveer.
- Refill/treatment change requests: clinician-review queue and patient-visible state, never AI prescribing or automatic dose changes.

No wearables (Yuvraj), CRM/EHR connections (Ranveer), notifications/calls (Ranveer), voice (Ranveer) or camera (Yuvraj) in your implementation scope.

## 7. Acceptance and collaboration

- [ ] Import leaves approved context unchanged until explicit review/approval.
- [ ] Stale approvals and task revisions fail; same-ID retries return one saved result.
- [ ] Source/provenance is visible; historical plans stay available after new approval.
- [ ] Help is recorded first, acknowledged separately; patient sees honest status.
- [ ] Y's same session ID/plan/evidence appears in your report review; ack is your record.
- [ ] Phone layout, keyboard/text fallback and source review are usable.
- [ ] Your care tests plus root check/build/integration pass; real authorization still pending is disclosed.

Branch `asmita/care`. Keep ownership complete: commit your screens AND routes/domain logic together. Root lock changes go through a coordinated Ranveer edit window; he is not your backend queue. Share one design-system PR early, then small care-function PRs.

Own the demo narrative and under-three-minute video assembly with teammates. The Radial track rewards a useful physical-AI loop; don't add extra screens at the expense of Y's real tracking and your acknowledgement flow. Source PDFs/track details are summarized in `docs/TRACK_STRATEGY.md`.

## Editor prompt

You are Asmita's coding agent for Panda Care v0.2. Read docs/ASMITA.md, OWNERSHIP.md, SHARED_CONTRACT.md and API_STATUS.md. Own the complete Care web app in apps/care: document import/extraction review, clinician approval/version history, daily tasks/evidence, help/acknowledgements, report acknowledgement references, UI/APIs/storage/access rules/tests. Coordinate shared design tokens in packages/ui. Consume Yuvraj's report HTTP API and Ranveer's future identity/EHR helpers; don't rebuild their functions. Ranveer owns all voice AI; Yuvraj owns all vision/session/report creation. Preserve v2 contracts and stable retries, use synthetic data until authorization is built, and ship one tested function slice at a time.
