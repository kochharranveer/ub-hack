import type { CareSnapshot, Task } from "../../../../packages/contracts/care";

export type PlanCategory = "medication" | "exercise" | "followUp" | "other";
export type PatientPlanItem = {
  id: string;
  text: string;
  sourceRef: string;
  task?: Task;
};

// Display grouping only. Keep the approved wording; never infer prescriptions,
// exercise targets, appointments, or completion from these text labels.
function category(text: string): PlanCategory {
  if (/\b(follow[ -]?up|check[ -]?in|appointment|schedule)\b/i.test(text))
    return "followUp";
  if (
    /\b(exercise|rehab|movement|physiotherapy|stretch|walk|walking)\b/i.test(
      text,
    )
  )
    return "exercise";
  if (
    /\b(medicines?|medications?|tablets?|capsules?|prescriptions?|doses?)\b|\b\d+(?:\.\d+)?\s*(mg|mcg|ml)\b/i.test(
      text,
    )
  )
    return "medication";
  return "other";
}

export function patientPlan(data: CareSnapshot | null) {
  const groups: Record<PlanCategory, PatientPlanItem[]> = {
    medication: [],
    exercise: [],
    followUp: [],
    other: [],
  };
  const plan = data?.plan;
  if (
    !data ||
    !plan ||
    plan.status !== "approved" ||
    plan.patientId !== data.patientId
  )
    return groups;
  const tasks = data.tasks.filter(
    (task) =>
      task.patientId === data.patientId &&
      task.planId === plan.id &&
      task.planVersion === plan.version,
  );
  for (const instruction of plan.instructions) {
    groups[category(instruction.text)].push({
      ...instruction,
      task: tasks.find((task) => task.title === instruction.text),
    });
  }
  return groups;
}
