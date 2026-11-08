import { productionEnabled } from "../../../../packages/platform/production/config";
import { activePatient,identity as currentIdentity } from "../../../../packages/platform/production/context";
import { PostgresVoiceRepository } from "./postgres-repository";
import { randomUUID, createHash } from "node:crypto";
import { PATIENT_ID } from "../../../../packages/contracts/common";
import path from "node:path";
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
import { PatientMemoryRepository } from "./patient-memory";

export type CareBridge = {
  snapshot: () => Promise<CareSnapshot>;
  write: (path: string, body: unknown) => Promise<unknown>;
  mode: "connected" | "fixture";
};
export type Classifier = (
  text: string, care: CareSnapshot, signal?: AbortSignal, patientContext?: string,
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
  memory = new PatientMemoryRepository(path.join(path.dirname(file), "patient-memory.sqlite")),
  identity: () => Promise<string> = async () => productionEnabled()?activePatient():PATIENT_ID,
) {
  const repositories=new Map<string,VoiceRepository>([[PATIENT_ID,repository]]);
  function repositoryFor(patientId:string) {
    if(productionEnabled())return new PostgresVoiceRepository(now);
    let scoped=repositories.get(patientId);
    if (!scoped) {scoped=new SqliteVoiceRepository(file+"."+createHash("sha256").update(patientId).digest("hex").slice(0,24)+".sqlite",now);repositories.set(patientId,scoped);}
    return scoped;
  }
  function requirePatient(actual:string,expected:string) {if (actual!==expected) throw new DomainError("FORBIDDEN","Care context does not match the active patient.",403);}
  return {
    async context(): Promise<VoiceContext> {
      const c = await bridge.snapshot();
      requirePatient(c.patientId,await identity());
      const provider = providerStatus();
      const speech = speechStatus();
      return {
        patient: productionEnabled()?{id:c.patientId,firstName:currentIdentity().displayName.split(" ")[0]||"",displayName:currentIdentity().displayName,synthetic:false}:demoPatientProfile(c.patientId),
        runtime:productionEnabled()?"production":"demo",
        plan: c.plan, tasks: c.tasks, help: c.help, mode: bridge.mode,
        aiEngine: provider.engine, aiConfigured: provider.configured,
        ttsEngine: speech.engine, ttsConfigured: speech.configured,
        sttConfigured: Boolean(process.env.PANDA_ELEVENLABS_API_KEY),
      };
    },
    async turn(raw: unknown, signal?: AbortSignal, trustedCommand?: VoiceCommand) {
      const v = TurnSchema.parse(raw);
      const patientId=await identity(),repo=repositoryFor(patientId);
      const cached = await repo.transaction(tx => tx.receipt(v.requestId));
      if (cached) {
        if (cached.fingerprint !== JSON.stringify(v)) throw new DomainError("CONFLICT", "Request ID reused with different input");
        return cached.result;
      }
      // Read memory before taking the voice transaction lock. Check-in operations
      // may create proposals while holding the memory lock; never invert that order.
      let recalled:Awaited<ReturnType<PatientMemoryRepository["recall"]>>|undefined;
      if (!trustedCommand) {const current=await bridge.snapshot();requirePatient(current.patientId,patientId);recalled=await memory.recall(patientId);}
      return repo.transaction(async tx => {
        const fingerprint = JSON.stringify(v);
        const previous = tx.receipt(v.requestId);
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new DomainError("CONFLICT", "Request ID reused with different input");
          return previous.result;
        }
        signal?.throwIfAborted();
        const care = await bridge.snapshot();
        requirePatient(care.patientId,patientId);
        if (!care.plan || care.plan.status !== "approved")
          throw new DomainError("CONFLICT", "No approved plan is available");
        if (recalled && recalled.patientId !== care.patientId)
          throw new DomainError("CONFLICT", "Patient context changed. Start a fresh request.");
        const routed = trustedCommand
          ? { command: trustedCommand, engine: "checkin_workflow" as const }
          : await classifier(v.text, care, signal, JSON.stringify({ patientId: recalled?.patientId, totalEvents: recalled?.totalEvents,
              entries: recalled?.events.slice(0,16).map(event => ({ ...event, quote: event.quote.slice(0,500) })),
              latestByTopic: recalled && Object.fromEntries(Object.entries(recalled.byKind).map(([kind,entries])=>[kind,entries.slice(0,2).map(event=>({quote:event.quote.slice(0,500),at:event.at,source:event.source}))])) }));
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
        if (command?.name === "read_patient_context") {
          const remembered = recalled ?? { events: [] };
          const topic = command.args.topic;
          const kinds = topic === "food" ? ["food"] : topic === "medications" ? ["medication_report"] :
            topic === "exercise" ? ["exercise_readiness", "exercise_report", "exercise_review", "pain_review", "exercise_feedback"] :
            topic === "checkins" ? ["scheduling_pending"] : null;
          const entries = (kinds && recalled ? kinds.flatMap(kind=>recalled.byKind[kind as keyof typeof recalled.byKind] ?? []) : remembered.events).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,20);
          reply = { ...reply, message: entries.length
            ? entries.map(event => event.at + " · " + event.kind.replaceAll("_", " ") + ": “" + event.quote + "” (" + event.source.replaceAll("_", " ") + ")").join("\n")
            : "No remembered entries for that topic yet. Start a check-in to add your own reports.",
            sourceRefs: entries.map(event => "patient-memory:" + event.id) };
        }
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
              ? "Record this request for your care team to review? “" + v.text + "”"
              : "Record your completion of “" + care.tasks.find(t => t.id === command.args.taskId)?.title + "”? This is patient-reported.",
          };
        }
        tx.saveTurn({ requestId: v.requestId, text: v.text, reply, at: new Date(now()).toISOString() }, fingerprint);
        return reply;
      });
    },
    async confirm(raw: unknown) {
      const v = ConfirmVoiceSchema.parse(raw);
      const patientId=await identity(),repo=repositoryFor(patientId);
      // Persist the user's confirmation BEFORE crossing the HTTP boundary. A lost
      // response can then be retried after the five-minute proposal window without
      // creating a new action, as long as the same plan is still current.
      const cached = await repo.transaction(tx => {
        const p = tx.proposal(v.proposalId);
        if (!p) throw new DomainError("NOT_FOUND", "Proposal not found. Ask Panda again.", 404);
        requirePatient(p.patientId,patientId);
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
      return repo.transaction(async tx => {
        const p = tx.proposal(v.proposalId);
        if (!p) throw new DomainError("NOT_FOUND", "Proposal not found. Ask Panda again.", 404);
        // A completed retry retains its result after plan changes or expiry.
        requirePatient(p.patientId,patientId);
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
      const patientId=await identity(),repo=repositoryFor(patientId);
      return repo.transaction(tx => {
        const p = tx.proposal(v.proposalId);
        if (!p) throw new DomainError("NOT_FOUND", "Proposal not found.", 404);
        requirePatient(p.patientId,patientId);
        if (p.result) return p.result;
        if (p.confirmedAt !== undefined)
          throw new DomainError("CONFIRMATION_PENDING", "Confirmation was already submitted. Retry the same confirmation or check Care for its outcome.", 503);
        p.result = { mode: p.mode, engine: p.engine, message: "Proposal dismissed. Check Care for the outcome of any confirmation you already submitted." };
        tx.saveProposal(p);
        return p.result;
      });
    },
    async proposalResult(proposalId: string, patientId: string) {
      if (patientId!==await identity()) return undefined;
      const repo=repositoryFor(patientId);
      return repo.transaction(tx => {
        const proposal = tx.proposal(proposalId);
        return proposal?.patientId === patientId && proposal.result ? proposal : undefined;
      });
    },
    async proposalStatus(proposalId: string, patientId: string) {
      if (patientId!==await identity()) return undefined;
      const repo=repositoryFor(patientId);
      return repo.transaction(tx => {
        const proposal=tx.proposal(proposalId);
        return proposal?.patientId===patientId ? proposal : undefined;
      });
    },
    async history() { const repo=repositoryFor(await identity());return repo.transaction(tx => tx.history()); },
  };
}
export const voice = voiceService();
