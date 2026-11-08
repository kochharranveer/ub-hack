import { z } from "zod";
import {
  CvSessionSchema,
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
