# Validation — November 7, 2026

Synthetic MVP verification; this is not clinical-product acceptance.

- `npm run check`: TypeScript across three apps and **93 tests, zero failures**. Includes medication confirmation, food/context persistence, patient separation, recovery, stale-step protection, owner-verified exercise feedback, post-exercise review, pain proposals and transcription boundaries. Additional checks cover clear/ambiguous spoken confirmations, automatic next-turn audio callbacks, cancellation during decoding and playback cleanup.
- `npm run build`: all three apps passed; Panda rebuilt after the final inline UI and expired-confirmation recovery change.
- `npm run test:integration`: **28 connected checks plus three standalone fixture checks passed**. Exercises the gateway, source/revision/idempotency rules and full check-in → report → review → permanent-memory flow.
- Browser: keyboard replaces Panda inline; bottom button becomes microphone; switching back restores Panda without a dialog. The synthetic medication → food → readiness → embedded exercise → simulated report → feelings → pain review completed at the same URL. Desktop text mode had no document overflow. Earlier compact-home QA covered 390×844, 320×568, 844×390 and 1366×768; the final keyboard layout has not been verified on a physical phone.
- Live Gemini: validated `read_plan` and `read_patient_context` responses using synthetic data.
- Live ElevenLabs: generated a real MP3, then transcribed the synthetic audio successfully using `scribe_v2`. No actual microphone recording or human playback observation is claimed.
- Mocked provider tests cover malformed output, extra arguments, rejection, timeout, cancellation and speech-body failures. Stop/abort release behavior includes a microphone stream arriving after cancellation.
- Memory survives repository reopening, scopes records by patient, and has no automatic expiry. Short-lived voice records retain their separate 24-hour policy.
- No new npm dependency. Existing lockfile used. Node 25.8.1/npm 11.11.0 locally; declared Node floor22.13 and CI Node24. GitHub-hosted CI has not been remotely observed.

Reproduce from repository root (stop servers on ports3000–3002 first):

```sh
npm ci
npm run check
npm run build
npm run test:integration
```

The integration runner uses isolated temporary storage. Provider tests spend provider credits and must use synthetic inputs. Credentials stay in root `.env.local`, never source or evidence files.

Still pending: doctor availability/booking, real pose inference, actual microphone/camera/phone/background tests, human audio playback, teammate acceptance, production sign-in/authorization/quotas/database/HTTPS, EHR/CRM integration, medical-reference grounding and clinician-reviewed medical-answer evaluations. No clinical correctness, real clinician delivery, emergency dispatch or HIPAA compliance is claimed.

See [check-in integration](docs/VOICE_CHECKIN.md) and [handoff](docs/RANVEER_HANDOFF.md).

Speech recognition fix: configured server transcription bypasses exposed native recognizers. Four regression checks verify selection, capture-to-transcription delivery, aborting delayed transcription and recorder-failure cleanup. Capture metering uses the already-unlocked conversation audio context.

Conversation redesign: warm wellbeing opening, genuine multi-turn generation, precise-versus-routine medication speech, interruptions, concern-first behavior, full transcript, cancellation and pending-action conversation are covered by regression tests. All three apps were rebuilt. Live synthetic multi-turn model/TTS verification and actual device checks are distinguished in the delivery notes.

Final browser QA with the updated Gemini configuration verified the wellbeing greeting, concise evening-atorvastatin question, and expandable chronological transcript. The full synthetic eight-response scenario passed at a paced rate; after the key update, seven rapid generated responses passed before an HTTP429 burst limit. A minimal updated-key request and the final browser turns also passed. Transient provider unavailability and quota failures stay explicit; successful mock tests are not substituted for live model acceptance. Actual microphone capture, barge-in and human voice-quality acceptance remain separate.

Voice recovery update: the current-call agenda now reconciles previously completed medicine reports, reviews food without inventing a new meal, and records a follow-up preference with booking pending. Regression cases reproduce an older pain concern, ambiguous symptom transcription, explicit requests to move on, polite questions, explicit call ending, and a model response omitting the next required question. New input-device lifecycle tests cover reuse, denial/retry and permission resolving after cancellation. The microphone is released when a model/action request fails.

Latency: end-of-utterance silence changed from1400ms to800ms, and active calls reuse one microphone stream. The configured Gemini Flash model now uses its supported minimal thinking mode. Three successful live synthetic responses took900–1590ms for model/server work in a small sample. The full updated live sequence was interrupted by Gemini HTTP429, so no end-to-end voice latency or completed live agenda is claimed for this revision. Earlier full live results above belong to the previous revision. Device capture, TTS, network and playback add to these model-only measurements. No automatic provider switch bypasses quota errors.
