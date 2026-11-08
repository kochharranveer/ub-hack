# Care FHIR connection

Care reads FHIR R4 resources on the server. The adapter checks the server's `CapabilityStatement` at `/metadata`, then searches for active `CarePlan` resources and available patient `Condition`, `Observation`, `MedicationRequest`, and `Goal` records. The FHIR R4 model represents care-plan goals and activities alongside related clinical resources such as observations and medication requests. [CarePlan](https://hl7.org/fhir/R4/careplan.html) [Observation](https://hl7.org/fhir/R4/observation.html) [MedicationRequest](https://hl7.org/fhir/R4/medicationrequest.html)

Gemini produces an AI-assisted summary and proposed items from those supplied facts. Each summary and item must cite exact source quotes; the backend rejects citations that do not match the fetched records. Patient actions must be supported by the active CarePlan. Other items are marked for clinician review only. The clinician can inspect the facts and evidence, edit each item, and decide whether it belongs on the patient checklist. Only items explicitly approved as patient actions become checklist tasks. This is data-grounded summarization and proposal generation, not model training or an autonomous clinical decision system; it does not consult clinical guidelines or create diagnoses, prescriptions, or test orders.

## Local configuration

Copy `.env.example` to `.env.local` and set `FHIR_PATIENT_ID` to an ID from the test server. `FHIR_BASE_URL` defaults to the public HAPI R4 test endpoint. `FHIR_ACCESS_TOKEN` is optional for servers that accept a bearer token. Set `CARE_GEMINI_API_KEY` and `CARE_GEMINI_MODEL` to enable AI draft generation. Keep credentials in the ignored `.env.local`; never commit them. This prototype stores Care data in local JSON; shared database wiring is deferred.

The public HAPI server is a shared test/demo service with synthetic data. It may be reset, changed, or unavailable. Do not use it for real patient information. The current adapter supports unauthenticated reads and a manually supplied bearer token; SMART authorization and automatic background synchronization are not implemented yet. The configured Gemini provider receives the selected FHIR facts to produce the draft, so use synthetic data only until an approved provider and data-handling arrangement are in place. AI output is untrusted and always requires clinician review. It must not diagnose, invent treatment, or change medication/dose/timing.

## API routes

- `GET /care/api/fhir/status` checks the configured server's FHIR version and advertised resource types.
- `GET /care/api/fhir/plans` lists active CarePlans for the configured patient so a clinician can choose one.
- `POST /care/api/fhir/sync` accepts a Care request ID and imports the configured patient's active CarePlan as a draft.

The configured FHIR patient ID is a single synthetic test identity. Mapping additional patients requires authenticated patient selection and a shared persistence layer.
