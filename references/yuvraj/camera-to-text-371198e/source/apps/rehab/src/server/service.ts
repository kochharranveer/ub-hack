import { randomUUID } from "node:crypto";
import {
  StartSessionSchema,
  FinishSessionSchema,
  type Session,
} from "../../../../packages/contracts/rehab";
import type { CareSnapshot } from "../../../../packages/contracts/care";
import {
  JsonStore,
  DomainError,
  once,
  dataFile,
  type Receipt,
} from "../../../../packages/platform/json-store";
export function rehabService(file = dataFile("rehab")) {
  const db = new JsonStore<{
    sessions: Session[];
    receipts: Record<string, Receipt>;
  }>(file, () => ({ sessions: [], receipts: {} }));
  return {
    async reports() {
      return (await db.snapshot()).sessions.flatMap((s) =>
        s.report ? [s.report] : [],
      );
    },
    async start(raw: unknown, care: CareSnapshot) {
      const v = StartSessionSchema.parse(raw);
      return db.update((s) =>
        once(s.receipts, v.requestId, { op: "start", ...v }, () => {
          if (
            !care.plan ||
            care.plan.status !== "approved" ||
            care.plan.id !== v.planId ||
            care.plan.version !== v.planVersion
          )
            throw new DomainError(
              "CONFLICT",
              "Approved plan changed; reload before starting",
            );
          const session: Session = {
            id: randomUUID(),
            patientId: care.patientId,
            planId: v.planId,
            planVersion: v.planVersion,
            exerciseId: v.exerciseId,
            startedAt: new Date().toISOString(),
            report: null,
          };
          s.sessions.push(session);
          return session;
        }),
      );
    },
    async finish(id: string, raw: unknown) {
      const v = FinishSessionSchema.parse(raw);
      return db.update((s) =>
        once(s.receipts, v.requestId, { op: "finish", id, ...v }, () => {
          const session = s.sessions.find((x) => x.id === id);
          if (!session)
            throw new DomainError("NOT_FOUND", "Session not found", 404);
          const q = v.report;
          if (session.report)
            throw new DomainError("CONFLICT", "Session already finished");
          if (
            q.sessionId !== id ||
            q.patientId !== session.patientId ||
            q.planId !== session.planId ||
            q.planVersion !== session.planVersion ||
            q.exerciseId !== session.exerciseId ||
            q.startedAt !== session.startedAt
          )
            throw new DomainError(
              "CONFLICT",
              "Report does not match captured session",
            );
          session.report = q;
          return q;
        }),
      );
    },
  };
}
export const rehab = rehabService();
