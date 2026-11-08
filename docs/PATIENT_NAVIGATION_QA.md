# Patient navigation cleanup and final smoke test

## One exercise experience

The public patient pages are `/` (Panda), `/care` (Care Hub), and `/exercise` (Panda's camera-first guided exercise). Home and exercise mount the same companion component, including the circular visualiser, inline voice/text controls and persistent check-in. `packages/ui/patient-navigation.ts` is the shared route map.

All three exercise links in Care Hub now use `/exercise?from=care`: the prescribed exercise card, empty report card, and bottom navigation. Exit returns to Care Hub. Home and conversation launches use `/exercise`; exit returns to home. In-page launches use Next's supported native History API so the companion stays mounted. Back, forward and refresh restore the correct view.

`/rehab` is a compatibility redirect to `/exercise`; it no longer exposes a second patient interface. The backend service's direct `/rehab` entry also redirects to Panda's configured public origin. `/rehab/api/*` and model/WASM assets retain their existing URLs and behavior. Independently running Rehab remains useful for API development; the patient UI runs through Panda.

Removed the unused legacy `packages/rehab-bridge/Workspace.tsx` and old `packages/ui/Shell.tsx`. Yuvraj's original reference source and branch archive are untouched. `GuidedWorkspace.tsx` remains the integrated camera adapter.

## Related navigation fixes

- Direct exercise URLs wait for companion initialization before entering the server-side check-in. An initialization reply cannot overwrite a newer navigation request.
- Restoring conversation history does not replay a previous navigation command.
- Starting a general conversation while an exercise is unfinished asks whether to continue. It does not force the camera screen to reopen. An explicit exercise request still opens it.
- Camera entry does not request microphone or camera permission automatically. The patient chooses those controls.
- The underlying home controls are inert while the exercise screen is open. Exit stops companion audio/input; the exercise module saves a running set before an explicit exit.
- Failed exercise entry keeps its retry ID, offers an entry retry, and does not enable a set without the appropriate check-in state. Pending confirmations and concerns retain the existing server-side protections.

## Verification

All 28 browser checks passed on isolated fictional records:

- Home exercise action; browser back and forward; exercise reload; exit to home.
- Inline medicine confirmation; full-plan navigation to patient Care Hub.
- All three Care Hub exercise links; exit back to Care Hub.
- Legacy `/rehab` and direct service-page redirects to the integrated camera view.
- Session start, pause/resume, patient-confirmed guided hold, finish/save, post-exercise review and pain question.
- The saved report appears in Care Hub with the correct self-reported evidence.
- Follow-up request prefill, cancellation, request submission and awaiting-review status.
- Normal chat stays on home after exiting an unfinished exercise; a natural-language exercise command opens the camera view.
- Exit removes the camera/text composer; patient context dialog opens; Escape closes context and medicine dialogs; home refresh stays on home.

Phone exercise view at 390×844 has no horizontal or vertical page overflow and retains the circular Panda companion in the corner. No real microphone/camera, live AI provider, appointment service or doctor portal was used for these checks. The guided hold is patient-confirmed, not camera measurement.

The root check includes type checks, 178 automated tests, and the untouched-upstream guard. All three production apps build. The connected-app integration check also covers canonical exercise HTML/assets, legacy redirects, Care return URL, not-found handling, plan versions, confirmation, saved reports and acknowledgement. These checks validate the basic application flows; they do not validate physical exercise accuracy or live audio quality.

Final results: 28 browser flow checks, 178 automated tests, 36 connected-app checks, and three standalone API checks passed. All three apps built successfully.
