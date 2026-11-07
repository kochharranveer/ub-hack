# Validation — November 7, 2026

This describes the delivered v0.2 starter, not the finished clinical product.

| Check | Observed result |
| --- | --- |
| Workspace dependency installation / lock update | Passed (`npm install --no-audit --no-fund`) |
| TypeScript across three apps, shared packages and tests | Passed |
| Domain/provider-boundary tests | 20 passed; 0 failed |
| Production builds | Care, Rehab and Panda passed; Panda rebuilt after the last provider change |
| Connected HTTP integration | 15 checks passed through port-3000 gateway, including all app HTML/CSS, plan versions, voice confirmation, report save/retry, help/report acknowledgement and invalid writes |
| Independent app operation | Panda, Care and Rehab each started alone and served explicit fixture context successfully |
| Product diagram | SVG rendered to PNG and visually inspected |
| Browser UI automation | Attempted; browser launch unavailable because Chromium is not installed. No successful UI automation or physical-device QA is claimed |
| Live paid providers | Not run; Gemini/OpenAI/ElevenLabs need actual credentials. Adapter response/error parsing uses mocked tests |
| Actual pose measurements | Not implemented; camera preview and explicitly simulated report only |
| Production auth/database/deployment | Not implemented; synthetic demo identities, single-process local JSON stores, local-only servers |

Reproduce checks: `npm ci`, `npm run check`, `npm run build`, `npm run test:integration`. Stop other servers on ports 3000–3002 first. The integration runner uses temporary storage and also tests each app in standalone fixture mode.

Before claiming a hackathon-ready physical-AI demo, Yuvraj must implement real pose inference/counter, Ranveer must validate configured voice/AI, and all three must verify the complete loop on a real phone plus clinician browser. Record actual observations and build provenance in docs/DISCLOSURE.md.
