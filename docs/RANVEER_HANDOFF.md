# Ranveer implementation and integration handoff

Current conversational model/flow and new fields are documented in [CONVERSATION_DESIGN.md](CONVERSATION_DESIGN.md).

Branch `ranveer/voice`, based on `ce405fd027e6d8b1d872d00501353c1c21a2a456`. Shared wire contract2.0.0 is preserved with additive Panda APIs and bridge1.0.0. This AI-assisted synthetic MVP now includes persistent patient context and continuous voice in the guided exercise flow, following Ranveer's expanded request.

## Implemented

- Compact home actionables: approved medicines, exercise, follow-up pending. Panda in the middle; voice operates inline. Keyboard replaces Panda with a text box and becomes a microphone button.
- Guided medications → food → scheduling-pending → exercise-readiness → exercise feedback → feelings → pain check. A separate button/spoken confirmation gates Care task/help writes.
- Patient-scoped persistent SQLite memory, separate from short-lived conversation records. Provider can retrieve remembered quotes with source context.
- Gemini and optional OpenAI routing with exactly five allowlisted tools: `read_plan`, `read_patient_context`, `confirm_task`, `request_help`, `open_exercise`. Fixed workflow replies are truthfully labelled `checkin_workflow`.
- Native speech recognition and ElevenLabs recorded-audio fallback; ElevenLabs TTS and browser read-aloud. Panda speaks automatically, listens again after each reply (including proposals and completed check-ins), and waits through silence. No play/replay button is shown. The initial tap unlocks the audio context; Stop/mode switch/page hide/navigation release resources. This is turn-based, not full-duplex.
- Durable proposals and explicit confirmations, stable downstream request IDs, stale revision/plan checks, lost-response recovery, cancellation and bounded short-term history.
- Shared Rehab client component plus typed callbacks, owner-verified sessions/reports and retryable feedback queue. Care and Rehab remain authoritative for their own domain data.
- Twelve fictional patient snapshots; default Alex is the only active demo identity. No patient switcher pretends to provide authorization.

Read [VOICE_CHECKIN.md](VOICE_CHECKIN.md) for exact new routes, payloads, bridge events, retention, ownership and teammate integration instructions. Read [VALIDATION.md](../VALIDATION.md) for completed checks and limitations.

## Run

Use Node22.13+ (Node24 selected by .nvmrc/CI). From root:

```sh
npm ci
npm run doctor
npm run dev
```

Open http://localhost:3000. Do not overwrite an existing `.env.local`. The root runner loads it; keys remain server-side. `npm run dev:ranveer` starts only Panda in explicit fixture mode: clinical actions are dry runs and exercise peers are absent.

For a persistent local volume set absolute `PANDA_DATA_DIR` or `PANDA_VOICE_DATABASE`. Panda stores `voice.sqlite` and `patient-memory.sqlite`; Care/Rehab retain their own local JSON stores. Local persistence is not a production multi-replica design.

## Stable write boundary

`POST /api/voice/turn` accepts `{requestId,text}` and returns a proposal ID for writes. `POST /api/voice/confirm` accepts `{proposalId}`; only then does Panda send Care `/help` with `{requestId:proposalId,quote}` or `/tasks/:id/confirm` with `{requestId:proposalId,expectedRevision,evidence:'patient_reported'}`. Care acknowledgement is separate. `/voice/cancel` dismisses only unsubmitted proposals.

All JSON uses `{ok:true,data}` or `{ok:false,error:{code,message}}`. Reuse the same request ID and exact payload after uncertain responses. An unconfirmed proposal expires after five minutes. A confirmation accepted inside that window can retry afterward while its record exists and the same approved plan remains current. Successful results replay. A stopped browser request cannot undo an accepted Care write.

Voice turns/proposals/receipts have a 24-hour policy,50-turn history and1,000-receipt cap. `npm run voice:purge` supports idle-store maintenance. Patient context has no automatic expiry and a distinct explicit-delete API. It must not be pruned with the short-lived voice database.

The Care help endpoint currently lacks an atomic conditional plan-version argument. Panda rechecks the plan, but closing that inter-service race requires an agreed Care API extension.

## Live evidence and remaining work

85 automated tests, all three builds,27 connected integration checks and3 standalone checks passed. Gemini routing/memory retrieval and ElevenLabs TTS/STT passed real API checks using synthetic data. Human playback and actual microphone/camera/phone tests are still needed.

Doctor availability and booking remain pending by request. Real pose inference/calibration/rep counting stays with Yuvraj; the existing simulated report is visibly synthetic. Asmita retains clinical plan approval, tasks/help/acknowledgement and future booking ownership. Review the shared Rehab extraction together before merging teammates' camera work.

There is no production login/authorization, medical-reference retrieval, validated clinical question answering, EHR/CRM adapter, outbound calling, production scheduler or managed database. Repository patient scoping is implemented/tested, but real identity must come from a verified server session, never a browser patient ID. No further keys are needed for the current check-in. Next connected service is the doctor's availability/booking API when chosen.

For medical Q&A, a proposed future approach is approved-plan grounding plus licensed/approved references, source links and clinician-reviewed evaluation. August Health EHR integration and August AI are different services; neither is connected. Do not infer clinical reliability from a chatbot benchmark.

## Official references checked

- [Gemini function calling](https://ai.google.dev/gemini-api/docs/generate-content/function-calling)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [ElevenLabs TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) and [STT](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [Node22.13 SQLite](https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html)
- Installed Next.js documentation under `node_modules/next/dist/docs/`.
