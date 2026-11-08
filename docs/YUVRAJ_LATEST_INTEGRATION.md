> For the repaired start/calibration flow and current runtime camera adaptation, see [EXERCISE_FLOW_REPAIR.md](EXERCISE_FLOW_REPAIR.md).

# Latest Yuvraj source integration

## Preserved source

Reviewed `https://github.com/yuvrajdrums/ub-hack`, all published branch heads, and the differences from the previously integrated `165d7b7`. The latest completed camera flow is on `yuvraj/camera-to-text`, commit **371198efaeb7ac953e8a8c7161daa59706efe321**. Its fork `main` still points to `165d7b7`.

The complete 252-file tracked tree is retained unchanged in `references/yuvraj/camera-to-text-371198e/source/`. `UPSTREAM.json` records the upstream Git commit/tree/blob IDs and SHA-256 for every file. `published-branches.bundle` preserves all five published branch histories, including the separate Cloudflare and model-selector branches; `BUNDLE.json` records the archive checksum. Current and historical blobs passed the credential-pattern check. No ignored local environment files were imported.

`npm run verify:yuvraj` verifies the original source inventory, every file checksum, and the branch archive checksum. It is part of `npm run check`. `.gitattributes` preserves exact bytes across operating systems; `.prettierignore` excludes the upstream reference from formatting. No upstream source, tests, prompts, generated assets, or hosting files were edited.

## Runtime integration

The new `packages/yuvraj-integration/` layer imports Yuvraj's original camera hook/model list, provider/prompts, request schemas, and session service directly from the preserved source. It composes the original service through its supplied `CvStore` interface. Panda's camera presentation remains in `packages/rehab-bridge/GuidedWorkspace.tsx`; its orchestration now follows the new automatic calibration and Gemini analysis flow.

Included behavior:

- Lite, Full and Heavy pose-model selection; changes stop the camera and reset references. Lite stays bundled; Full/Heavy use Yuvraj's versioned Google URLs.
- Automatic Gemini calibration from transient 3–8-frame landmark windows. The UI follows Yuvraj's three-check, high-confidence, stable-reference settling process; manual overrides remain available.
- Ordered 1–2 second pose batches analyzed by the original Gemini implementation. Camera-counted sets use Gemini cumulative estimates; deterministic reducers remain for explicitly simulated traces and confirmed static holds.
- Calibration and movement cues are fetched by ID from the owner service before Panda speaks or remembers them. Calibration/movement source attribution, confidence and progress remain in patient context. Repeated or expired cues do not replay over the patient.
- The latest server counts feed the existing canonical report, Panda's feelings/pain review, and Care report acknowledgement. `analysisMethod: gemini_landmark_analysis` identifies the new estimates without changing legacy report APIs.

The adapter adds authenticated patient scope, patient-only writes, atomic captured Care references, the existing Postgres/JSON store boundary, and protection against late analysis crossing a pause/control revision. It sanitizes upstream provider failures and preserves earlier accepted progress. Failed/incomplete analysis remains partial or unavailable rather than generating successful measurements. Raw images/audio are never sent to Gemini by the pose flow, and raw landmark frames are not persisted. Small derived summaries and model working memory are stored in the patient-scoped owner record.

Server startup normalizes default Rehab model/mode settings around existing Panda Gemini credentials. Explicit Rehab settings win. No new API key is needed. Provider limits remain bounded; pose requests use their own bucket so they do not consume Panda's conversational allowance. Production CSP permits the selected model assets and WebAssembly. No credentials are included in browser code.

New connected endpoints are `/rehab/api/cv/v1/calibrate`, `/calibrations/:id`, `/sessions/:id/analyze` and `/sessions/:id/analysis`. `guided_calibration` and `guided_analysis` are additive ID-based bridge events. Existing plan, task, help, legacy Rehab report and acknowledgement APIs remain available.

The original Cloudflare/phone-hosting code is retained for reference; it was not merged into Panda's hosting configuration. EHR and deployment remain deferred. No hosted database migration or Render deployment was performed.

## Review findings and validation

- The unchanged upstream suite passes **47/48** CV tests. One old assertion expects `/untracked/` when submitting a camera repetition event. The new service correctly rejects that event with `GEMINI_ANALYSIS_REQUIRED`, because real camera counts now come from `/analyze`. The original assertion is preserved. Panda's separate regression covers the new rejection and the simulated overshoot/pause behavior.
- The upstream provider remains unmodified. Its generated counts and calibration are demonstration estimates; physical camera accuracy and clinical correctness have not been validated here.
- `npm run check`: **172 tests pass**, including composed upstream report/voice flow, owner isolation, calibration replay, no raw-frame storage, rejected regressive counts, and late-analysis pause protection.
- All three apps build. **32 connected checks and three standalone checks** pass.
- `npm run test:yuvraj:integration` passes the actual HTTP flow: calibration → verified Panda cue → camera analysis → verified Panda progress/context → saved report → review → Care acknowledgement. Provider output in this test is synthetic and explicitly preloaded only for the isolated test process.
- `npm run test:browser` passes with fake media: home/voice navigation, the new original Lite camera hook, model-selector reset, patient-confirmed hold, review and inline speech interruption. This does not validate physical exercise tracking or Full/Heavy startup on a phone.
- A live Gemini calibration retry using only synthetic landmark input returned HTTP 200 and a schema-valid response with the existing configured model. An earlier live attempt was unavailable; live latency/quotas can still affect the experience. No real patient pose data was used.

Source preservation is checked again after builds/tests and before pushing. Physical phone camera, real microphone/echo and clinical acceptance remain separate work.
