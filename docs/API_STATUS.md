# Implemented versus pending

| Capability | Starter status | Owner's next work |
| --- | --- | --- |
| Three app build/run, base paths and gateway | Implemented; integration tested | R: deployment URLs/HTTPS and actual phone verification |
| FHIR CarePlan import, evidence-backed AI draft, clinician edits and approval | Implemented for synthetic HAPI data; demo clinician only | A: real SMART authorization, sync history/retries and broader resource mapping |
| Checklist confirmation / help / acknowledgements | Implemented; revision/idempotency checks | A: verified identities, organization/patient access, patient-safe responses |
| Voice tool proposal/confirmation and sourced-plan output | Implemented; demo rules tested | R: live provider/audio tests, prompt evaluation, latency and better turn-taking |
| Gemini/OpenAI model adapters | Configurable server code, not tested with real keys | R: select account-available model and record actual successful call |
| ElevenLabs speech | Configurable TTS endpoint/UI, not tested with real keys | R: live audio test, controls/error UI; full-duplex Agents optional |
| Browser microphone/read-aloud | Implemented browser feature detection and consent | R: actual phone/browser tests; browser STT availability varies |
| Camera preview / cleanup | Implemented | Y: actual permission/device/background checks |
| Pose inference / calibration / measured reps | NOT implemented | Y: core physical-AI milestone; pinned model/assets and confidence tests |
| Session persistence / report fetch / acknowledgement | Implemented, integration tested with explicit simulated evidence | Y: real measurements; A: clinician report workflow polish |
| Auth / patient isolation / production DB | Not implemented; Care data is stored in local JSON for this prototype | R: identity setup; A: connect an approved shared database after schema coordination |
| Server jobs/reminders/calls | NOT implemented | R, after MVP |
| Appointments, caregiver, PWA | NOT implemented | A, after MVP |
| Wearables | NOT implemented | Y, after MVP |

No paid calls, emergency notifications, real clinician delivery, clinical correctness, HIPAA compliance or app-store release were validated by this starter. No camera-derived progress is fabricated. Use synthetic data only until the appropriate access and deployment work is complete.
