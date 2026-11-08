import { z } from "zod";
import { fixtureCare } from "../../../../packages/contracts/fixtures";
import { DomainError, JsonStore, dataFile, type Receipt } from "../../../../packages/platform/json-store";

const AppointmentSchema = z.object({
  date: z.string().max(20),
  time: z.string().max(40),
  clinician: z.string().trim().max(120),
  purpose: z.string().trim().max(240),
}).strict();

const PatientRecordSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  dateOfBirth: z.string().max(20),
  phone: z.string().trim().max(40),
  primaryConcern: z.string().trim().max(300),
  status: z.enum(["Active", "Follow-up due", "Needs review"]),
  lastVisit: z.string().max(20),
  nextAppointment: AppointmentSchema.nullable(),
  allergies: z.array(z.string().trim().min(1).max(200)).max(30),
  medications: z.array(z.string().trim().min(1).max(300)).max(40),
  goals: z.array(z.string().trim().min(1).max(300)).max(30),
  patientInstructions: z.array(z.string().trim().min(1).max(500)).max(40),
  careAlert: z.string().trim().max(500),
  clinicianNotes: z.string().max(3000),
  updatedAt: z.string().datetime(),
}).strict();

const PatientUpdateSchema = PatientRecordSchema.omit({ id: true, lastVisit: true, updatedAt: true });

export type PatientRecord = z.infer<typeof PatientRecordSchema>;
export type PatientRecordUpdate = z.infer<typeof PatientUpdateSchema>;
export type PatientRow = Pick<PatientRecord, "id" | "name" | "dateOfBirth" | "primaryConcern" | "status" | "nextAppointment">;

type PortalState = {
  care: ReturnType<typeof fixtureCare>;
  receipts: Record<string, Receipt>;
  selectedPatientId: string;
  patients: PatientRecord[];
};

const localDemoPatients: PatientRecord[] = [
  {
    id: "pat-demo-001",
    name: "Alex Morgan",
    dateOfBirth: "1981-04-14",
    phone: "(555) 010-1101",
    primaryConcern: "Recovery follow-up",
    status: "Follow-up due",
    lastVisit: "2026-10-30",
    nextAppointment: { date: "2026-11-12", time: "10:30 AM", clinician: "Dr. Avery", purpose: "Follow-up visit" },
    allergies: ["Penicillin (reported)"],
    medications: ["Medication review needed — confirm current list with patient"],
    goals: ["Review recovery progress at next visit", "Discuss any new symptoms with the care team"],
    patientInstructions: ["Bring the current medication list to the next appointment"],
    careAlert: "Confirm medication list before discussing medication questions.",
    clinicianNotes: "Synthetic local demo record. Replace with a verified patient record before clinical use.",
    updatedAt: "2026-11-08T12:00:00.000Z",
  },
  {
    id: "pat-local-002",
    name: "Jamie Rivera",
    dateOfBirth: "1974-09-02",
    phone: "(555) 010-2202",
    primaryConcern: "Routine care follow-up",
    status: "Active",
    lastVisit: "2026-11-02",
    nextAppointment: { date: "2026-11-19", time: "2:00 PM", clinician: "Dr. Avery", purpose: "Scheduled check-in" },
    allergies: ["No allergies recorded in this demo"],
    medications: ["No medication list recorded in this demo"],
    goals: ["Review progress at the next check-in"],
    patientInstructions: ["Contact the clinic if the care plan is unclear"],
    careAlert: "",
    clinicianNotes: "Synthetic local demo record.",
    updatedAt: "2026-11-08T12:00:00.000Z",
  },
  {
    id: "pat-local-003",
    name: "Taylor Chen",
    dateOfBirth: "1990-01-26",
    phone: "(555) 010-3303",
    primaryConcern: "Care plan review",
    status: "Needs review",
    lastVisit: "2026-10-21",
    nextAppointment: null,
    allergies: ["Not reviewed"],
    medications: ["Not reviewed"],
    goals: ["Confirm care goals with the patient"],
    patientInstructions: [],
    careAlert: "Allergy and medication information has not been reviewed in this demo.",
    clinicianNotes: "Synthetic local demo record.",
    updatedAt: "2026-11-08T12:00:00.000Z",
  },
].map((patient) => PatientRecordSchema.parse(patient));

function stateWithPatients(state: PortalState): PortalState {
  // Older local demo files predate the clinician portal. Backfill its synthetic
  // records in memory and persist them the next time a doctor saves/selects.
  if (!Array.isArray(state.patients)) state.patients = structuredClone(localDemoPatients);
  if (!state.selectedPatientId || !state.patients.some((patient) => patient.id === state.selectedPatientId)) {
    state.selectedPatientId = state.patients[0]?.id || localDemoPatients[0].id;
  }
  return state;
}

const store = new JsonStore<PortalState>(dataFile("care"), () => ({
  care: fixtureCare(),
  receipts: {},
  selectedPatientId: localDemoPatients[0].id,
  patients: structuredClone(localDemoPatients),
}));

export async function listPatientRows() {
  const state = stateWithPatients(await store.snapshot());
  return {
    selectedPatientId: state.selectedPatientId,
    patients: state.patients.map(({ id, name, dateOfBirth, primaryConcern, status, nextAppointment }) => ({
      id, name, dateOfBirth, primaryConcern, status, nextAppointment,
    })),
  };
}

export async function getPatientRecord(id: string) {
  const state = stateWithPatients(await store.snapshot());
  const patient = state.patients.find((entry) => entry.id === id);
  if (!patient) throw new DomainError("NOT_FOUND", "Patient record not found", 404);
  return patient;
}

export async function updatePatientRecord(id: string, raw: unknown) {
  const update = PatientUpdateSchema.parse(raw);
  return store.update((state) => {
    stateWithPatients(state);
    const index = state.patients.findIndex((entry) => entry.id === id);
    if (index < 0) throw new DomainError("NOT_FOUND", "Patient record not found", 404);
    const patient = PatientRecordSchema.parse({
      ...state.patients[index],
      ...update,
      updatedAt: new Date().toISOString(),
    });
    state.patients[index] = patient;
    return patient;
  });
}

export async function selectPatientRecord(id: string) {
  return store.update((state) => {
    stateWithPatients(state);
    if (!state.patients.some((entry) => entry.id === id)) {
      throw new DomainError("NOT_FOUND", "Patient record not found", 404);
    }
    state.selectedPatientId = id;
    return { selectedPatientId: id };
  });
}

export async function getActivePatientContext() {
  const state = stateWithPatients(await store.snapshot());
  const patient = state.patients.find((entry) => entry.id === state.selectedPatientId);
  if (!patient) throw new DomainError("NOT_FOUND", "Selected patient record not found", 404);
  // Deliberately exclude clinician-only notes from the patient/voice-safe context.
  return {
    patientId: patient.id,
    name: patient.name,
    primaryConcern: patient.primaryConcern,
    allergies: patient.allergies,
    medications: patient.medications,
    goals: patient.goals,
    patientInstructions: patient.patientInstructions,
    careAlert: patient.careAlert,
    nextAppointment: patient.nextAppointment,
    synthetic: true as const,
  };
}
