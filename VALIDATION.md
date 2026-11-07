# Validation — November 7, 2026

This records the Ranveer voice implementation on the v0.2 baseline. It is not clinical-product acceptance.

- `npm ci`: passed using the supplied lockfile; no new package dependency.
- `npm run check`: passed, with TypeScript across all three apps and **38 tests, zero failures**.
- `npm run build`: all three apps built. Panda was rebuilt after the final UI, confirmation and adapter changes.
- `npm run test:integration`: **19 gateway checks passed**, including no write before confirmation, stable retry, resolved history, dismissal, stale-plan rejection, report save/retry, help/report acknowledgement and app assets.
- Panda, Care and Rehab each started independently and returned explicit fixture context.
- Browser QA succeeded on the actual local app. Tested sourced plan replies, keyboard entry, explicit fixture confirmation, accurate dry-run wording, saved conversation after reload, Emergency information dialog, and 390-pixel layout with no horizontal overflow.
- Screenshots accompany the delivery. Responsive browser sizing is not a physical-device test.
- `npm run voice:purge`: correctly handles an absent database; repository tests cover pruning populated/expired records.
- `npm run test:providers:live`: intentionally stopped with a missing-configuration message. **No paid provider call or actual microphone recording is claimed.**
- Provider HTTP requests/responses, malformed JSON, schema violations, rejection, cancellation, timeout and speech-body failure were tested with mocked fetch responses.
- Authentication, production PostgreSQL, HTTPS hosting, actual pose inference and real clinician delivery remain pending.

Local runtime used Node 25.8.1 and npm 11.11.0. The committed Node floor is 22.13; CI selects Node 24. GitHub-hosted CI was configured but not remotely run during this delivery.

Reproduce from the repository root:

```sh
npm ci
npm run check
npm run build
npm run test:integration
```

Stop other servers on ports 3000–3002 first. The integration runner isolates storage in temporary directories.

See [Ranveer's handoff](docs/RANVEER_HANDOFF.md) for payload examples, storage/retention semantics, live provider setup, teammate reviews and the remaining implementation checklist.
