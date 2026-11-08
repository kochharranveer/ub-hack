import { care } from "@/server/service";
import { getActivePatientContext } from "@/server/patient-portal";
import { respond } from "@platform/http";

export const dynamic = "force-dynamic";

export function GET() {
  return respond(async () => {
    const [patient, snapshot] = await Promise.all([
      getActivePatientContext(),
      care.snapshot(),
    ]);
    const isPlanForPatient = patient.patientId === snapshot.patientId;
    const approvedPlan = isPlanForPatient && snapshot.plan?.status === "approved"
      ? {
          version: snapshot.plan.version,
          instructions: snapshot.plan.instructions
            .filter((item) => (item.audience || "patient") === "patient")
            .map((item) => ({ text: item.text, sourceRef: item.sourceRef })),
        }
      : null;
    const checklist = isPlanForPatient
      ? snapshot.tasks
          .filter((task) => task.patientId === patient.patientId)
          .map(({ id, title, status }) => ({ id, title, status }))
      : [];

    return {
      patient,
      plan: approvedPlan,
      checklist,
      synthetic: true as const,
      planUnavailableReason: isPlanForPatient ? null : "No approved plan is linked to this patient record yet.",
    };
  });
}
