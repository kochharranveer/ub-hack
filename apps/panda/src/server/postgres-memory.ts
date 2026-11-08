import { PostgresStore } from "../../../../packages/platform/production/database";
import { activePatient } from "../../../../packages/platform/production/context";
import { DomainError } from "../../../../packages/platform/json-store";
import type {
  CheckinSession,
  PatientMemoryEvent,
  ConversationTurn,
} from "../../../../packages/contracts/checkin";
import { fingerprint, type MemoryTransaction } from "./patient-memory";
type State = {
  sessions: CheckinSession[];
  events: PatientMemoryEvent[];
  dialogue: ConversationTurn[];
  receipts: { id: string; fingerprint: string; result: unknown }[];
};
export function postgresMemoryTransaction<T>(
  patientId: string,
  fn: (tx: MemoryTransaction) => T | Promise<T>,
): Promise<T> {
  if (patientId !== activePatient())
    throw new DomainError("FORBIDDEN", "Patient mismatch.", 403);
  return new PostgresStore<State>("memory", () => ({
    sessions: [],
    events: [],
    dialogue: [],
    receipts: [],
  })).update((state) => {
    const tx: MemoryTransaction = {
      session(id) {
        const s = state.sessions.find((s) => s.id === id);
        return s ? structuredClone(s) : undefined;
      },
      latestSession() {
        return structuredClone(
          state.sessions
            .map((s, i) => ({ s, i }))
            .sort(
              (a, b) => b.s.updatedAt.localeCompare(a.s.updatedAt) || b.i - a.i,
            )[0]?.s,
        );
      },
      saveSession(s) {
        if (s.patientId !== patientId)
          throw new DomainError("FORBIDDEN", "Patient mismatch.", 403);
        const index = state.sessions.findIndex((old) => old.id === s.id);
        if (index >= 0) state.sessions[index] = structuredClone(s);
        else state.sessions.push(structuredClone(s));
      },
      append(event) {
        if (event.patientId !== patientId)
          throw new DomainError("FORBIDDEN", "Patient mismatch.", 403);
        if (!state.events.some((e) => e.id === event.id))
          state.events.push(structuredClone(event));
      },
      events(kind, limit = 50) {
        return structuredClone(
          state.events
            .map((e, i) => ({ e, i }))
            .filter(({ e }) => !kind || e.kind === kind)
            .sort((a, b) => b.e.at.localeCompare(a.e.at) || b.i - a.i)
            .slice(0, Math.min(limit, 200))
            .map(({ e }) => e),
        );
      },
      count() {
        return state.events.length;
      },
      receipt(id) {
        const r = state.receipts.find((r) => r.id === id);
        return r
          ? structuredClone({ fingerprint: r.fingerprint, result: r.result })
          : undefined;
      },
      saveReceipt(id, payload, result) {
        if (state.receipts.some((r) => r.id === id))
          throw new DomainError("CONFLICT", "Request already recorded.");
        state.receipts.push({
          id,
          fingerprint: fingerprint(payload),
          result: structuredClone(result),
        });
      },
      dialogue(limit = 40) {
        return structuredClone(
          state.dialogue
            .map((t, i) => ({ t, i }))
            .sort((a, b) => b.t.at.localeCompare(a.t.at) || b.i - a.i)
            .slice(0, Math.min(limit, 200))
            .reverse()
            .map(({ t }) => t),
        );
      },
      appendDialogue(turn) {
        if (!tx.session(turn.checkinId))
          throw new DomainError(
            "FORBIDDEN",
            "Conversation does not belong to this patient.",
            403,
          );
        if (!state.dialogue.some((t) => t.id === turn.id))
          state.dialogue.push(structuredClone(turn));
      },
      forget() {
        state.events = [];
        state.sessions = [];
        state.receipts = [];
        state.dialogue = [];
      },
    };
    return fn(tx);
  });
}
