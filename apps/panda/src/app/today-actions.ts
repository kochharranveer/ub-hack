import type { Task } from "../../../../packages/contracts/care";
import type { VoiceContext } from "../../../../packages/contracts/voice";

// Display grouping only: keep Care's title verbatim, never infer a drug or dose.
// Contract v2 has no structured medication category; unrecognised tasks stay in Care.
const medicationText = /\b(medicines?|medications?|tablets?|capsules?|prescriptions?|doses?)\b|\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml)\b/i;
export function approvedMedicationTasks(context: VoiceContext | null): Task[] {
  const plan = context?.plan;
  if (!context || !plan || plan.status !== "approved") return [];
  return context.tasks.filter(task =>
    task.patientId === plan.patientId && task.planId === plan.id &&
    task.planVersion === plan.version && medicationText.test(task.title));
}
