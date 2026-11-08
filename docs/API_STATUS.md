# Implemented versus pending

| Capability | Starter status | Owner's next work |
| --- | --- | --- |
| Three app build/run, base paths and gateway | Implemented; integration tested | R: deployment URLs/HTTPS and actual phone verification |
| Text/.txt import, source lines, draft approval, current plan version | Implemented with demo clinician | A: editable reviewed structured drafts, retained version history, PDF/OCR |
| Checklist confirmation / help / acknowledgements | Implemented; revision/idempotency checks | A: verified identities, organization/patient access, patient-safe responses |
| Voice tool proposal/confirmation and sourced-plan output | Implemented; demo rules and live Gemini tested | R: physical microphone/playback tests, prompt evaluation, latency and better turn-taking |
| Gemini/OpenAI model adapters | Gemini live tested with synthetic plan/memory; OpenAI boundary tested with mocks | R: select account-available model and record actual successful call |
| ElevenLabs speech | TTS and scribe_v2 STT passed live synthetic-audio API tests | R: live audio test, controls/error UI; full-duplex Agents optional |
| Browser microphone/read-aloud | Native recognition plus recorded STT fallback, inline mode switching and cleanup | R: actual phone/browser tests; browser STT availability varies |
| Camera preview / cleanup | Implemented | Y: actual permission/device/background checks |
| Pose inference / calibration / measured reps | NOT implemented | Y: core physical-AI milestone; pinned model/assets and confidence tests |
| Session persistence / report fetch / acknowledgement | Implemented, integration tested with explicit simulated evidence | Y: real measurements; A: clinician report workflow polish |
| Auth / patient isolation / production DB | Patient-scoped local repositories tested; fixed demo identity, no production auth/DB | R: identity setup; every owner: domain authorization and repository migration |
| CRM/EHR, server jobs/reminders/calls | NOT implemented | R, after MVP |
| Appointments, caregiver, PWA | NOT implemented | A, after MVP |
| Wearables | NOT implemented | Y, after MVP |

Paid Gemini/ElevenLabs calls were tested using synthetic data. No emergency notifications, real clinician delivery, clinical correctness, HIPAA compliance or app-store release were validated by this starter. No camera-derived progress is fabricated. Use synthetic data only until the appropriate access and deployment work is complete.

Persistent patient context and guided check-in/exercise callbacks are implemented. Doctor availability/booking and medical-reference retrieval remain pending. See [VOICE_CHECKIN.md](VOICE_CHECKIN.md).
