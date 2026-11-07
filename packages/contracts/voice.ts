import { z } from "zod";
export const VoiceCommandSchema = z.discriminatedUnion("name", [
  z
    .object({ name: z.literal("read_plan"), args: z.object({}).strict() })
    .strict(),
  z
    .object({
      name: z.literal("confirm_task"),
      args: z
        .object({
          taskId: z.string(),
          expectedRevision: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("request_help"),
      args: z.object({ quote: z.string().min(1).max(2000).refine(s => Boolean(s.trim()), "Quote cannot be blank") }).strict(),
    })
    .strict(),
  z
    .object({ name: z.literal("open_exercise"), args: z.object({}).strict() })
    .strict(),
]);
export const TurnSchema = z
  .object({
    requestId: z.string().min(8),
    text: z.string().min(1).max(2000).refine(s => Boolean(s.trim()), "Text cannot be blank"),
  })
  .strict();
export const ConfirmVoiceSchema = z
  .object({ proposalId: z.string().uuid() })
  .strict();
export type VoiceCommand = z.infer<typeof VoiceCommandSchema>;
export type VoiceReply = {
  mode: "fixture" | "connected";
  engine: "demo_rules" | "openai" | "gemini";
  message: string;
  proposalId?: string;
  navigation?: "/rehab";
  sourceRefs?: string[];
};
// Additive Panda-only endpoint types; Care/Rehab v2 shapes remain unchanged.
export type VoiceContext = {
  plan: import("./care").Plan | null;
  tasks: import("./care").Task[];
  help: import("./care").CareSnapshot["help"];
  mode: VoiceReply["mode"];
  aiEngine: VoiceReply["engine"];
  aiConfigured: boolean;
  ttsEngine: "browser" | "elevenlabs";
  ttsConfigured: boolean;
};
export type VoiceHistoryTurn = {
  requestId: string; text: string; reply: VoiceReply; at: string;
};
