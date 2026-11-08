# Circular companion and guided exercise integration

## Source and scope

Imported Yuvraj's guided camera/exercise implementation from [yuvrajdrums/ub-hack](https://github.com/yuvrajdrums/ub-hack/tree/165d7b74fe67e972389e59dd981ef984ebccacbb), commit `165d7b74fe67e972389e59dd981ef984ebccacbb` (main, rep-counting fix). Imported the exercise engine, camera pipeline, feedback service, versioned contract, pinned assets and regression tests. His alternative hosting/Cloudflare configurations and unrelated root changes were excluded. Existing Supabase/Render preparation remains intact. No deployment or EHR changes were performed.

`packages/rehab-bridge/GuidedWorkspace.tsx` is shared by `/rehab` and the embedded Panda exercise workspace. The camera/features and canonical session/report service remain owned by Rehab. Four synthetic exercise demonstrations are available: knee extension, knee flexion/extension, straight leg raise and patient-confirmed static quads. The working leg, calibration, tracking gaps, hold/return criteria and simulated traces use Yuvraj's evaluator.

The configurations remain **synthetic demonstration references**, not approved exercise prescriptions. A server-captured Care reference binds a result to the patient's plan context; it does not authorize a particular demonstration or claim clinical validation. Mapping reviewed structured exercise prescriptions is still needed before clinical use.

## Connected boundaries

- `/rehab/api/cv/v1/context` returns `connected_demo` or `authenticated` and a patient-specific browser recovery scope. Standalone operation retains its signed demo identity and CSRF checks.
- `POST /rehab/api/cv/v1/sessions` captures the current approved Care plan reference on the server. Production writes require the patient role; data uses the current authenticated patient scope and forced database row policies.
- `guided_session_started`, `guided_feedback` and `guided_report_saved` are additive events in `RehabBridgeEvent`. The client sends IDs, not trusted report/cue text. Panda fetches and validates the canonical session/feedback from Rehab, checks the captured patient and plan version, and deduplicates memory events.
- Feedback must belong to the active running session/control revision and remain unexpired. Speech is queued while the patient speaks/transcribes or Panda is answering. Saved reports prompt the post-exercise review without replacing a pending care concern. A discomfort stop holds further exercise.
- Patient memory attributes the report to Rehab and retains its evidence plus canonical session reference. Camera estimates, simulations and patient confirmations remain distinct.
- Care reads canonical reports via `/care/api/guided-reports`; existing acknowledgement accepts the canonical session ID. No second editable exercise report store was created.

## Voice and interface

The new Panda home follows the supplied slate/taupe reference: a rounded blurred card, small daily actions, inline typing and a circular visualizer. The SVG contour samples a Web Audio playback analyser or captured microphone level. Quiet states breathe gently; reduced-motion settings disable animation. Voice activation/typing remains on the same route. The home has no document scrolling at tested sizes 320×568, 390×667, 390×844, 430×932 and 1440×900. Exercise and long history panels can scroll independently.

ElevenLabs TTS streams bounded 24kHz signed 16-bit mono PCM through `/api/voice/speak` when requested with `Accept: audio/pcm`. Existing MP3 clients remain supported. Playback begins before EOF. Stop cancels the upstream reader and queued audio nodes. AudioWorklet capture preserves the start of utterances, ends after a 650ms pause, and supports sustained speech interruption when echo cancellation is reported. Other browsers retain recording/native fallbacks and tap-to-interrupt. No play-audio button is required. Per-utterance model calls receive retained patient context; this is not an always-open realtime model session.

No new keys are required. Existing Panda Gemini/ElevenLabs settings are reused. Optional Rehab Gemini phrasing stays off unless separately configured; deterministic exercise cues work without it.

## Storage and release

The local migration `supabase/migrations/20261108060015_guided_rehab_storage.sql` creates the patient-scoped `rehab.cv_state` store and a release marker. It was tested in the isolated Postgres-compatible test database, **not applied to hosted Supabase**. Production health requires the marker and fails closed until the migration is applied as part of the future deployment. The existing Render plan was not approved or applied.

## Verification on this revision

- `npm run check`: 162 tests, including imported evaluator tests and new streaming, interruption, owner-report integration and authenticated patient-isolation regressions.
- `npm run build`: all three apps.
- `npm run test:integration`: 32 connected checks plus three standalone app checks. Includes real HTTP calls through the gateway for the guided owner API, verified feedback, Panda review, Care report retrieval and acknowledgement.
- `npm run test:browser`: isolated Chrome with fake media devices and synthetic PCM. Checks the full agenda, embedded patient-confirmed hold, saved result, post-exercise review, no-scroll responsive home, inline typing, voice playback, circular visualizer and tap interruption.
- One live fictional ElevenLabs greeting returned PCM: first chunk 542ms, complete response 619ms, 258578 bytes. This is a single provider/network measurement, not full microphone-to-response latency or a guarantee.

Human listening, real microphone echo/interruption on phones and physical camera/rep-counting acceptance remain pending. Browser tests do not substitute for those checks. Doctor availability/booking and EHR are still pending as requested.
