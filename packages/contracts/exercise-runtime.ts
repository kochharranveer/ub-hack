import { z } from "zod";

// UI status guides conversation; only canonical Rehab reports supply saved measurements.
export const ExerciseRuntimeSchema = z.object({
  exerciseId: z.enum(["seated-knee-extension", "seated-knee-flexion-extension", "straight-leg-raise", "static-quads"]),
  label: z.string().min(1).max(100),
  side: z.enum(["left", "right"]),
  stage: z.enum(["camera_off", "framing", "rest", "target", "ready", "running", "paused", "saved"]),
  missingJoint: z.enum(["hip", "knee", "ankle", "shoulder"]).optional(),
  completedReps: z.number().int().nonnegative().max(1000),
  targetReps: z.number().int().positive().max(1000),
}).strict();
export type ExerciseRuntime = z.infer<typeof ExerciseRuntimeSchema>;
export type ExerciseControl = "start" | "pause" | "resume" | "finish";

export function exerciseInstruction(state: ExerciseRuntime): string {
  switch (state.stage) {
    case "camera_off": return `Let's set up your ${state.label.toLowerCase()}. Enable your camera when you're ready.`;
    case "framing": return state.missingJoint ? `I can’t see your ${state.side} ${state.missingJoint} clearly. Move back and keep it in view.` : `Move back so I can see your ${state.side} hip, knee and ankle. Turn sideways to the camera.`;
    case "rest": return "Hold your comfortable starting position. You can save it with the button below.";
    case "target": return "Now move to your comfortable end position and hold. Save that position when you're ready.";
    case "ready": return state.exerciseId === "static-quads" ? "This uses a guided timer and your confirmation. Say start the set when you’re ready." : "Both positions are saved. Return to the start, then say start the set or tap Start set.";
    case "running": return state.exerciseId === "static-quads" ? "Your set is running. Start a guided hold, then confirm it when you finish." : `Your set is running. Follow the movement guidance; I'll count completed repetitions.`;
    case "paused": return "Your set is paused. Say resume when you're ready, or finish to save it.";
    case "saved": return "Your set is saved. How did it feel?";
  }
}

export function exerciseCommand(text: string): ExerciseControl | undefined {
  const value = text.trim().replace(/[’]/g, "'").replace(/[.!?,]+$/g, "");
  // Questions, negations and symptoms must continue through the care conversation.
  if (/\?|\b(?:not|don't|do not|pain|hurt|sore|discomfort|why|how|when|what)\b/i.test(value)) return;
  if (/^(?:(?:okay|ok|yeah|yes|please|panda)[, ]+)*(?:let'?s )?(?:start|begin)(?: (?:the|my|this|a))?(?: (?:set|exercise|workout|movement))?(?: now| please)?$/i.test(value)) return "start";
  if (/^(?:please )?(?:pause|pause (?:the |my )?(?:set|exercise)|take a break)$/i.test(value)) return "pause";
  if (/^(?:please )?(?:resume|continue)(?: (?:the |my )?(?:set|exercise))?$/i.test(value)) return "resume";
  if (/^(?:please )?(?:finish|finish and save|save (?:the |my )?set|stop (?:the |my )?(?:set|exercise)|i'?m done)(?: (?:the |my )?(?:set|exercise))?$/i.test(value)) return "finish";
}

export function routineExerciseTurn(text: string, state: ExerciseRuntime) {
  const control = exerciseCommand(text);
  if (control) {
    const message = control === "start" ? state.stage === "ready" ? "Let's begin. Follow the movement guidance on screen." : state.stage === "running" ? "Your set is already running." : exerciseInstruction(state)
      : control === "pause" ? state.stage === "running" ? "Let's pause the set." : exerciseInstruction(state)
      : control === "resume" ? state.stage === "paused" ? "Let's continue when your leg is clearly in view." : exerciseInstruction(state)
      : ["running", "paused"].includes(state.stage) ? "Let's finish and save this set." : "There isn’t a running set to save yet. " + exerciseInstruction(state);
    return { message, control };
  }
  if (/^(?:hi|hey|hello|yes|yeah|yep|okay|ok|ready|i'?m ready|what(?:'s| is) happening|what (?:do|should) i do(?: next)?|is (?:it|the set) (?:running|started))\s*[.!?]*$/i.test(text.trim()))
    return { message: exerciseInstruction(state) };
}
