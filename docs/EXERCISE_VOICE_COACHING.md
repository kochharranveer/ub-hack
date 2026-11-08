# Exercise voice coaching

Panda stays inside `/exercise` while receiving feedback from Yuvraj's camera module. The existing Gemini analysis/calibration request now includes Panda's spoken-coaching style: one short, supported next step, plain language, no invented targets or treatment. The original measurement prompts and response schema are retained. Panda's server fetches the canonical analysis/cue by ID, verifies its patient, captured plan, session revision and freshness, then sends the validated wording through the existing ElevenLabs streaming path. It also retains the sourced observation in patient memory for subsequent conversation and post-exercise review.

There is no additional Panda model request to rewrite every pose update. Patient questions continue through Panda's normal conversational model; the latest attributed exercise observations are included in that context. Repeated cue IDs cannot create duplicate observations. Repeated wording is suppressed for 20 seconds, and separate spoken cues are spaced by at least six seconds. Only the newest live analysis is retained while the patient is speaking; session-start and report-save events remain durable.

Tap Panda's mic to enable exercise voice coaching once. This opens the existing microphone/audio flow without restarting the normal check-in agenda. A voice conversation already active on home continues into exercise. Text mode remains available. Patient speech and transcription take priority over coaching. The current cue and late cue responses are cancelled on pause, finish, camera loss or an analysis failure; a report review takes precedence over movement cues. Opening the screen alone does not silently activate the microphone.

Failed feedback delivery and analysis use bounded backoff. Frames waiting on a slow provider are bounded; any dropped or failed measurements make the report partial. A quota failure never becomes a fabricated successful analysis. Gemini 429 is surfaced with `EXERCISE_AI_RATE_LIMITED`. Provider failures leave the validated text/progress available; no provider or model is silently switched.

## Credentials and the supplied notes

`PANDA_GEMINI_API_KEY` remains Panda's conversation key. `REHAB_GEMINI_API_KEY` optionally supplies a separate Rehab project's credential only on Rehab provider requests. It does not overwrite the process-wide Panda key. If absent, the existing shared-key setup is retained. `REHAB_GEMINI_MODEL` is optional and otherwise uses the existing configured model through the runtime environment adapter. Models were not changed to the model names mentioned in the supplied `rehab.md`; that document describes settings that were not present in the checked-out implementation.

Google's [rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits) states that limits are per project, not per API key. Two keys in one project do not add capacity. Existing analysis calls are single-flight per session; this change adds no second model round trip for their spoken wording.

Yuvraj's original source under `references/yuvraj/` remains byte-for-byte unchanged. The prompt and credential composition live in Panda's integration adapter. The user-provided Desktop `rehab.md` remains unchanged.

## Verification

The root check passes 184 tests, including the new cadence, coalescing, optional credential, quota-failure and single-request prompt-composition tests. The full app build, connected-app integration and canonical Yuvraj-feedback HTTP flow are checked separately.

Live checks use synthetic pose landmarks and isolated stores, never the user's camera, microphone or real patient data. The new dedicated Rehab credential passed live analysis and the Panda bridge, including a persisted observation in Panda memory. Panda's separate conversation key also passed a live synthetic greeting. Earlier ElevenLabs attempts were rejected for insufficient credits and then an account-level free-tier restriction (HTTP 401). After the user supplied an updated key, live ElevenLabs streaming passed. The complete live Gemini analysis → canonical Panda feedback/memory → ElevenLabs PCM stream also passed on synthetic pose data: Gemini produced ‘Nice work finishing that rep.’, and the first audio chunk arrived 344 ms after the speech request. The running app was restarted with the updated settings. No real camera/microphone or real patient records were used, and no provider restriction was bypassed or device voice silently substituted. Physical-device microphone/echo and movement accuracy still require separate acceptance.
