# Panda: changes since the Rehab navigation request

Recorded: **8 November 2026**. Original application-code snapshot: **`21cf7ac`** on `main`; a later demo reset is recorded at the end.

## Scope and starting point

This record starts at the request:

> “Clicked this didn’t go to the rehab section … I want Panda to be able to open the rehab section as well.”

It covers the implementation changes, integration work, local data reset, verification, and repository/runtime work from that point through the subsequent localhost restart. It distinguishes completed application behavior from integrations and device testing that remain pending.

The circular Panda visualizer, inline voice/text interface, persistent patient memory, initial check-in workflow, and Supabase/Render preparation already existed before this starting point. They were retained and extended; they are not counted here as newly created features.

## 1. Open exercise from the home action and Panda

Implemented in **`2780c54`**.

- Made the entire **Move a little / Guided exercise** action open the integrated exercise experience.
- Added `POST /api/voice/checkin/open-exercise` as a deterministic entry path. Opening exercise does not require a successful general conversation-model request.
- Routed explicit voice and typed requests to open exercise through the same entry flow.
- Kept the companion and its ongoing check-in available when entering exercise.
- Preserved unfinished medication, meal, and follow-up topics for later rather than marking them completed when exercise opens.
- Retained pending-confirmation and unresolved-concern checks before allowing a set to start.

The public destination was subsequently standardized to **`/exercise`**. The internal voice navigation value `/rehab` remains a compatibility instruction mapped by the client to that public exercise screen.

## 2. Remove the unwanted home header

Implemented in **`6cd7621`**.

- Removed the home branding/header block containing the Panda identity, care-companion subtitle, and header action icons shown in the removal request.
- Kept the existing home theme, small actionables, inline interaction, and circular visualizer.

## 3. Bring in Yuvraj’s completed exercise implementation

Implemented in **`732700c`**; refined in the later coaching and exercise-repair commits.

### Preserve the original work

- Reviewed Yuvraj’s published source and branch heads.
- Imported the latest completed camera flow from upstream commit **`371198efaeb7ac953e8a8c7161daa59706efe321`** on `yuvraj/camera-to-text`.
- Preserved its complete **252-file tracked source tree** under `references/yuvraj/camera-to-text-371198e/source/`.
- Preserved the published branch histories in `references/yuvraj/published-branches.bundle`.
- Added provenance/checksum records and `npm run verify:yuvraj`, which verifies the source files and branch archive.
- Kept the preserved original unchanged. After permission to repair the runtime implementation was given, camera fixes were made in a separate adaptation, `packages/yuvraj-integration/camera-runtime.ts`.

### Connect the implementation

- Composed the upstream provider, prompts, schemas, model definitions, and session service through `packages/yuvraj-integration/`.
- Integrated local pose inference and Lite/Full/Heavy model selection. Changing the model or working side stops the camera and resets the references.
- Integrated Gemini calibration and ordered landmark-batch analysis for live camera repetitions.
- Kept simulated traces and patient-confirmed static holds as separately labeled evidence paths.
- Connected ordered session events, pause/resume, finish/save, history, and canonical reports to Panda’s shared exercise screen.
- Added patient/plan binding, owner checks, session-control revisions, freshness checks, and protection against late analysis overwriting a paused or changed session.
- Preserved accepted progress when a provider fails. Missing or failed analysis remains partial/unavailable rather than becoming an invented successful measurement.
- Kept raw camera images on the device. The exercise analysis sends derived joint positions, and raw landmark frame batches are not persisted in the exercise store.

The four current exercise demonstrations are seated knee extension, seated flexion/extension, straight-leg raise, and guided static quads. Their configurations remain demonstration references; structured clinician-approved exercise mapping is still pending.

## 4. Recover normally from silence during voice input

Implemented in **`4446e7b`**.

- Reproduced a successful transcription response containing an empty string and found that the previous nonempty validation converted ordinary silence into a failure.
- Accepted valid blank/whitespace transcription as **no speech**.
- Kept the same hands-free check-in listening after silence instead of stopping the call.
- Prevented silence from creating a patient utterance, confirming an action, or advancing the check-in.
- Kept actual provider failures, missing fields, and malformed responses as errors.

See [VOICE_SILENCE_RECOVERY.md](VOICE_SILENCE_RECOVERY.md).

## 5. Consolidate the integrated product on main

- Finalized the integrated patient application on `main` and pushed the completed code to GitHub.
- Preserved Yuvraj’s source and branch archive for later reference.
- Kept Asmita’s doctor-portal branch separate. It was reviewed for compatibility, not merged or changed as part of this patient work.
- Verified after the latest repair that local `main` and GitHub `main` both pointed to application commit **`21cf7ac`**.
- Kept API credentials, local patient stores, build output, and operating-system metadata out of the application commits.
- Left unrelated local reference/pitch/launch documents uncommitted rather than including them in code-only pushes.

The current branch inventory retains `main` and the separate remote `origin/asmita/care`. This record does not infer names for branches whose deletion history is not recorded in the current repository inventory.

## 6. Rebuild Care Hub as a patient-only page

Implemented in **`f61abb3`**.

Matched the existing Panda theme and organized `/care` into the requested sections:

1. **Medication prescribed** — display the approved medication instructions.
2. **Exercise prescribed** — display the approved exercise instructions and open the integrated exercise experience.
3. **Next follow-up** — show the available plan information; availability/booking remain pending.
4. **My requests** — the patient-facing replacement for Human follow-through.
5. **Exercise reports** — display saved canonical exercise reports and their evidence labels.

Additional behavior:

- Removed the clinician workspace and clinician import/approval/acknowledgement controls from the patient page.
- Retained the role-protected clinician APIs for the separate doctor portal.
- Added editable follow-up request preparation and explicit submission. A request is not represented as a booked appointment.
- Refreshed patient state on opening, returning to the tab, every **15 seconds while visible**, and manual refresh.
- Retained the last loaded data on refresh failure and provided retry feedback.
- Preserved the original approved instruction text and its sources in an expandable section.
- Grouped the existing text-based plan for display without inventing structured prescription or appointment facts.

## 7. Define the shared doctor/patient data boundary

Implemented/documented in **`f61abb3`** and **`94e5a8f`**.

The intended production connection uses the same Supabase project, patient identifiers, and patient-scoped Care service for both portals:

- Patient requests are created through `POST /care/api/help`.
- A clinician with an authorized patient grant can read and acknowledge the same request through the Care API.
- Doctor-reviewed changes are drafted through plan import and published through plan approval/version checks.
- The patient reads the newly approved plan and tasks from the same authoritative state.
- Exercise reports remain owned by Rehab; Care reads them and stores acknowledgement references separately.
- Cross-patient access, roles, stale versions, and retry/idempotency rules remain server-validated.

**Implemented boundary versus pending portal connection:** the shared service behavior was tested using separate patient and clinician service instances. The actual separate doctor portal was not connected end to end. Read-only review of Asmita’s branch at `8ec94f4` found separate local JSON persistence and patient fields that do not automatically publish Care plans/tasks. That portal still needs to use the shared authenticated APIs and agreed appointment contract.

See [PATIENT_CARE_HUB.md](PATIENT_CARE_HUB.md) for the integration contract and compatibility findings. Asmita continues to own the doctor/EHR integration work under the latest team direction.

## 8. Unify exercise navigation and remove redundant screens

Implemented in **`6569189`**.

- Standardized the public patient routes to `/`, `/care`, and `/exercise`.
- Updated all three Care Hub exercise entry points: the prescribed-exercise card, empty-report action, and navigation link.
- Used `/exercise?from=care` for Care launches so Exit returns to Care Hub.
- Kept home and Panda launches on `/exercise` so Exit returns home.
- Converted `/rehab` into a compatibility redirect instead of exposing another patient exercise interface.
- Kept `/rehab/api/*`, model assets, and WebAssembly assets working under their existing URLs.
- Removed unused `packages/rehab-bridge/Workspace.tsx` and `packages/ui/Shell.tsx`.
- Waited for companion initialization before processing a direct exercise URL.
- Prevented restored conversation history from replaying an old navigation command.
- Kept ordinary chat on home after exiting an unfinished exercise; explicit exercise requests still open exercise.
- Verified browser back, forward, reload, and the correct return destination.
- Made the underlying home controls inert while exercise is open.
- Kept camera/microphone permission activation explicit. Opening the page alone does not turn them on.
- Preserved entry retry IDs and saved a running set before an explicit exit.

Historical verification for this milestone recorded **28 browser flow checks**, **178 automated tests**, **36 connected checks**, and **three standalone checks**. The latest overall test counts are recorded below.

## 9. Feed Rehab’s Gemini feedback into Panda’s voice and memory

Implemented in **`4a53ca9`**, with live success recorded in **`9fd4f8d`** and further repairs in **`21cf7ac`**.

- Composed Panda’s concise spoken-coaching style into the existing Rehab calibration/analysis request.
- Avoided an additional conversation-model call just to rewrite every pose update.
- Sent canonical calibration, analysis, session-start, feedback, and saved-report IDs through the typed bridge.
- Had Panda fetch and validate the owner records before speaking or retaining their observations.
- Stored feedback in patient context with source attribution, confidence/progress information, and canonical references.
- Kept patient questions on Panda’s conversational path with the recent exercise observations available as context.
- Used the existing ElevenLabs streaming player and circular visualizer for exercise speech.
- Reused an already active conversation when entering exercise. Otherwise, the patient enables exercise voice with Panda’s mic control.
- Prioritized patient speech/transcription over coaching.
- Retained only the newest transient live update while keeping session-start and report-save delivery durable.
- Spaced separate spoken cues by at least **six seconds** and suppressed repeated wording for **20 seconds**.
- Discarded stale cues and cancelled movement coaching on pause, finish, camera loss, or failed analysis.
- Added bounded retry/backoff and bounded pending-frame storage.

### Provider configuration and recovery

- Kept Panda conversation credentials separate from the optional dedicated Rehab credential.
- Added support for `REHAB_GEMINI_API_KEY` and optional `REHAB_GEMINI_MODEL` without overwriting Panda’s conversation credential.
- Diagnosed the observed Gemini quota rejection and ElevenLabs credit/account rejections.
- Retested after credentials/allowances were updated; the live Rehab-to-Panda-to-ElevenLabs path passed.
- Kept key values in ignored environment files and out of documentation, browser code, and Git.
- Did not silently change the configured conversation/analysis model or substitute device speech to hide a provider failure.

## 10. Clear an outdated local concern blocking the exercise demo

This was a **local demo-data operation**, not a change to exercise safety rules.

- Removed the obsolete concern/help request and related saved conversation/memory/receipt entries identified as the exercise blocker.
- Reset the affected blocked check-in records so a new exercise entry could proceed.
- Preserved prescriptions, checklist tasks, exercise reports, and API keys.
- Verified that exercise entry returned the exercise stage without a concern hold.
- Restarted the apps and refreshed the exercise page to remove stale client state.

No patient transcript or local database was added to GitHub. New concerns and unresolved confirmations can still hold exercise.

## 11. Repair the failed start and automatic calibration flow

Implemented in **`21cf7ac`**, following the supplied screen recording and disabled-button report.

### Explain why setup is waiting

- Replaced the silently disabled initial start path with **Set up & start**.
- Remembered the request to start while setup completes.
- Made the center guidance explain missing tracking instead of telling the patient to hold still when the selected leg is not measurable.
- Identified the first missing required joint and displayed a useful positioning instruction.
- Added a visible working-leg switch during framing.
- Drew only the selected exercise’s required joints, excluding off-screen and low-confidence points.
- Used a local-only inspection of a recording frame to investigate the framing problem; that frame was not sent to an external AI provider.

### Make calibration progress reliably

- Changed the polling timer so rapidly changing pose validity no longer repeatedly restarts it.
- Requested the expected starting/target position for the current setup step.
- Accepted a high-confidence stable Gemini result when an independently stable local observation window agrees.
- Retained three consistent remote checks as an alternative, with a window that tolerates slow provider replies.
- Rejected late results that do not agree with the current visible angle.
- Added provider-error backoff instead of repeatedly consuming requests.
- Exposed **Save starting position** and **Save comfortable target** directly on the camera screen.
- Required a fresh, stable one-second observation window for manual capture.
- Kept the requirement for two valid, separated comfortable references before camera counting begins.
- Required fresh camera references for a new camera run rather than reusing a finished set’s pose setup.

## 12. Make Panda control the actual exercise session

Implemented in **`21cf7ac`**.

- Added a bounded typed exercise-screen context: current exercise, working side, setup stage, missing-joint status, and displayed progress.
- Labeled that context as client UI status; canonical Rehab records remain the authority for saved measurements.
- Stopped routine exercise greetings from restarting the old body-part/check-in conversation.
- Added deterministic handling for explicit **start**, **pause**, **resume**, and **finish/save** commands.
- Returned control IDs and applied each control once through the same functions used by the exercise buttons.
- Kept the controls usable while Panda answers a question.
- Kept exercise voice/control behavior separate from failures of the general conversation model.
- Added setup instructions to the same voice player used by validated Rehab feedback.
- Prevented stale setup/calibration instructions from playing after the screen advanced to another setup phase or the running set.
- Replaced stale movement guidance with a paused message while counting is paused.
- Made a worsening-pain report hold exercise even if the general conversation model is unavailable.

## 13. Count, save, review, and allow subsequent sets

Implemented/refined in **`21cf7ac`**.

- Displayed the current set number and repetitions against its configured target.
- Continued using canonical Gemini analysis for camera-estimated repetition totals.
- Preserved accepted counts through pause/resume and provider failures.
- Automatically finished and saved a set after its configured repetition target was reached.
- Kept manual finish/save available, retaining the actual counts and the owner’s completion classification.
- Displayed saved repetitions and the number of saved sets for that exercise/side/day.
- Moved a saved report into the post-exercise feelings review without requiring a successful general conversation-model response.
- Retained the subsequent pain/discomfort review and unfinished check-in agenda.
- Added fallback handling for clear review/no-pain answers when the conversation provider is unavailable.
- Released the previous exercise-session binding after review so a subsequent set can use a new session.
- Explained why the patient needs to continue with Panda when another set is held for review, rather than leaving an unexplained disabled Start button.

## 14. Local runtime and final verification

The current local setup runs the three connected apps through Panda’s gateway:

- Panda: `http://localhost:3000/`.
- Patient Care Hub: `http://localhost:3000/care`.
- Integrated guided exercise: `http://localhost:3000/exercise`.
- Care and Rehab run internally on loopback ports 3001 and 3002.

The local preview was moved to the freshly built app using `npm start` after a development-preview refresh problem. It was restarted again when requested, with successful HTTP 200 checks for Panda, Care, Rehab, Care Hub, and exercise. This is local hosting; it is not a Render deployment.

### Latest application verification

- **194 automated tests passed**, together with app/server type checks and the preserved-upstream guard.
- **All three apps built successfully.**
- **36 connected HTTP checks and three standalone checks passed.**
- An isolated browser test passed automatic calibration, spoken start, spoken pause/resume/finish, and saving a manually finished two-repetition set.
- A second browser set counted **all ten synthetic repetitions**, saved automatically, displayed the saved count, and entered post-exercise review.
- The browser test deliberately made the general conversation provider return 429. Camera input, analysis output, and speech playback in that test were synthetic, and its records were isolated from local patient data.
- A separate live synthetic-landmark check passed **Rehab Gemini → verified Panda feedback/memory → ElevenLabs audio**. It counted the supplied sample movement; first audio arrived **436 ms** after the speech request in that measurement.
- The original source archive and branch bundle passed checksum verification after the final push.

These results verify application orchestration and the tested live provider connection. They do not establish physical movement-counting accuracy, clinical correctness, or real-device microphone/echo acceptance. The historical unchanged upstream suite also had one documented outdated assertion expecting a camera-event error instead of `GEMINI_ANALYSIS_REQUIRED`; the original assertion was preserved rather than rewritten to claim a clean upstream suite.

## 15. Integration map for the team

### Main code boundaries

- `apps/panda/src/app/page.tsx` — shared Panda/exercise interface, navigation, and controls.
- `apps/panda/src/app/use-companion.ts` — voice/text lifecycle, exercise context, feedback queue, speech priority, and control handoff.
- `apps/panda/src/server/checkin.ts` — persistent check-in stages, deterministic exercise entry/commands, canonical feedback consumption, and review.
- `apps/panda/src/server/conversation.ts` — model context and the instruction to follow the active exercise rather than old plan wording.
- `packages/contracts/exercise-runtime.ts` — validated UI-context shape and routine exercise command/guidance helpers.
- `packages/contracts/checkin.ts` and `packages/contracts/voice.ts` — additive bridge/context/control types.
- `packages/rehab-bridge/GuidedWorkspace.tsx` — integrated camera presentation, setup, session controls, progress, and save flow.
- `packages/rehab-bridge/calibration-settling.ts` — stable-reference acceptance logic.
- `packages/yuvraj-integration/` — upstream service/provider composition and the separate runtime camera adaptation.
- `apps/care/` — patient Care Hub and the authoritative plan/task/request/acknowledgement service.
- `packages/ui/patient-navigation.ts` — shared public patient routes and return-navigation behavior.
- `references/yuvraj/` — original source and history retained for comparison.

### Connected API boundaries

- Panda exercise entry: `POST /api/voice/checkin/open-exercise`.
- Patient conversation/control turn: `POST /api/voice/checkin/answer`.
- Canonical exercise feedback into Panda: `POST /api/voice/exercise-feedback`.
- Speech output/input: `POST /api/voice/speak` and `POST /api/voice/transcribe`.
- Rehab context/calibration/session APIs: `/rehab/api/cv/v1/context`, `/calibrate`, `/calibrations/:id`, `/sessions`, `/sessions/:id/events`, `/sessions/:id/analyze`, `/sessions/:id/analysis`, and `/sessions/:id/finish` under the same CV prefix.
- Care patient state/requests: `GET /care/api/state` and `POST /care/api/help`.
- Reviewed-plan publication: `/care/api/plans/import` and `/care/api/plans/:id/approve`.
- Canonical reports/acknowledgements: `/care/api/guided-reports`, `/care/api/reports`, and `/care/api/reports/:id/ack`.

Care owns plans, tasks, requests, and acknowledgement records. Rehab owns exercise sessions and canonical reports. Panda owns dialogue, proposals, check-ins, and attributed patient memory. Consuming another module’s data does not create a second authoritative copy of it.

## 16. Remaining work and explicit exclusions

- Connect Asmita’s actual doctor portal and EHR integration to the shared authenticated patient-scoped service. Shared-service tests are not a claim that the external portal is already wired.
- Add the doctor-availability and appointment-booking adapter. Follow-up preferences/requests remain pending, not booked visits.
- Agree structured, clinician-reviewed exercise prescriptions and their mapping to supported exercise modules.
- Complete physical camera/rep-counting acceptance and real-device microphone, playback, interruption, and echo checks.
- Complete clinical-content review and any approved medical-reference retrieval integration. No external medical-advice knowledge provider was connected during this work.
- Complete the production release prerequisites, hosted guided-exercise storage migration, invitation/email configuration, monitoring, and deployment approval. Deployment was explicitly deferred; no Render deployment was performed in this period.
- Scheduled reminders/outbound calls, wearables, caregiver access, and installable/offline-app features remain later work.

## Commit trail

1. `2780c54` — direct home/Panda exercise opening.
2. `6cd7621` — remove the unwanted home header.
3. `732700c` — integrate Yuvraj’s latest flow and preserve original source/history.
4. `4446e7b` — keep listening after empty transcription.
5. `f61abb3` — patient-only Care Hub and shared plan/request update behavior.
6. `94e5a8f` — document the actual doctor-portal integration gap.
7. `6569189` — unify exercise navigation and retire duplicate screens.
8. `4a53ca9` — paced canonical Rehab feedback through Panda voice/context.
9. `9fd4f8d` — record successful live exercise coaching and ElevenLabs streaming.
10. `21cf7ac` — repair calibration, start/control flow, voice context, counting/save/review, and subsequent-set handling.

Local data cleanup and server restarts are operational changes and do not have source-code commits. This Markdown record is a later documentation addition covering the application changes above.

## Follow-up: clean knee-recovery demo

After the original change record, the local Panda demo patient stores were cleared at the user's request: persistent conversation/context, check-ins and receipts, Care state/requests/acknowledgements, and Rehab sessions/calibration/report records. API keys were preserved. This reset affected the local demo, not hosted Supabase or the separate doctor-portal service. Browser exercise-recovery data was cleared before reopening Panda.

Alex's generated synthetic baseline now explicitly records a left knee replacement surgery and a matching left seated-knee-extension demonstration. No surgery date or clinical postoperative prescription was invented. Existing illustrative medication data remains labeled fictional. The recovery greeting explicitly offers a fresh check-in about the documented knee; routine conversation can use the stated procedure rather than claiming it is unknown or assuming an elbow. The checked-in generator produces this same baseline again, and integration identifiers remain stable.

The updated check passes 196 tests, including the documented procedure, fresh pending tasks, knee-specific opening and explicit check-in wording. Existing old patient data and verification dialogue are excluded from source control.
