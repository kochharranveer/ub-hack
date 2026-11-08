# Build and data disclosure — fill before submission

- Baseline: this v0.2 AI-assisted starter replaces earlier single-app planning scaffolding. Verify/document which work falls within the organizer's eligible period.
- Public dependencies: Next.js/React/Zod; list the exact pose model/assets and licence after Yuvraj adds them.
- Synthetic data: one fictional patient, demonstration plan, fixed demo clinician identity.
- Simulation: explicit simulated exercise reports are for integration testing. Camera preview currently performs no model inference.
- AI routing: demo rules by default. Gemini/OpenAI adapters need actual account credentials and live verification; disclose the provider/model actually used.
- Speech: browser services by default; optional ElevenLabs TTS is not a full-duplex agent. Disclose actual provider/voice/model used.
- Real team additions: Ranveer [commit IDs]; Asmita [commit IDs]; Yuvraj [commit IDs]. Fill with actual work, not projected features.
- Validation: see `VALIDATION.md` for checks actually run. Record real phone/browser/model observations separately.
- Clinical limits: no validated clinical decision support, real provider delivery or emergency dispatch. Demonstration measurements are not evidence of treatment efficacy.
