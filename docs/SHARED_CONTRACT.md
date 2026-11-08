# Integration contract — v2.0.0

Authoritative executable types: `packages/contracts/*.ts` (Zod validation). This intentionally replaces the older single-app v1 contract; upgrade all three together.

## Product composition

| Public product path | App / owner | Local service |
| --- | --- | --- |
| `/` and `/api/voice/*`, `/api/context` | Panda / Ranveer | port 3000 |
| `/care/*` including `/care/api/*` | Care / Asmita | port 3001, Next basePath `/care` |
| `/rehab/*` including `/rehab/api/*` | Rehab / Yuvraj | port 3002, Next basePath `/rehab` |

Panda proxies Care/Rehab paths, including `_next` assets. The browser sees one origin. Server-to-server calls use private origins, bounded timeouts and `cache:no-store`. Never send server secrets in query strings or browser bundles. Use `<a>` for cross-zone navigation; a hard navigation intentionally unloads voice/camera resources. The guided check-in instead mounts the single shared Rehab workspace within Panda, preserving its voice hook through bridge1.0.0; standalone hard navigation still stops resources. See [VOICE_CHECKIN.md](VOICE_CHECKIN.md) for the additive routes and bridge.

## API catalog

All JSON success envelopes are `{ok:true,data:T}`; errors are `{ok:false,error:{code,message}}`. No failed write returns a success message. HTTP 400 invalid input; 404 missing; 409 stale/reused IDs; 503 unavailable peer/provider. All paths below are public gateway paths; the owning app also serves them at its own base-path origin.

| Owner | Method / path | Input / result |
| --- | --- | --- |
| A | GET `/care/api/state` | `CareSnapshot`: current approved plan, drafts, current tasks, help, report acknowledgements; synthetic demo only |
| A | POST `/care/api/plans/import` | `{requestId,sourceText}` → draft Plan; never auto-approved |
| A | POST `/care/api/plans/:id/approve` | `{requestId,expectedCurrentVersion}` → approved Plan and replacement current tasks |
| A | POST `/care/api/tasks/:id/confirm` | `{requestId,expectedRevision,evidence:'patient_reported'}` → Task |
| A | POST `/care/api/help` | `{requestId,quote}` → open help record |
| A | POST `/care/api/help/:id/ack` | `{requestId}` → acknowledged help record |
| A | GET `/care/api/reports` | Care's server fetches Y's saved `ExerciseReport[]`; no copied source records |
| A | POST `/care/api/reports/:id/ack` | `{requestId}`; verifies report exists in Y's API → acknowledgement reference |
| Y | GET `/rehab/api/context` | CareSnapshot from A in connected mode; approved fixture in standalone mode |
| Y | GET `/rehab/api/sessions` | Finished `ExerciseReport[]`; interrupted/unmeasured reports included, unfinished sessions excluded |
| Y | POST `/rehab/api/sessions` | `{requestId,planId,planVersion,exerciseId:'demo-elbow'}` → captured Session |
| Y | POST `/rehab/api/sessions/:id/finish` | `{requestId,report:ExerciseReport}` → immutable report |
| R | GET `/api/context` | Approved-plan/checklist/help context plus integration and TTS modes |
| R | POST `/api/voice/turn` | `{requestId,text}` → VoiceReply, optional proposal ID or exercise navigation |
| R | POST `/api/voice/confirm` | `{proposalId}` → executes the original, unexpired, stored proposal once |
| R | POST `/api/voice/speak` | `{text}` → audio/mpeg when ElevenLabs configured; errors use JSON envelope |
| Each | GET `/<base>/api/health` | App, owner, contract version and integration mode; health response is intentionally not wrapped |

## Critical wire rules

IDs are opaque strings; do not parse the value to infer identity or authorization. Starter has one fixed synthetic patient. Datetimes are UTC ISO strings. Plan versions are positive integers; task revisions start at zero. A new approval increments the plan version and supersedes current task IDs. Historical exercise reports retain their captured plan version. The demo only stores the current approved plan; a production Care repository must retain the full immutable approval history.

Each mutation has one stable UUID request ID and a fingerprint. Retry the SAME ID with the SAME full payload, including timestamps. Same ID/different input is a conflict. Server-issued voice proposal IDs double as downstream care request IDs. Proposals expire after five minutes and are invalidated by an intervening plan change. Never generate a fresh ID just because the response was lost.

Voice tools are exactly `read_plan`, `read_patient_context`, `confirm_task`, `request_help`, `open_exercise`. All model outputs are parsed against the allowlist. No arbitrary URLs, SQL, medication-changing or prescribing tools. Read-plan responses quote approved source lines; AI routes intent instead of inventing clinical advice. A write is a proposal until a separate explicit UI confirmation. Speech alone does not silently perform a clinical action.

Reports bind `sessionId`, `patientId`, `planId`, `planVersion`, `exerciseId` and `startedAt` to the captured Session. Finish cannot change those. Unavailable tracking requires zero reps and null range. Simulation must use BOTH `evidence:'simulated'` and `trackingQuality:'simulated'`; it cannot be passed off as camera measurement. Camera measurements are estimates, never proof of correct technique or clinical improvement. Report saving does not imply clinician acknowledgement.

The demonstration movement is available under every approved demo plan. This is NOT a clinical assignment model. Before real use, Asmita adds clinician-approved exercise assignments/configuration and Yuvraj enforces them at start; a generic LLM must not invent thresholds.

## No shared mutable state between apps

Shared packages contain schemas, reusable UI and low-level transport/file helpers. The domain store in each app is owned by that person. Services call HTTP, not another service's internal functions/database. Care and Rehab make read-only reciprocal requests; avoid recursive endpoints (`state` must not fetch reports, and `sessions` must not fetch Care context).

Local JSON persistence is serialized per file inside one Node process and written atomically. It is not safe across replicas/processes. Replace it with domain repositories, DB transactions, durable idempotency records and an outbox for external deliveries before production. Missing/corrupt data or offline peers must not produce invented success.

## Auth boundary for the next milestone

This demo has no sign-in or clinical authorization. Production: verified same-origin session cookie, CSRF/origin checks for writes, scoped service-to-service credentials with actor/patient context, and domain-specific authorization in every API. Do not trust browser-supplied role/patient IDs. Restrict patient-visible snapshots; clinician drafts and private help notes must not leak. A shared cookie is not a substitute for server authorization.
