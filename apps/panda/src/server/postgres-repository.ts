import { PostgresStore } from "../../../../packages/platform/production/database";
import { DomainError } from "../../../../packages/platform/json-store";
import { activePatient } from "../../../../packages/platform/production/context";
import {
  RETENTION_MS,
  type Proposal,
  type Turn,
  type VoiceRepository,
  type VoiceTransaction,
} from "./repository";
type State = {
  receipts: {
    id: string;
    fingerprint: string;
    result: Turn["reply"];
    at: number;
  }[];
  turns: Turn[];
  proposals: { value: Proposal; at: number }[];
};
export class PostgresVoiceRepository implements VoiceRepository {
  constructor(private now = Date.now) {}
  transaction<T>(fn: (tx: VoiceTransaction) => T | Promise<T>): Promise<T> {
    return new PostgresStore<State>("voice", () => ({
      receipts: [],
      turns: [],
      proposals: [],
    })).update(async (state) => {
      const now = this.now(),
        cutoff = now - RETENTION_MS,
        patient = activePatient();
      state.receipts = state.receipts.filter((r) => r.at >= cutoff);
      state.turns = state.turns.filter((r) => Date.parse(r.at) >= cutoff);
      state.proposals = state.proposals.filter((p) => p.at >= cutoff);
      const tx: VoiceTransaction = {
        receipt(id) {
          const r = state.receipts.find((r) => r.id === id);
          return r
            ? structuredClone({ fingerprint: r.fingerprint, result: r.result })
            : undefined;
        },
        saveTurn(turn, fingerprint) {
          if (state.receipts.length >= 1000)
            throw new DomainError(
              "STORAGE_LIMIT",
              "Conversation request capacity reached. Please try later.",
              503,
            );
          state.receipts.push({
            id: turn.requestId,
            fingerprint,
            result: structuredClone(turn.reply),
            at: now,
          });
          state.turns.push(structuredClone(turn));
          state.turns = state.turns.slice(-50);
        },
        proposal(id) {
          const p = state.proposals.find((p) => p.value.id === id)?.value;
          return p ? structuredClone(p) : undefined;
        },
        saveProposal(proposal) {
          if (proposal.patientId !== patient)
            throw new DomainError("FORBIDDEN", "Patient mismatch.", 403);
          const p = state.proposals.find((p) => p.value.id === proposal.id);
          if (p) p.value = structuredClone(proposal);
          else
            state.proposals.push({ value: structuredClone(proposal), at: now });
        },
        history() {
          return state.turns.map((turn) => {
            let reply = structuredClone(turn.reply);
            if (reply.proposalId) {
              const p = tx.proposal(reply.proposalId);
              if (p?.result) reply = p.result;
              else if (p?.confirmedAt !== undefined)
                reply = {
                  ...reply,
                  message:
                    "Confirmation submitted; result pending. Retry the same confirmation to check.\n" +
                    reply.message,
                };
              else if (!p || p.expiresAt <= now) {
                const { proposalId: _id, ...rest } = reply;
                reply = {
                  ...rest,
                  message: "This confirmation expired. Ask Panda again.",
                };
              }
            }
            return { ...structuredClone(turn), reply };
          });
        },
      };
      return fn(tx);
    });
  }
}
