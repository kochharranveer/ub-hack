import dataset from "./demo-patients.json";
import { CareSnapshotSchema, type CareSnapshot } from "./care";

/** All apps share the same default synthetic patient. No clinical approval occurs here. */
export function fixtureCare(patientId = dataset.defaultPatientId): CareSnapshot {
  const patient = dataset.patients.find(patient => patient.id === patientId);
  if (!patient) throw Error("Unknown synthetic fixture patient");
  return CareSnapshotSchema.parse(structuredClone(patient.care));
}
export function demoPatientProfile(patientId: string) {
  const patient = dataset.patients.find(patient => patient.id === patientId);
  return patient ? {
    id: patient.id, firstName: patient.firstName, displayName: patient.displayName,
    ageYears: patient.ageYears, synthetic: true as const,
  } : undefined;
}
