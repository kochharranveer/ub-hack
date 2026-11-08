# Build and data disclosure — fill before submission

- Baseline: this v0.2 AI-assisted starter replaces earlier single-app planning scaffolding. Verify/document which work falls within the organizer's eligible period.
- Public dependencies: Next.js/React/Zod; list the exact pose model/assets and licence after Yuvraj adds them.
- Synthetic data: 12 fictional patient snapshots, one active default identity, demonstration plan, fixed demo clinician identity.
- Simulation: explicit simulated exercise reports are for integration testing. Camera preview currently performs no model inference.
- AI routing: demo rules by default. Gemini plan/memory calls passed live synthetic tests; OpenAI has mocked boundary tests. Disclose the provider/model actually used.
- Speech: browser services by default; ElevenLabs TTS/STT passed live synthetic-audio tests and is not a full-duplex agent. Disclose actual provider/voice/model used.
- Real team additions: Ranveer [commit IDs]; Asmita [commit IDs]; Yuvraj [commit IDs]. Fill with actual work, not projected features.
- Validation: see `VALIDATION.md` for checks actually run. Record real phone/browser/model observations separately.
- Clinical limits: no validated clinical decision support, real provider delivery or emergency dispatch. Demonstration measurements are not evidence of treatment efficacy.

Ranveer implementation update (November 7, 2026): AI-assisted voice UI, SQLite repository, provider boundaries, tests and CI were added on branch ranveer/voice. See RANVEER_HANDOFF.md and the updated VALIDATION.md for actual evidence. Physical device and human playback tests remain pending; the source patch records the exact commit.

Synthetic-data update: 12 fictional patient records were generated for UI/testing, with one active default identity (Alex). Medication examples and schedules are synthetic sample data, not patient-specific advice. No existing clinical store was overwritten.

Expanded request: patient memory, deterministic guided check-ins, typed exercise callbacks, owner report verification, inline voice/text controls and recorded STT fallback were implemented with AI assistance. No August/medical-reference retrieval or clinically validated free-form advice is connected.

Conversation redesign: AI-assisted contextual dialogue generation, allowed conversational moves, durable full transcripts, concise routine medication speech, pending-action interruptions and exercise pause signaling were added. Shared clinical/report mutation contracts remain unchanged. Live model checks used fresh synthetic stores; real voice-quality acceptance is pending human listening.
