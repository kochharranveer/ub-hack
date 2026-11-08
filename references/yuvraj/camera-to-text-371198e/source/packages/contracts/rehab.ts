import { z } from "zod";
export const StartSessionSchema = z
  .object({
    requestId: z.string().min(8),
    planId: z.string(),
    planVersion: z.number().int().positive(),
    exerciseId: z.literal("demo-elbow"),
  })
  .strict();
export const ReportSchema = z
  .object({
    sessionId: z.string(),
    patientId: z.string(),
    planId: z.string(),
    planVersion: z.number().int().positive(),
    exerciseId: z.literal("demo-elbow"),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    repetitions: z.number().int().nonnegative(),
    rangeDegrees: z.number().min(0).max(180).nullable(),
    trackingQuality: z.enum([
      "reliable",
      "unreliable",
      "unavailable",
      "simulated",
    ]),
    evidence: z.enum(["camera_estimated", "simulated"]),
    terminationReason: z.enum([
      "completed",
      "patient_stopped",
      "discomfort_reported",
      "tracking_lost",
    ]),
  })
  .strict()
  .superRefine((v, c) => {
    if (Date.parse(v.endedAt) < Date.parse(v.startedAt))
      c.addIssue({ code: "custom", message: "End precedes start" });
    if (
      v.trackingQuality === "unavailable" &&
      (v.repetitions !== 0 || v.rangeDegrees !== null)
    )
      c.addIssue({
        code: "custom",
        message: "Unavailable tracking cannot claim measurements",
      });
    if ((v.evidence === "simulated") !== (v.trackingQuality === "simulated"))
      c.addIssue({
        code: "custom",
        message: "Simulation evidence and quality must match",
      });
  });
export const FinishSessionSchema = z
  .object({ requestId: z.string().min(8), report: ReportSchema })
  .strict();
export type ExerciseReport = z.infer<typeof ReportSchema>;
export type Session = {
  id: string;
  patientId: string;
  planId: string;
  planVersion: number;
  exerciseId: "demo-elbow";
  startedAt: string;
  report: ExerciseReport | null;
};
