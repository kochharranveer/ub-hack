# Patient context and continuous check-in

Implemented November 7, 2026. This document supersedes the original guide's deferred continuous-voice scope following Ranveer's explicit request. Shared clinical contracts remain v2.0.0; the additive React exercise event bridge is v1.0.0.

## Patient experience

The home page has three compact actionables: medicines from the approved plan, exercise, and follow-up availability pending. Panda occupies the center. Tapping Panda starts the voice check-in inline, with permission handled by the browser. Keyboard replaces Panda with the text conversation in the same center slot; its bottom button becomes a microphone icon. Switching modes stops active recording/playback and preserves check-in context. Talking and typing do not open a dialog or navigate to a different page.

The guided flow asks about each medicine exactly as written in Care's approved task. A positive self-report creates a proposal; only the explicit confirmation button writes through Care. No/unsure is remembered without marking the task completed. Next it records food in the patient's words, states that scheduling is pending, asks exercise readiness, and opens the exercise workspace if ready. It asks how exercise felt after Rehab saves a report, then asks about pain/discomfort. A discomfort report can prepare an exact-quote care-team request, again requiring confirmation. Recorded help is not clinician acknowledgement or emergency dispatch.

Questions during a check-in can use the existing assistant without advancing the check-in stage. General medical question answering is not a validated feature: the current allowlist reads the approved plan and patient memory, proposes task/help actions, and opens exercise. No medical reference corpus or August integration has been connected.

## Persistent memory

Panda owns `patient-memory.sqlite` alongside its voice database. It records medication reports, food, scheduling-pending status, readiness, exercise feedback, verified report references/summaries, post-exercise feelings and pain. Patient quotes and module evidence retain their source. This memory has no automatic expiry: it persists until explicitly deleted. Recent/per-topic recall provides a bounded provider context, not an unlimited prompt.

This is separate from short-lived voice turns/proposals/receipts (24-hour retention). The memory API returns the latest 50 events, count and current check-in; older events remain stored. Deleting Panda memory does not delete Care's plan/tasks/help or Rehab's canonical reports. Backups and physical disk erasure need separate operational policies.

Repositories scope memory, histories, receipts and proposals by trusted server patient identity. The demo still has one fixed synthetic identity and no login. Scoping is tested but is not production authentication or authorization.

## Additive APIs

All JSON uses `{ok:true,data}` or `{ok:false,error:{code,message}}`.

- POST `/api/voice/checkin/start`: `{requestId}`. Creates/resumes the workflow; safely re-asks expired confirmation questions.
- POST `/api/voice/checkin/answer`: `{requestId,checkinId,text,expectedStage?}`. Retries replay; stale-stage answers fail instead of being recorded as a different answer.
- POST `/api/voice/checkin/continue`: `{requestId,checkinId,proposalId}`. Requires the actual saved result of confirmation/dismissal. It cannot execute an action.
- GET `/api/voice/memory`: patient-scoped event snapshot and active check-in.
- DELETE `/api/voice/memory`: `{confirm:true}`. Explicitly deletes this patient's Panda memory/check-ins/receipts only.
- POST `/api/voice/exercise-feedback`: `{requestId,checkinId,event}`. Validates bridge events and owner session/report before accepting report evidence.
- POST `/api/voice/transcribe`: multipart `file` audio, maximum 10 MB. Returns validated transcription text. Remote URLs and extra form fields are rejected.
- GET `/rehab/api/sessions/:id`: read-only captured Session, checked against the current Care patient.

Workflow replies include `checkin:{id,stage}`, `engine:'checkin_workflow'`, and optional `exerciseSessionId`. `VoiceContext` adds optional `sttConfigured`. The regular assistant adds `read_patient_context` with topic `all|food|medications|exercise|checkins`.

## Exercise ownership and integration

`packages/rehab-bridge/Workspace.tsx` is the single shared Rehab client workspace, re-exported by the standalone Rehab page and embedded by Panda. It continues calling Rehab's own session/report APIs through the gateway. Panda owns neither exercise measurements nor authoritative report storage. This extraction avoids divergent copies of the camera UI.

The optional callback receives schema-validated v1.0.0 events: `session_started`, `camera_status`, `tracking_status`, `report_saved`. `resumeSessionId` restores an owner session; `onAskPanda` preserves the mounted voice hook. Panda verifies sessions/reports by HTTP before storing references, rejects foreign patients and mismatched plans, and queues feedback with retry IDs. Repeated saved-report events do not rewind a completed review.

The guided exercise flow remains within Panda's mounted React tree, so audio can continue. Ordinary links to `/care` or the standalone `/rehab` still unload the page and stop resources. Do not replace the guided callback with hard navigation. Yuvraj's future pose engine should emit tracking events and save its report through the existing owner API. Camera preview and explicit simulated reports currently work; real pose inference is not implemented.

## Provider setup

Keep existing root `.env.local`; never overwrite it when following a quickstart.

- Gemini: `PANDA_AI_MODE=gemini`, `PANDA_GEMINI_API_KEY`, `PANDA_GEMINI_MODEL`.
- ElevenLabs: `PANDA_TTS_MODE=elevenlabs`, `PANDA_ELEVENLABS_API_KEY`, `PANDA_ELEVENLABS_VOICE_ID`, `PANDA_ELEVENLABS_MODEL_ID`.
- Recorded STT fallback uses that same ElevenLabs key; `PANDA_STT_MODEL` defaults to `scribe_v2`.

Native browser speech recognition is preferred when available. Otherwise MediaRecorder sends bounded audio to Panda's server for ElevenLabs transcription. The fallback stops after speech/silence or a maximum 30 seconds, and releases tracks/timers on stop/cancel. This is turn-based listening and speech, not full-duplex interruption handling or an ElevenLabs Agents session. Actual device/browser capture still needs a human test.

Run `npm run doctor` to see configured/missing field names without secret values. `npm run dev` runs the connected three-app product; standalone `npm run dev:ranveer` uses fixtures, so exercise peers are not available.

Doctor availability/booking remains deliberately pending. No appointment is booked, no availability is invented, and no new provider key is needed for the implemented flow.
