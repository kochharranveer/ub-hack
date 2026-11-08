import { domainStore } from "../../../../packages/platform/domain-store";
import { productionEnabled } from "../../../../packages/platform/production/config";
import { activePatient,actorId,identity,requireRole } from "../../../../packages/platform/production/context";
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
  const db = domainStore<State>("care",file, () => ({
    care: productionEnabled()?{contractVersion:"2.1.0",patientId:activePatient(),plan:null,drafts:[],tasks:[],help:[],acknowledgements:[]}:fixtureCare(),
    receipts: {},
  }));
  return {
    async snapshot() {
      const data=CareSnapshotSchema.parse((await db.snapshot()).care);
      return productionEnabled()&&identity().role==="patient"?{...data,drafts:[]}:data;
    },
    async importPlan(raw: unknown) {
      requireRole("clinician");
      const v = ImportPlanSchema.parse(raw);
      return db.update((s) =>
        once(s.receipts, v.requestId, { op: "import", ...v }, () => {
          const draft = {
            id: randomUUID(),
            patientId: s.care.patientId,
            version: (s.care.plan?.version || 0) + 1,
            status: "draft" as const,
            sourceText: v.sourceText,
            instructions: v.sourceText
              .split(/\n/)
              .map((t, i) => ({
                id: "line-" + (i + 1),
                text: t.trim(),
                sourceRef: "import.txt:" + (i + 1),
              }))
              .filter((i) => i.text),
            approvedBy: null,
            demoOnly: !productionEnabled(),
          };
          s.care.drafts.push(draft);
          return draft;
        }),
      );
    },
    async approve(id: string, raw: unknown) {
      requireRole("clinician");
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
          if (draft.instructions.length === 0)
            throw new DomainError(
              "VALIDATION_ERROR",
              "Draft has no instructions",
              400,
            );
          // Demo clinician identity. Replace with verified clinician authorization before real use.
          draft.status = "approved";
          draft.approvedBy = actorId("demo-clinician");
          s.care.plan = structuredClone(draft);
          s.care.drafts = s.care.drafts.filter((d) => d.id !== id);
          s.care.tasks = draft.instructions.map((i) => ({
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
      requireRole("patient");
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
      requireRole("patient");
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
      requireRole("clinician");
      const v = RequestSchema.parse(raw);
      return db.update((s) =>
        once(s.receipts, v.requestId, { op: "ack-help", id }, () => {
          const h = s.care.help.find((a) => a.id === id);
          if (!h)
            throw new DomainError("NOT_FOUND", "Help request not found", 404);
          h.status = "acknowledged";
          h.acknowledgedBy = actorId("demo-clinician");
          return h;
        }),
      );
    },
    async acknowledgeReport(report: ExerciseReport, raw: unknown) {
      requireRole("clinician");
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
              by: actorId("demo-clinician"),
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
export const care = careService();
