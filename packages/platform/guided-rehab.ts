import { z } from "zod";
import {
  CvSessionSchema,
  CvRepAnalysisSchema,
  CvCalibrationAssistResponseSchema,
  CvCareReferenceSchema,
  CvReportSchema,
  CvFeedbackSchema,
} from "../contracts/rehab-cv";
import { callPeer } from "./peers";
export async function getGuidedSession(id: string) {
  return CvSessionSchema.parse(
    await callPeer("rehab", "cv/v1/sessions/" + encodeURIComponent(id)),
  );
}
export async function getGuidedFeedback(id: string, eventId: string) {
  return CvFeedbackSchema.parse(
    await callPeer(
      "rehab",
      "cv/v1/sessions/" +
        encodeURIComponent(id) +
        "/feedback/" +
        encodeURIComponent(eventId),
    ),
  );
}
export async function getGuidedReports() {
  return z
    .array(CvReportSchema)
    .parse(await callPeer("rehab", "cv/v1/sessions"));
}

export const GuidedAnalysisSchema = z
  .object({
    batchSequence: z.number().int().positive(),
    analysis: CvRepAnalysisSchema,
    session: CvSessionSchema,
    sessionControlRevision: z.number().int().nonnegative(),
    acceptedAt: z.string().datetime(),
  })
  .strict();
export async function getGuidedAnalysis(id: string) {
  return GuidedAnalysisSchema.parse(
    await callPeer(
      "rehab",
      "cv/v1/sessions/" + encodeURIComponent(id) + "/analysis",
    ),
  );
}

export const GuidedCalibrationSchema = z
  .object({
    calibrationId: z.string().uuid(),
    result: CvCalibrationAssistResponseSchema,
    exerciseId: z.string(),
    side: z.enum(["left", "right"]),
    acceptedAt: z.string().datetime(),
    careReference: CvCareReferenceSchema.optional(),
  })
  .strict();
export async function getGuidedCalibration(id: string) {
  return GuidedCalibrationSchema.parse(
    await callPeer("rehab", "cv/v1/calibrations/" + encodeURIComponent(id)),
  );
}
