import { randomUUID } from "node:crypto";
import {
  CareSnapshotSchema,
  ImportPlanSchema,
  ApprovePlanSchema,
  ConfirmTaskSchema,
  CreateHelpSchema,
} from "../../../../packages/contracts/care";
import { RequestSchema } from "../../../../packages/contracts/common";
import { fixtureCare } from "../../../../packages/contracts/fixtures";
import type { ExerciseReport } from "../../../../packages/contracts/rehab";
import {
  JsonStore,
  DomainError,
  once,
  dataFile,
  type Receipt,
} from "../../../../packages/platform/json-store";
type State = {
  care: ReturnType<typeof fixtureCare>;
  receipts: Record<string, Receipt>;
};
export function careService(file = dataFile("care")) {
  const db = new JsonStore<State>(file, () => ({
    care: fixtureCare(),
    receipts: {},
  }));
  return {
    async findPlanBySourceRef(sourceRef: string) {
      const care = (await db.snapshot()).care;
      return [care.plan, ...care.drafts].find((plan) =>
        plan?.sourceRef === sourceRef ||
        plan?.instructions.some((instruction) => instruction.sourceRef.startsWith(sourceRef + "#")),
      ) || null;
    },
    async snapshot() {
      return CareSnapshotSchema.parse((await db.snapshot()).care);
    },
    async importPlan(raw: unknown) {
      const v = ImportPlanSchema.parse(raw);
      if (v.sourcePatientId && v.sourcePatientId !== process.env.FHIR_PATIENT_ID?.trim()) {
        throw new DomainError("FHIR_PATIENT_NOT_LINKED", "The FHIR patient does not match the configured Care test patient", 409);
      }
      return db.update((s) =>
        once(s.receipts, v.requestId, { op: "import", ...v }, () => {
          if (v.sourceRef) {
            const existing = [s.care.plan, ...s.care.drafts].find((plan) =>
              plan?.sourceRef === v.sourceRef ||
              plan?.instructions.some((instruction) => instruction.sourceRef.startsWith(v.sourceRef + "#")),
            );
            if (existing) return existing;
          }
          const draft = {
            id: randomUUID(),
            patientId: s.care.patientId,
            version: (s.care.plan?.version || 0) + 1,
            status: "draft" as const,
            sourceText: v.sourceText,
            sourceRef: v.sourceRef || null,
            summary: v.summary,
            summaryEvidence: v.summaryEvidence,
            clinicalContext: v.clinicalContext,
            dataWarnings: v.dataWarnings,
            instructions: v.instructions?.map((instruction) => ({
              ...instruction,
              id: randomUUID(),
            })) ?? v.sourceText
              .split(/\n/)
              .map((t, i) => ({
                id: "line-" + (i + 1),
                text: t.trim(),
                sourceRef: (v.sourceRef || "import.txt") + "#line-" + (i + 1),
              }))
              .filter((i) => i.text),
            approvedBy: null,
            demoOnly: true as const,
          };
          s.care.drafts.push(draft);
          return draft;
        }),
      );
    },
    async approve(id: string, raw: unknown) {
      const v = ApprovePlanSchema.parse(raw);
      return db.update((s) =>
        once(s.receipts, v.requestId, { op: "approve", id, ...v }, () => {
          const draft = s.care.drafts.find((d) => d.id === id);
          if (!draft)
            throw new DomainError("NOT_FOUND", "Draft not found", 404);
          if (
            (s.care.plan?.version || 0) !== v.expectedCurrentVersion ||
            draft.version !== v.expectedCurrentVersion + 1
          )
            throw new DomainError(
              "CONFLICT",
              "Plan changed; reload and review a fresh draft",
            );
          if (v.edits) {
            const byId = new Map(v.edits.map((edit) => [edit.id, edit]));
            if (byId.size !== v.edits.length || v.edits.some((edit) => !draft.instructions.some((item) => item.id === edit.id))) {
              throw new DomainError("VALIDATION_ERROR", "Review edits must refer to unique items in this draft", 400);
            }
            draft.instructions = draft.instructions.map((item) => {
              const edit = byId.get(item.id);
              return edit ? { ...item, text: edit.text, audience: edit.audience } : item;
            });
          }
          if (draft.instructions.length === 0)
            throw new DomainError(
              "VALIDATION_ERROR",
              "Draft has no instructions",
              400,
            );
          // Demo clinician identity. Replace with verified clinician authorization before real use.
          draft.status = "approved";
          draft.approvedBy = "demo-clinician";
          s.care.plan = structuredClone(draft);
          s.care.drafts = s.care.drafts.filter((d) => d.id !== id);
          s.care.tasks = draft.instructions.filter((i) => (i.audience || "patient") === "patient").map((i) => ({
            id: randomUUID(),
            patientId: s.care.patientId,
            planId: id,
            planVersion: draft.version,
            title: i.text,
            status: "pending",
            revision: 0,
            evidence: "unknown",
          }));
          return s.care.plan;
        }),
      );
    },
    async confirm(id: string, raw: unknown) {
      const v = ConfirmTaskSchema.parse(raw);
      return db.update((s) =>
        once(s.receipts, v.requestId, { op: "confirm", id, ...v }, () => {
          const task = s.care.tasks.find((t) => t.id === id);
          if (!task)
            throw new DomainError("NOT_FOUND", "Current task not found", 404);
          if (task.revision !== v.expectedRevision)
            throw new DomainError(
              "CONFLICT",
              "Task changed; reload before confirming",
            );
          if (task.status === "completed")
            throw new DomainError("CONFLICT", "Task is already completed");
          task.status = "completed";
          task.evidence = "patient_reported";
          task.revision++;
          return task;
        }),
      );
    },
    async help(raw: unknown) {
      const v = CreateHelpSchema.parse(raw);
      return db.update((s) =>
        once(s.receipts, v.requestId, { op: "help", ...v }, () => {
          const h = {
            id: randomUUID(),
            patientId: s.care.patientId,
            quote: v.quote,
            status: "open" as const,
            createdAt: new Date().toISOString(),
            acknowledgedBy: null,
          };
          s.care.help.push(h);
          return h;
        }),
      );
    },
    async acknowledgeHelp(id: string, raw: unknown) {
      const v = RequestSchema.parse(raw);
      return db.update((s) =>
        once(s.receipts, v.requestId, { op: "ack-help", id }, () => {
          const h = s.care.help.find((a) => a.id === id);
          if (!h)
            throw new DomainError("NOT_FOUND", "Help request not found", 404);
          h.status = "acknowledged";
          h.acknowledgedBy = "demo-clinician";
          return h;
        }),
      );
    },
    async acknowledgeReport(report: ExerciseReport, raw: unknown) {
      const v = RequestSchema.parse(raw);
      return db.update((s) =>
        once(
          s.receipts,
          v.requestId,
          { op: "ack-report", id: report.sessionId },
          () => {
            if (report.patientId !== s.care.patientId)
              throw new DomainError("FORBIDDEN", "Patient mismatch", 403);
            const previous = s.care.acknowledgements.find(
              (a) => a.sessionId === report.sessionId,
            );
            if (previous) return previous;
            const a = {
              sessionId: report.sessionId,
              by: "demo-clinician",
              at: new Date().toISOString(),
            };
            s.care.acknowledgements.push(a);
            return a;
          },
        ),
      );
    },
  };
}
// The doctor portal uses local JSON storage for this prototype.
export const care = careService();
