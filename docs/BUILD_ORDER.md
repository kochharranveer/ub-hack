# Exact build order — three people, functional ownership

Keep one working end-to-end loop. Asmita is implementing a local synthetic FHIR-to-Care draft and clinician review loop; shared database wiring, production EHR authorization, wearables, booking, background calls and PWA polish remain later work.

| Round | Ranveer: Panda | Asmita: Care | Yuvraj: Rehab | Integration gate |
| --- | --- | --- | --- | --- |
| 0: agree / run | Root setup, three-app gateway, provider env; read voice schema | Shared design tokens; review Care schema | Review Session/Report schema and fixture config | Same repo/lock, all three health checks, exact v2 fixture |
| 1: independent app | Voice/text input, one configured AI route, sourced response and read-aloud | Text import → draft/source display → explicit approval | Camera lifecycle → actual pose model → visible tracking states | Each demo runs alone with fixture peers |
| 2: real domain slice | Tool proposal/confirmation → real Care APIs; distinguish recorded vs acknowledged | Versioned plan/tasks, self-report revision/idempotency, help inbox | One calibrated movement, confidence/rep state machine with known-landmark tests | Voice reads A's approved version; Y captures same version |
| 3: close the loop | Voice launch/handoff; correct audio cleanup and patient status | Fetch Y reports; clinician acknowledgement; refresh patient context | Start → finish → persist one measured report; report/history UI | Same report ID seen in Y history and A acknowledgement |
| 4: demo-ready | Actual provider error case; build/release coordination | Accessibility pass, honest status labels, submission/video story | Tracking-loss/pause test on real phone and desktop | Full three-app check; one live physical-AI demonstration |
| 5: only after gates pass | EHR sandbox, server reminders/consented calls | Appointments, caregiver and PWA functions | Wearables/sensors, additional exercise definitions | Separate backlog; no claim of features not built |

Do rounds 1–2 in parallel against fixed fixtures. Do not wait for another person's finished UI; consume their agreed endpoint/fixture. Merge scaffolding/contracts first, then one working slice at a time. The first connected check is a plan read, not the last-night full demo.

## MVP cut line

Ship one patient, one reviewed plan, one demonstration movement, one voice action and one clinician acknowledgement. Finish real pose inference before extra integrations for the Radial track. Keep a labelled simulator for deterministic integration tests and backup; it does not replace the live model demonstration.

Your three-app architecture is a collaboration mechanism. Pitch the patient outcome and working physical-AI loop, not the number of services. No custom hardware is necessary for the supplied Radial track.

## Today's first actions

1. Ranveer creates/joins the ONE Classroom team repo and uploads the baseline. All three clone it and create their feature branches.
2. Run `npm ci`, `npm run check`, `npm run dev`; verify the three pages through port 3000.
3. Each runs their own standalone script and confirms fixtures work with the other services stopped.
4. Agree the exact `planId/version`, exercise ID and report payload in `packages/contracts`; no unilateral schema changes.
5. Yuvraj starts real pose inference; Ranveer verifies one Gemini/ElevenLabs call; Asmita checks approval/source review and acknowledgement flows.
6. Rejoin for the connected plan read, then save and acknowledge a report. Record a short successful flow and one honest failure state.
