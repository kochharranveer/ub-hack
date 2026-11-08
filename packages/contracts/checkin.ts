import { z } from "zod";
import type { VoiceReply } from "./voice";
export type CheckinStage = NonNullable<VoiceReply["checkin"]>["stage"];
const requestId = z.string().min(8).max(100);
export const StartCheckinSchema = z.object({ requestId }).strict();
export const OpenExerciseSchema = z.object({requestId,text:z.string().trim().min(1).max(2000).optional()}).strict();
export const AnswerCheckinSchema = z.object({
  requestId, checkinId: z.string().uuid(), text: z.string().min(1).max(2000).refine(s => Boolean(s.trim())),
  expectedStage: z.enum(["greeting","wellbeing_followup","medications","medication_confirmation","food","followup","readiness","exercise","exercise_review","pain_check","help_confirmation","complete"]).optional(),
}).strict();
export const ContinueCheckinSchema = z.object({
  requestId, checkinId: z.string().uuid(), proposalId: z.string().uuid(),
  confirmationText: z.string().min(1).max(2000).optional(),
}).strict();
export const RehabBridgeEventSchema = z.discriminatedUnion("type", [
  z.object({version:z.literal("1.0.0"),type:z.literal("guided_session_started"),sessionId:z.string().uuid()}).strict(),
  z.object({version:z.literal("1.0.0"),type:z.literal("guided_report_saved"),sessionId:z.string().uuid()}).strict(),
  z.object({version:z.literal("1.0.0"),type:z.literal("guided_feedback"),sessionId:z.string().uuid(),feedbackId:z.string().uuid()}).strict(),
  z.object({ version: z.literal("1.0.0"), type: z.literal("session_started"), sessionId: z.string().min(1), planId: z.string(), planVersion: z.number().int().positive() }).strict(),
  z.object({ version: z.literal("1.0.0"), type: z.literal("camera_status"), status: z.enum(["preview_on", "preview_off"]) }).strict(),
  z.object({ version: z.literal("1.0.0"), type: z.literal("tracking_status"), sessionId: z.string().min(1), status: z.enum(["calibrating", "reliable", "unreliable", "lost", "unavailable"]) }).strict(),
  z.object({ version: z.literal("1.0.0"), type: z.literal("report_saved"), sessionId: z.string().min(1) }).strict(),
]);
export type RehabBridgeEvent = z.infer<typeof RehabBridgeEventSchema>;
export const ExerciseFeedbackSchema = z.object({ requestId, checkinId: z.string().uuid(), event: RehabBridgeEventSchema }).strict();
export type MemoryKind = "checkin_review" | "wellbeing" | "medication_context" | "medication_report" | "food" | "scheduling_pending" | "exercise_readiness" | "exercise_feedback" | "exercise_report" | "exercise_review" | "pain_review";
export type ConversationTurn = {id:string;checkinId:string;role:"user"|"assistant";text:string;at:string};
export type PatientMemoryEvent = {
  id: string; patientId: string; kind: MemoryKind; quote: string; at: string;
  source: "patient_report" | "rehab_report" | "client_observation" | "system";
  metadata: Record<string, unknown>;
};
export type CheckinSession = {
  id: string; patientId: string; planId: string; planVersion: number;
  stage: CheckinStage; medicationTaskIds: string[]; medicationIndex: number;
  pendingProposalId?: string; exerciseSessionId?: string; startedAt: string; updatedAt: string;
  exerciseFeature?:"guided";
  exerciseLabel?:string;
  exerciseResumeStage?:CheckinStage;
  exerciseReviewed?:boolean;
  painReported?: boolean;
  foodKnown?: boolean;
  concernPending?: boolean;
  medicationDetailsRequired?: string[];
  agendaVersion?: 2;
  endedAt?: string;
  foodReviewed?: boolean;
  followupReviewed?: boolean;
};
