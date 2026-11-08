# Exercise start, calibration and conversation repair

The supplied recording showed no running session: the selected left ankle was outside the frame, while the screen incorrectly asked the patient to hold a position. Panda was answering from the old elbow plan instead of the knee exercise on screen. A separate conversation-provider 429 then stopped voice mode.

The patient now has one start flow. **Set up & start** enables the camera and remembers the start request. The screen explains the first missing working-side joint and offers a visible leg switch. Only the joints used for the selected exercise are drawn, and low-confidence or off-screen points are excluded from that overlay. Both comfortable references must be captured before counting starts. A visible save-position button offers manual capture using a fresh, stable one-second observation window; it does not invent a reference or accept an invisible joint.

Automatic calibration uses the expected setup position, the provider's accepted high-confidence stable result, and an agreeing stable local observation window. It can accept that independently confirmed result without repeating three remote calls. Otherwise, three consistent remote checks remain available and tolerate a slow provider. A result inconsistent with the current visible angle is rejected. A stable polling timer survives fluctuating tracking validity; provider failures back off rather than repeatedly consuming quota.

Panda receives a bounded typed snapshot of the current exercise screen along with a patient utterance. This snapshot is client status, not canonical measurement evidence. Greetings and explicit start/pause/resume/finish commands use deterministic exercise guidance and control IDs; they do not consume conversation-model requests. The client applies each returned control once through the same session functions as the buttons. New discomfort and unresolved care concerns still take priority. Other questions use the existing conversation model with the actual exercise label, setup stage and attributed Rehab observations.

Setup guidance and validated Rehab Gemini cues use the existing interruptible voice player. Talking or a failed general chat reply cannot disable the exercise controls. A saved owner report reaches post-exercise review even when the conversational provider is unavailable. Camera counts still come from Yuvraj's canonical Gemini-analysis service, with unavailable intervals kept partial. Counts are shown as reps within the current set. Reaching the configured target saves the set automatically; manual finish retains accepted counts and the owner's completion classification.

The original 252-file Yuvraj source and branch archive remain unchanged. The camera repair is a separately maintained runtime adaptation in `packages/yuvraj-integration/camera-runtime.ts`; server adapters, contracts and the shared presentation hold the remaining integration changes. No deployment or hosted database migration is involved.

Verification includes regressions for slow calibration, locally confirmed references, missing ankles, deterministic spoken controls, idempotent retries, unfinished check-in preservation, and report review during conversation quota failure. Real physical movement accuracy and microphone echo still need device acceptance; synthetic pose tests establish application orchestration, not clinical validity.

## Verification on this repair

- `npm run check`: 194 tests pass, including the untouched-source archive guard and all app/server type checks.
- All three apps build; 36 connected HTTP checks and three standalone checks pass.
- The isolated browser flow passed automatic calibration, explicit spoken start, spoken pause/resume/finish, a manually finished two-repetition set, and a complete ten-repetition set that saved automatically. The general conversation provider deliberately returned 429 during these tests. The fixture camera, provider output and speech playback were synthetic; all records were isolated from the real local patient stores.
- A separate live synthetic-landmark check passed the actual Rehab Gemini → verified Panda feedback/memory → ElevenLabs audio stream. It counted one supplied sample movement; first audio arrived 436 ms after the speech request. No real camera/microphone or patient record was used.
- A local-only pose inspection of the supplied recording identified the selected left ankle outside the image. That recording frame was not sent to an external AI provider.
