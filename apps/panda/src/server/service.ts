import { randomUUID } from "node:crypto";
import {
  TurnSchema, ConfirmVoiceSchema, VoiceCommandSchema,
  type VoiceCommand, type VoiceReply, type VoiceContext,
} from "../../../../packages/contracts/voice";
import type { CareSnapshot } from "../../../../packages/contracts/care";
import { demoPatientProfile } from "../../../../packages/contracts/fixtures";
import { DomainError } from "../../../../packages/platform/json-store";
import { getCare, callPeer, connected } from "../../../../packages/platform/peers";
import { classify, providerStatus } from "./provider";
import { speechStatus } from "./speech";
import { SqliteVoiceRepository, voiceDatabaseFile, type VoiceRepository, type Proposal } from "./repository";

export type CareBridge = {
  snapshot: () => Promise<CareSnapshot>;
  write: (path: string, body: unknown) => Promise<unknown>;
  mode: "connected" | "fixture";
};
export type Classifier = (
  text: string, care: CareSnapshot, signal?: AbortSignal,
) => Promise<{ command: VoiceCommand | null; engine: VoiceReply["engine"] }>;

export function voiceService(
  file = voiceDatabaseFile(),
  bridge: CareBridge = {
    snapshot: getCare,
    write: (route, body) => callPeer("care", route, "POST", body),
    mode: connected() ? "connected" : "fixture",
  },
  classifier: Classifier = classify,
  repository: VoiceRepository = new SqliteVoiceRepository(file),
  now = Date.now,
) {
  return {
    async context(): Promise<VoiceContext> {
      const c = await bridge.snapshot();
      const provider = providerStatus();
      const speech = speechStatus();
      return {
        patient: demoPatientProfile(c.patientId),
        plan: c.plan, tasks: c.tasks, help: c.help, mode: bridge.mode,
        aiEngine: provider.engine, aiConfigured: provider.configured,
        ttsEngine: speech.engine, ttsConfigured: speech.configured,
      };
    },
    async turn(raw: unknown, signal?: AbortSignal) {
      const v = TurnSchema.parse(raw);
      return repository.transaction(async tx => {
        const fingerprint = JSON.stringify(v);
        const previous = tx.receipt(v.requestId);
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new DomainError("CONFLICT", "Request ID reused with different input");
          return previous.result;
        }
        signal?.throwIfAborted();
        const care = await bridge.snapshot();
        if (!care.plan || care.plan.status !== "approved")
          throw new DomainError("CONFLICT", "No approved plan is available");
        const routed = await classifier(v.text, care, signal);
        signal?.throwIfAborted();
        const command = routed.command === null ? null : VoiceCommandSchema.parse(routed.command);
        // Preserve the user's quote, never a model paraphrase.
        if (command?.name === "request_help") command.args.quote = v.text;
        let reply: VoiceReply = {
          mode: bridge.mode, engine: routed.engine,
          message: "Try “show my plan”, “open exercise”, “request help”, or choose a task below. Panda cannot change treatment.",
        };
        if (command?.name === "read_plan") reply = {
          ...reply, message: care.plan.instructions.map(i => i.text).join("\n"),
          sourceRefs: care.plan.instructions.map(i => i.sourceRef),
        };
        if (command?.name === "open_exercise") reply = {
          ...reply, message: "Open the exercise app below. Voice stops when you leave Panda.", navigation: "/rehab",
        };
        if (command?.name === "confirm_task" || command?.name === "request_help") {
          if (command.name === "confirm_task" && !care.tasks.some(t =>
            t.id === command.args.taskId && t.revision === command.args.expectedRevision &&
            t.status === "pending" && t.planId === care.plan!.id &&
            t.planVersion === care.plan!.version && t.patientId === care.patientId))
            throw new DomainError("CONFLICT", "Task is missing or has changed; refresh your plan and ask again.");
          const proposal: Proposal = {
            id: randomUUID(), command, patientId: care.patientId,
            planId: care.plan.id, planVersion: care.plan.version,
            expiresAt: now() + 5 * 60 * 1000, engine: routed.engine, mode: bridge.mode,
          };
          tx.saveProposal(proposal);
          reply = {
            ...reply, proposalId: proposal.id,
            message: command.name === "request_help"
              ? "Record this request for the demonstration care team? “" + v.text + "”"
              : "Record your completion of “" + care.tasks.find(t => t.id === command.args.taskId)?.title + "”? This is patient-reported.",
          };
        }
        tx.saveTurn({ requestId: v.requestId, text: v.text, reply, at: new Date(now()).toISOString() }, fingerprint);
        return reply;
      });
    },
    async confirm(raw: unknown) {
      const v = ConfirmVoiceSchema.parse(raw);
      // Persist the user's confirmation BEFORE crossing the HTTP boundary. A lost
      // response can then be retried after the five-minute proposal window without
      // creating a new action, as long as the same plan is still current.
      const cached = await repository.transaction(tx => {
        const p = tx.proposal(v.proposalId);
        if (!p) throw new DomainError("NOT_FOUND", "Proposal not found. Ask Panda again.", 404);
        if (p.result) return p.result;
        if (p.mode !== bridge.mode)
          throw new DomainError("CONFLICT", "Integration mode changed. Ask Panda for a new proposal.");
        if (p.confirmedAt === undefined && p.expiresAt <= now())
          throw new DomainError("CONFLICT", "Confirmation expired. Ask Panda again.");
        p.confirmedAt ??= now();
        tx.saveProposal(p);
        return null;
      });
      if (cached) return cached;
      return repository.transaction(async tx => {
        const p = tx.proposal(v.proposalId);
        if (!p) throw new DomainError("NOT_FOUND", "Proposal not found. Ask Panda again.", 404);
        // A completed retry retains its result after plan changes or expiry.
        if (p.result) return p.result;
        if (p.mode !== bridge.mode)
          throw new DomainError("CONFLICT", "Integration mode changed. Ask Panda for a new proposal.");
        const c = await bridge.snapshot();
        if (c.plan?.status !== "approved" || c.patientId !== p.patientId ||
            c.plan.id !== p.planId || c.plan.version !== p.planVersion)
          throw new DomainError("CONFLICT", "Plan changed. Review the new plan and ask for a new confirmation.");
        const command = VoiceCommandSchema.parse(p.command);
        if (command.name !== "request_help" && command.name !== "confirm_task")
          throw new DomainError("VALIDATION_ERROR", "This tool has no write action", 400);
        if (bridge.mode === "connected") {
          if (command.name === "request_help") {
            await bridge.write("help", { requestId: p.id, quote: command.args.quote });
          } else {
            // Care owns the final revision check and idempotency. Retry the SAME
            // payload after a lost response, even if Care already completed it.
            await bridge.write("tasks/" + encodeURIComponent(command.args.taskId) + "/confirm", {
              requestId: p.id, expectedRevision: command.args.expectedRevision, evidence: "patient_reported",
            });
          }
        } else if (command.name === "confirm_task" && !c.tasks.some(t =>
          t.id === command.args.taskId && t.revision === command.args.expectedRevision && t.status === "pending")) {
          throw new DomainError("CONFLICT", "Task changed. Ask Panda for a new confirmation.");
        }
        p.result = {
          mode: p.mode, engine: p.engine,
          message: bridge.mode === "fixture"
            ? "Dry run only. No Care record changed. Start all three apps for connected writes."
            : command.name === "request_help"
              ? "Request recorded. A clinician has not acknowledged it yet."
              : "Patient-reported completion saved.",
        };
        tx.saveProposal(p);
        return p.result;
      });
    },
    async cancel(raw: unknown) {
      const v = ConfirmVoiceSchema.parse(raw);
      return repository.transaction(tx => {
        const p = tx.proposal(v.proposalId);
        if (!p) throw new DomainError("NOT_FOUND", "Proposal not found.", 404);
        if (p.result) return p.result;
        if (p.confirmedAt !== undefined)
          throw new DomainError("CONFIRMATION_PENDING", "Confirmation was already submitted. Retry the same confirmation or check Care for its outcome.", 503);
        p.result = { mode: p.mode, engine: p.engine, message: "Proposal dismissed. Check Care for the outcome of any confirmation you already submitted." };
        tx.saveProposal(p);
        return p.result;
      });
    },
    async history() { return repository.transaction(tx => tx.history()); },
  };
}
export const voice = voiceService();
