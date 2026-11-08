# Panda conversation design and integration

This revision follows Ranveer's request for a more human conversation. It replaces the fixed-question check-in experience while preserving the owners' clinical/task/report APIs.

## Experience

Panda opens with wellbeing: “Hey Alex, how's your elbow feeling today?” The body part comes from the approved plan, and Panda identifies itself as an AI care companion rather than impersonating a doctor. The next response acknowledges what the patient said before asking one short question. The model chooses a permitted conversational move instead of reading a numbered script.

Questions and concerns interrupt the agenda. A question beginning with fillers such as “Uh, so tell me…” remains a question. It must not become a food report or be answered by dumping the whole plan. If a diagnosis or procedure is absent from the approved record, Panda says it is absent and asks what the doctor explained. It never infers a disease from atorvastatin or an elbow exercise.

New worsening pain takes immediate priority and pauses exercise. Routine questions resume when the patient wants to continue. Panda acknowledges the concern, suggests contacting the care team promptly, and can offer to record the patient's exact words for review. Recording still requires a separate confirmation and does not mean anyone was notified or acknowledged it. The app remains unmonitored; this is not a validated medical triage or diagnostic system.

Medication speech uses the name and broad daypart during routine checks: “Have you taken your evening atorvastatin?” Exact names, strengths, quantities and times remain in Care and in the visible action details. Dose/time questions receive precise approved details. Changes compared with the last seen prescription, multiple strengths of the same drug, and ambiguous labels retain precise details. A new plan does not silently overwrite the prior medication baseline.

Each new call reconciles medicines and reviews food, including earlier same-day reports. Completed medicines are confirmed verbally without a duplicate Care completion; unchanged food is a check-in review rather than a fabricated meal. Follow-up preferences are recorded explicitly as pending, never booked. An older open concern holds exercise, while the routine agenda continues when the patient asks to move on. Declining exercise keeps the conversation open. A later explicit request can open exercise. Food is acknowledged neutrally; the model is instructed not to praise or judge meals. Pending booking availability is mentioned when relevant instead of being recited between every question.

## Model and server responsibilities

The previous model adapter classified a single user message into a tool, while deterministic workflow strings supplied most replies. The current companion uses `conversation.ts`: each turn sends the latest patient utterance, up to 24 recent dialogue turns, approved plan/tasks, attributed patient reports, and a server-generated list of allowed next moves to Gemini (or the configured OpenAI alternative).

This is a continuing, stateful conversation reconstructed on each API call. It is not one perpetual model inference or an always-open Realtime/ElevenLabs Agents session. Speech capture, model generation and TTS remain alternating automatic turns. Interruption while Panda is speaking is not yet implemented.

The model generates a short reply plus a schema-validated move and optional verbatim food quote. Only server-provided moves are accepted; an invented task ID, appointment booking or action cannot execute. The server owns task selection, approved-plan/revision checks, proposal creation, explicit confirmations, retries and navigation. Care remains authoritative for tasks/help, and Rehab remains authoritative for exercise sessions/reports. A generated friendly sentence never changes a prescription.

Demo mode remains deterministic and is labelled `checkin_workflow`; configured provider failures do not silently become successful demo replies. Transient 502/503/504 generation failures get one bounded retry. Quota errors preserve context and show a patient-friendly busy message. No keys are sent to the browser or stored in conversation records.

## Additive contract changes

- `VoiceReply.speechText?` contains natural spoken wording when the visible proposal must retain exact action details.
- `VoiceReply.pauseExercise?` closes the camera workspace for a new discomfort concern while preserving the voice hook. An arriving owner report is retained without replacing the concern or restarting routine questions.
- `VoiceReply.confirmationPrompt?` identifies a direct invitation to confirm the pending action. After an intervening patient question, a bare yes/no cannot confirm it; an explicit “confirm” or the confirmation button remains available.
- Stages add `greeting`, `wellbeing_followup` and `followup`; optional agenda-version and per-call review flags migrate earlier sessions without deleting reports. `VoiceReply.conversationEnded?` stops automatic listening after an explicit goodbye, without completing unanswered topics. Existing clinical HTTP contract2.0.0 remains unchanged.
- Check-in continuation accepts optional `confirmationText` to retain the actual spoken response in the transcript.
- `GET /api/voice/memory` adds `transcript`, the latest100 chronologically ordered conversation turns. “My context” exposes an expandable transcript. Older persisted dialogue remains stored until deletion.
- Memory adds `checkin_review`, `wellbeing` and `medication_context`; the latter is a system-owned record of the last seen approved medication text, not a patient taking a medicine.

The new `voice_dialogue_turns` table is scoped by patient and saves both user and Panda turns, including check-in answers, confirmations and post-exercise review. Silent camera/session callbacks do not masquerade as spoken messages. The model receives bounded recent dialogue; remembered patient reports supply longer-lived context. Deleting Panda memory deletes this transcript too. Care and Rehab records are unchanged by that operation. The older short-lived `/voice/history` compatibility endpoint is not the full new transcript.

## Voice

One input stream is kept for an active call and released on stop, mode change, permission withdrawal or unmount. Each turn still stops recording during Panda speech. End-of-utterance silence is800ms instead of1400ms; Gemini Flash uses the supported minimal/zero thinking setting for short conversation turns, with low thinking for other Gemini3 models. These changes reduce avoidable delay but do not provide streaming or barge-in.

The UI reads `speechText` when present and automatically listens again after the response. There is no play/replay control. Exact action details remain available for review. ElevenLabs requests use calm delivery settings: moderate stability suitable for conversational delivery, no style exaggeration, normal speed where supported; v3/v4 omit unsupported speed/style controls. The configured voice/model is retained. Audio quality still needs human listening; synthetic audio generation alone is not proof that a voice sounds natural.

## Verification and limits

Regression cases cover warm opening, routine versus changed medicine detail, precise dose questions, filler-led interruptions, worsening pain, confirmation after an intervening question, persistent chronological transcript, reconciliation of completed topics, concern-to-agenda recovery, explicit call ending, cancellation rollback, model schema/quote validation, quota errors and temporary-outage retry. The live test uses fresh synthetic stores and verifies the multi-turn model flow independently of browser microphone capture.

The demo retains a fixed synthetic identity. Production authorization, clinical validation, medical-reference retrieval, doctor availability, real pose inference, real-device/audio tests and voice barge-in remain separate work.

Earlier revision verification:85 automated tests,27 connected integration checks and3 independent fixture checks passed. All three apps built. The updated Gemini configuration passed browser conversation turns; back-to-back API-only testing still reached a provider quota limit. The application preserves context and exposes a calm busy message rather than inventing a successful reply.

Current recovery revision verification:93 automated tests,28 connected integration checks and3 standalone checks passed; all apps built, with Panda rebuilt after the final recovery changes. Short live synthetic responses took900–1590ms before a Gemini quota response prevented completing the updated scenario. Full microphone-to-audio latency remains unmeasured on a physical device.
