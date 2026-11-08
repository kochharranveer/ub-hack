# Implemented versus pending

The current source includes the connected Panda, Care and Rehab apps, patient memory and a reviewed-plan check-in agenda. Model replies retain recent dialogue and patient context, start with wellbeing, use concise routine medicine wording, and preserve exact details for changed prescriptions and explicit dose questions. Actions remain server-validated proposals until confirmed.

Panda now uses streaming ElevenLabs speech, automatic listening, echo-cancelled speech interruption where supported, and a circular audio-reactive visualizer. Voice and typing share the home page; the home fits without scrolling at the tested phone sizes. Physical phone audio acceptance remains pending.

Yuvraj's guided exercise implementation is integrated: local pose inference, Lite/Full/Heavy selection, automatic Gemini calibration and Gemini-estimated live repetitions, deterministic simulated traces, patient-confirmed static holds, ordered events and saved reports. Panda receives verified owner feedback, stores attributed context and asks about post-exercise feelings/discomfort. Care reads and acknowledges those canonical reports. Exercise configurations are synthetic demonstrations; approved prescription mapping and clinical validation remain pending.

Supabase authentication, patient/clinician access checks, patient-scoped Postgres stores, provider limits and production health checks are implemented. The new guided exercise storage migration is prepared and locally tested; it has not been applied to hosted Supabase. Render remains an unapproved deployment plan because deployment is deferred.

Still pending:

- Real phone microphone/playback, interruption/echo and physical camera acceptance.
- Reviewed structured exercise prescription mapping and clinical content validation.
- Doctor availability/booking adapter; preference capture remains explicitly pending.
- EHR integration (Asmita), medical-reference retrieval and clinician delivery workflows.
- Production invitation/email configuration, operational monitoring and release acceptance before deployment.
- Scheduled reminders/calls, wearables, caregiver and PWA features.

The latest integration preserves Yuvraj’s complete source unchanged; see [YUVRAJ_LATEST_INTEGRATION.md](YUVRAJ_LATEST_INTEGRATION.md).

See [GUIDED_VOICE_INTEGRATION.md](GUIDED_VOICE_INTEGRATION.md) for source provenance, contracts and current verification. See [CONVERSATION_DESIGN.md](CONVERSATION_DESIGN.md) for the stateful dialogue boundary. No emergency notification or clinical correctness claims are made by this implementation.
