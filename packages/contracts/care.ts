import { z } from "zod";
export const InstructionSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    sourceRef: z.string(),
    audience: z.enum(["patient", "clinician"]).optional(),
    rationale: z.string().max(2000).optional(),
    evidence: z.array(z.object({ sourceRef: z.string(), quote: z.string() }).strict()).max(20).optional(),
  })
  .strict();
export const ClinicalFactSchema = z.object({
  resourceType: z.string(),
  label: z.string(),
  value: z.string(),
  sourceRef: z.string(),
  observedAt: z.string().nullable(),
}).strict();
export const PlanSchema = z
  .object({
    id: z.string(),
    patientId: z.string(),
    version: z.number().int().positive(),
    status: z.enum(["draft", "approved", "superseded"]),
    sourceText: z.string(),
    sourceRef: z.string().max(500).nullable().optional(),
    summary: z.string().max(3000).optional(),
    summaryEvidence: z.array(z.object({ sourceRef: z.string(), quote: z.string() }).strict()).max(20).optional(),
    clinicalContext: z.array(ClinicalFactSchema).max(100).optional(),
    dataWarnings: z.array(z.string().max(500)).max(20).optional(),
    instructions: z.array(InstructionSchema),
    approvedBy: z.string().nullable(),
    demoOnly: z.literal(true),
  })
  .strict();
export const TaskSchema = z
  .object({
    id: z.string(),
    patientId: z.string(),
    planId: z.string(),
    planVersion: z.number().int().positive(),
    title: z.string(),
    status: z.enum(["pending", "completed"]),
    revision: z.number().int().nonnegative(),
    evidence: z.enum(["unknown", "patient_reported"]),
  })
  .strict();
export const HelpSchema = z
  .object({
    id: z.string(),
    patientId: z.string(),
    quote: z.string(),
    status: z.enum(["open", "acknowledged"]),
    createdAt: z.string().datetime(),
    acknowledgedBy: z.string().nullable(),
  })
  .strict();
export const CareSnapshotSchema = z
  .object({
    contractVersion: z.literal("2.0.0"),
    patientId: z.string(),
    plan: PlanSchema.nullable(),
    drafts: z.array(PlanSchema),
    tasks: z.array(TaskSchema),
    help: z.array(HelpSchema),
    acknowledgements: z.array(
      z.object({
        sessionId: z.string(),
        by: z.string(),
        at: z.string().datetime(),
      }),
    ),
  })
  .strict();
export const ImportPlanSchema = z
  .object({
    requestId: z.string().min(8),
    sourceText: z.string().trim().min(1).max(20000),
    sourceRef: z.string().max(500).optional(),
    sourcePatientId: z.string().min(1).max(200).optional(),
    summary: z.string().trim().max(3000).optional(),
    summaryEvidence: z.array(z.object({ sourceRef: z.string(), quote: z.string() }).strict()).max(20).optional(),
    clinicalContext: z.array(ClinicalFactSchema).max(100).optional(),
    dataWarnings: z.array(z.string().max(500)).max(20).optional(),
    instructions: z.array(InstructionSchema).max(100).optional(),
  })
  .strict();
export const FhirSyncSchema = z
  .object({
    requestId: z.string().min(8),
    carePlanId: z.string().min(1).max(200).optional(),
  })
  .strict();
export const ApprovePlanSchema = z
  .object({
    requestId: z.string().min(8),
    expectedCurrentVersion: z.number().int().nonnegative(),
    edits: z.array(z.object({
      id: z.string(),
      text: z.string().trim().min(1).max(500),
      audience: z.enum(["patient", "clinician"]),
    }).strict()).max(100).optional(),
  })
  .strict();
export const ConfirmTaskSchema = z
  .object({
    requestId: z.string().min(8),
    expectedRevision: z.number().int().nonnegative(),
    evidence: z.literal("patient_reported"),
  })
  .strict();
export const CreateHelpSchema = z
  .object({
    requestId: z.string().min(8),
    quote: z.string().trim().min(1).max(2000),
  })
  .strict();
export type Plan = z.infer<typeof PlanSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type CareSnapshot = z.infer<typeof CareSnapshotSchema>;
