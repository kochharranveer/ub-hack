# Ranveer implementation and integration handoff

Delivered November 7, 2026, on top of `ce405fd027e6d8b1d872d00501353c1c21a2a456`.
Branch: `ranveer/voice`. Shared wire contract remains 2.0.0.
This is a synthetic MVP implementation, with live provider and physical device acceptance still pending.

## What is implemented

- Phone-first companion matching Ranveer's supplied wireframes: greeting, today's authoritative tasks, large Panda talk control, top Emergency/Care team controls, bottom My Plan/keyboard navigation.
- Keyboard chat, a persisted conversation, sourced approved-plan replies, task self-report proposals and help proposals.
- Explicit listening/thinking/confirmation/saving/audio preparation/speaking states; stop controls; microphone consent; denied/unsupported microphone messages.
- Browser read-aloud and optional ElevenLabs speech, explicit clicks and separate ElevenLabs text-sharing consent. Only one audio source plays. Audio, recognition and browser requests stop on navigation, page hide, consent withdrawal or Stop; object URLs are released.
- Gemini and optional OpenAI intent adapters with allowlisted schemas. Malformed responses, extra tool arguments, unknown tools, timeouts and provider rejection fail explicitly.
- Five-minute proposals; durable explicit confirmation; stable downstream request IDs; task revision protection via Care; current approved-plan checks before execution.
- Voice-owned SQLite sessions, turns, proposals and receipts. History reflects confirmed/dismissed results rather than reopening completed proposals.
- Same-origin Care/Rehab gateway, independent fixture operation, environment example, secret/data ignores, root CI and integration checks.
- Live provider smoke-test and voice retention maintenance commands.

Emergency opens information only. Care team prepares an editable request. Neither control claims an emergency call or live clinician connection. The exercise action links to `/rehab` and unloads voice; it does not provide continuous voice during camera use.

## Start

Use Node 22.13 or newer; `.nvmrc` and CI select Node 24. Actual local verification used Node 25.8.1 and npm 11.11.0. No new npm dependency was added.

```sh
npm ci
cp .env.example .env.local
npm run dev:ranveer
```

Open http://localhost:3000. This is fixture mode: confirmations are labelled dry runs and do not write Care records.
Stop it, then run `npm run dev` for all three apps with connected HTTP through port 3000.
Leave `PANDA_INTEGRATION` unset in root `.env.local` so the runner chooses the appropriate mode.
Do not overwrite an existing environment file containing your configuration.

The root runner loads `.env.local` for each app. Set an absolute `PANDA_DATA_DIR` or `PANDA_VOICE_DATABASE` for a persistent service volume. With neither set, each app stores data under its own working directory; Panda uses `apps/panda/.data/voice.sqlite`.

## Live provider acceptance

Choose Gemini, or OpenAI as an alternative. Configure only server-side values from `.env.example`:

- Gemini: `PANDA_AI_MODE=gemini`, `PANDA_GEMINI_API_KEY`, `PANDA_GEMINI_MODEL`.
- OpenAI: `PANDA_AI_MODE=openai`, `PANDA_OPENAI_API_KEY`, `PANDA_OPENAI_MODEL`.
- ElevenLabs: `PANDA_TTS_MODE=elevenlabs`, `PANDA_ELEVENLABS_API_KEY`, `PANDA_ELEVENLABS_VOICE_ID`, `PANDA_ELEVENLABS_MODEL_ID`.

Select a model available in your account. No model ID or paid account access is assumed.
Never add keys to browser environment variables, URLs, source control or chat.

```sh
npm run test:providers:live
```

This command makes an actual provider call and spends provider credits. It sends synthetic fixture content only, requires a validated `read_plan` result, optionally saves actual speech to `work/elevenlabs-smoke.mp3`, and writes `work/provider-evidence.json`. Listen to the saved audio separately. No live call was made in this delivery: credentials were absent, and the command correctly stopped at configuration validation.

## Stable HTTP handoff

Every JSON response keeps the existing envelope: `{ok:true,data:T}` or `{ok:false,error:{code,message}}`.

Existing public routes remain:

- `GET /api/context`: approved plan, tasks, help, integration mode and TTS engine.
- `POST /api/voice/turn`: `{requestId,text}`; sourced reply, proposal, or navigation.
- `POST /api/voice/confirm`: `{proposalId}`; execute the stored action or replay its result.
- `POST /api/voice/speak`: `{text}`; MP3 on success, JSON error otherwise.

Additive Panda-only routes/fields for teammate review:

- `GET /api/voice/history`: up to 50 `{requestId,text,reply,at}` records, with resolved proposal results.
- `POST /api/voice/cancel`: `{proposalId}`; dismiss an unconfirmed proposal. A submitted, unresolved confirmation cannot be dismissed as though it never happened; retry it or check Care.
- Context additionally includes `aiEngine`, `aiConfigured` and `ttsConfigured`. Configured does not mean live tested. Actual reply engine is stored with the proposal and preserved on retries.

Example connected help flow using the unchanged v2 shapes:

```http
POST /api/voice/turn
Content-Type: application/json

{"requestId":"d1e0b4a1-22cf-4270-b391-823cc578425d","text":"Please help me contact my care team"}
```

The returned `data` contains `mode:"connected"`, the actual routing `engine`, a review `message`, and a server-issued `proposalId`. No Care write has happened.

```http
POST /api/voice/confirm
Content-Type: application/json

{"proposalId":"<use the exact UUID returned above>"}
```

Panda sends Care:

```http
POST /care/api/help
Content-Type: application/json

{"requestId":"<that same proposal UUID>","quote":"Please help me contact my care team"}
```

Success is reported as “Request recorded. A clinician has not acknowledged it yet.”
Care acknowledgement is a separate operation owned by Asmita.

For completion, Panda reads the task ID/revision from Care, proposes it, and after confirmation sends:

```http
POST /care/api/tasks/<URL-encoded authoritative task ID>/confirm
Content-Type: application/json

{"requestId":"<proposal UUID>","expectedRevision":0,"evidence":"patient_reported"}
```

The revision is captured from the current task, not assumed to be zero. Care enforces its own revision and idempotency rules. Retry the exact same request ID and payload after an uncertain response.

Rehab navigation is always `/rehab` via an ordinary anchor. Panda creates no exercise session or report and writes no Rehab table.

## Persistence, expiry and recovery

Panda's repository interface is separate from Care/Rehab. Local tables are `voice_sessions`, `voice_turns`, `voice_proposals`, `voice_receipts`. One fixed synthetic session is intentional; it is not a signed-in patient session.

SQLite transactions persist a turn, receipt and proposal together. Explicit confirmation is durably recorded before the Care HTTP call. If Care saves an action but its response is lost, retrying the same proposal recovers through Care's existing idempotency mechanism. Concurrent calls in one process serialize; a busy second process fails with a retryable error.

An unconfirmed proposal expires after five minutes. A confirmation accepted inside that window can retry delivery afterward, within the retained record's lifetime, only while the same approved plan remains current. Successful results remain replayable. A changed plan blocks unresolved actions. Dismissing a proposal cannot undo an action already submitted.

History is limited to 50 turns, receipts/proposals to 24 hours, and new receipts to 1,000 within the retained window. At capacity, new turns fail instead of silently evicting valid retries. Expired records are logically deleted on repository access. Run `npm run voice:purge` for idle-store maintenance; a strict wall-clock retention policy requires scheduling that command on the service host. Disk/backup erasure is not provided.

The prior `voice.json` is left untouched and is not automatically imported. No existing runtime voice data was found in the supplied Desktop checkout. Care and Rehab retain their existing JSON stores.

The local database needs a persistent filesystem and a Node runtime. This change does not implement the proposed PostgreSQL `voice.*` production schema or a multi-replica deployment.

## Boundary details to review together

- No changes to Care/Rehab app source, domain schemas, or shared UI tokens.
- Panda stores/sends the user's exact help text. Care's existing input schema trims outer whitespace; Panda retains the original text in its own conversation record.
- Panda rechecks the approved plan before a write. Care's existing help API does not accept an atomic conditional plan-version argument; closing that inter-service race requires a jointly reviewed API extension.
- Browser stop cannot undo an accepted remote mutation. The UI says a stopped confirmation may already be recorded and retains the same proposal for retry.
- A received exercise report still belongs to Yuvraj. Saved reports do not imply clinician acknowledgement or task completion.
- My Plan navigates to Asmita's Care app. The calendar, clinician workspace and camera screen in the reference remain with their respective owners.

## Acceptance and remaining responsibilities

Verified here:

- 41 automated tests: all passed, including provider boundaries, lost-response recovery, expiry, mode changes, concurrent retries, cancellation, transaction rollback and retention.
- Care/Rehab/Panda production builds: all passed; Panda rebuilt after its final implementation changes.
- 19 connected integration checks plus all three standalone fixture checks: passed.
- Browser: sourced plan read, keyboard entry, explicit confirmation, truthful fixture result, persisted history reload, Emergency dialog, and 390-pixel layout without horizontal overflow.
- Secrets/runtime files ignored; source patch checked for whitespace errors.

Still required before claiming demo acceptance:

- [ ] Real Gemini/chosen provider call with the team's credentials.
- [ ] Real ElevenLabs audio and human playback observation if claiming that track.
- [ ] Physical phone and desktop microphone, denial, stop, background, navigation and playback checks.
- [ ] Teammate review of the additive Panda endpoints/context fields and Node requirement.
- [ ] The full real-camera demo with Yuvraj's pose inference and Asmita's clinician acknowledgement.

Later Ranveer responsibilities, after that core loop:

- Verified shared identity/session helpers; each owner implements authorization in their APIs.
- Production `voice.*` database migration, patient isolation, quotas/origin protection, deployment/HTTPS and operational retention.
- One SMART/FHIR sandbox adapter, OAuth/mappings/sync/error UI; imports go to Asmita's draft API and exports read Yuvraj's reports.
- Notification consent/preferences, server scheduler, provider calls, retries/webhooks and truthful delivery statuses.
- A versioned, jointly reviewed voice/camera bridge if continuous speech during exercise is pursued.

Do not claim those later capabilities are implemented. No healthcare service, emergency dispatcher or real patient account is connected.

## Official references checked

- [Gemini function calling](https://ai.google.dev/gemini-api/docs/generate-content/function-calling)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [ElevenLabs speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [Node 22.13 SQLite API](https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html)
- Installed Next.js documentation in `node_modules/next/dist/docs/`.

Existing baseline and this implementation are AI-assisted. Preserve the team's event/build disclosure.

## Actionables and generated patient data update

Today now groups medicines, exercise and check-in requests. The shared seed has 12 fictional patient records, with Alex as the single active default identity. See [dataset documentation](SYNTHETIC_PATIENTS.md) for regeneration, contract compatibility and runtime-store behavior. Context also adds an optional synthetic patient profile for the greeting.
