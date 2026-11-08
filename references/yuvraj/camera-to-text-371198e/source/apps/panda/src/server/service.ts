import { randomUUID } from "node:crypto";
import {
  TurnSchema,
  ConfirmVoiceSchema,
  type VoiceCommand,
  type VoiceReply,
} from "../../../../packages/contracts/voice";
import type { CareSnapshot } from "../../../../packages/contracts/care";
import {
  JsonStore,
  DomainError,
  dataFile,
  type Receipt,
} from "../../../../packages/platform/json-store";
import {
  getCare,
  callPeer,
  connected,
} from "../../../../packages/platform/peers";
import { classify } from "./provider";
type Proposal = {
  id: string;
  command: VoiceCommand;
  planId: string;
  planVersion: number;
  expiresAt: number;
  result?: VoiceReply;
};
type VoiceState = {
  proposals: Proposal[];
  turns: { text: string; reply: VoiceReply; at: string }[];
  receipts: Record<string, Receipt>;
};
export type CareBridge = {
  snapshot: () => Promise<CareSnapshot>;
  write: (path: string, body: unknown) => Promise<unknown>;
  mode: "connected" | "fixture";
};
export type Classifier = (
  text: string,
  care: CareSnapshot,
) => Promise<{
  command: VoiceCommand | null;
  engine: "demo_rules" | "openai" | "gemini";
}>;
export function voiceService(
  file = dataFile("voice"),
  bridge: CareBridge = {
    snapshot: getCare,
    write: (route, body) => callPeer("care", route, "POST", body),
    mode: connected() ? "connected" : "fixture",
  },
  classifier: Classifier = classify,
) {
  const db = new JsonStore<VoiceState>(file, () => ({
    proposals: [],
    turns: [],
    receipts: {},
  }));
  return {
    async context() {
      const c = await bridge.snapshot();
      return {
        plan: c.plan,
        tasks: c.tasks,
        help: c.help,
        mode: bridge.mode,
        ttsEngine:
          process.env.PANDA_TTS_MODE === "elevenlabs"
            ? "elevenlabs"
            : "browser",
      };
    },
    async turn(raw: unknown) {
      const v = TurnSchema.parse(raw);
      const care = await bridge.snapshot();
      if (!care.plan || care.plan.status !== "approved")
        throw new DomainError("CONFLICT", "No approved plan is available");
      return db.update(async (s) => {
        const fingerprint = JSON.stringify(v),
          prev = s.receipts[v.requestId];
        if (prev) {
          if (prev.fingerprint !== fingerprint)
            throw new DomainError(
              "CONFLICT",
              "Request ID reused with different input",
            );
          return prev.result as VoiceReply;
        }
        const { command, engine } = await classifier(v.text, care);
        let reply: VoiceReply = {
          mode: bridge.mode,
          engine,
          message:
            "Try “show my plan”, “open exercise”, “request help”, or confirm one specific task. Panda cannot change treatment.",
        };
        if (command?.name === "read_plan")
          reply = {
            ...reply,
            message: care.plan!.instructions.map((i) => i.text).join("\n"),
            sourceRefs: care.plan!.instructions.map((i) => i.sourceRef),
          };
        if (command?.name === "open_exercise")
          reply = {
            ...reply,
            message:
              "Open the exercise app below. This voice session stops during navigation.",
            navigation: "/rehab",
          };
        if (
          command?.name === "confirm_task" ||
          command?.name === "request_help"
        ) {
          if (
            command.name === "confirm_task" &&
            !care.tasks.some(
              (t) =>
                t.id === command.args.taskId &&
                t.revision === command.args.expectedRevision &&
                t.status === "pending",
            )
          )
            throw new DomainError(
              "CONFLICT",
              "Task is missing or has changed; refresh your plan",
            );
          const proposal: Proposal = {
            id: randomUUID(),
            command,
            planId: care.plan!.id,
            planVersion: care.plan!.version,
            expiresAt: Date.now() + 5 * 60 * 1000,
          };
          s.proposals.push(proposal);
          reply = {
            ...reply,
            proposalId: proposal.id,
            message:
              command.name === "request_help"
                ? "Send this request to the demonstration care team? “" +
                  command.args.quote +
                  "”"
                : "Record your confirmation for “" +
                  care.tasks.find(
                    (t) => t.id === (command.args as { taskId: string }).taskId,
                  )?.title +
                  "”? This is patient-reported.",
          };
        }
        s.turns.push({ text: v.text, reply, at: new Date().toISOString() });
        s.turns = s.turns.slice(-50);
        s.receipts[v.requestId] = { fingerprint, result: reply };
        return reply;
      });
    },
    async confirm(raw: unknown) {
      const v = ConfirmVoiceSchema.parse(raw);
      return db.update(async (s) => {
        const p = s.proposals.find((x) => x.id === v.proposalId);
        if (!p) throw new DomainError("NOT_FOUND", "Proposal not found", 404);
        if (p.result) return p.result;
        if (p.expiresAt < Date.now())
          throw new DomainError(
            "CONFLICT",
            "Confirmation expired. Ask Panda again.",
          );
        const c = await bridge.snapshot();
        if (c.plan?.id !== p.planId || c.plan.version !== p.planVersion)
          throw new DomainError(
            "CONFLICT",
            "Plan changed. Review the new plan before confirming.",
          );
        const command = p.command;
        if (bridge.mode === "connected") {
          if (command.name === "request_help")
            await bridge.write("help", {
              requestId: p.id,
              quote: command.args.quote,
            });
          else if (command.name === "confirm_task")
            await bridge.write(
              "tasks/" + encodeURIComponent(command.args.taskId) + "/confirm",
              {
                requestId: p.id,
                expectedRevision: command.args.expectedRevision,
                evidence: "patient_reported",
              },
            );
          else
            throw new DomainError(
              "VALIDATION_ERROR",
              "This tool has no write action",
              400,
            );
        }
        p.result = {
          mode: bridge.mode,
          engine:
            process.env.PANDA_AI_MODE === "openai"
              ? "openai"
              : process.env.PANDA_AI_MODE === "gemini"
                ? "gemini"
                : "demo_rules",
          message:
            bridge.mode === "fixture"
              ? "Fixture action simulated; no care record was changed. Start all three apps for connected writes."
              : command.name === "request_help"
                ? "Request recorded. A clinician has not acknowledged it yet."
                : "Patient-reported completion saved.",
        };
        return p.result;
      });
    },
    async history() {
      return (await db.snapshot()).turns;
    },
  };
}
export const voice = voiceService();
