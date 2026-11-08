# Validation — November 7, 2026

Synthetic MVP verification; this is not clinical-product acceptance.

- `npm run check`: TypeScript across three apps and **58 tests, zero failures**. Includes medication confirmation, food/context persistence, patient separation, recovery, stale-step protection, owner-verified exercise feedback, post-exercise review, pain proposals and transcription boundaries.
- `npm run build`: all three apps passed; Panda rebuilt after the final inline UI and expired-confirmation recovery change.
- `npm run test:integration`: **27 connected checks plus three standalone fixture checks passed**. Exercises the gateway, source/revision/idempotency rules and full check-in → report → review → permanent-memory flow.
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
