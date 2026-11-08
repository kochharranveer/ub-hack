import type { CvCalibrationAssistResponse } from "../yuvraj-integration/contracts";

export type CalibrationCandidate = {
  position: "rest" | "comfortable_target";
  angles: number[];
  confidences: number[];
  firstAt: number;
  lastAt: number;
};
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Slow provider replies must not reset an otherwise consistent reference sequence. */
export function settleCalibration(previous: CalibrationCandidate | null, result: CvCalibrationAssistResponse, now: number, local?: { ready: boolean; angleDeg: number | null }) {
  if (!["rest", "comfortable_target"].includes(result.detectedPosition) || !result.accepted || !result.stable || result.confidence < .72 || result.angleDeg === null)
    return { candidate: null, angle: null };
  const position = result.detectedPosition as CalibrationCandidate["position"];
  const consistent = previous?.position === position && now - previous.lastAt <= 30000 && Math.abs(median(previous.angles) - result.angleDeg) <= 10;
  const candidate: CalibrationCandidate = consistent ? {
    ...previous!, angles: [...previous!.angles, result.angleDeg].slice(-3),
    confidences: [...previous!.confidences, result.confidence].slice(-3), lastAt: now,
  } : { position, angles: [result.angleDeg], confidences: [result.confidence], firstAt: now, lastAt: now };
  const locallyConfirmed = local?.ready && local.angleDeg !== null && Math.abs(local.angleDeg - result.angleDeg) <= 8;
  const accepted = locallyConfirmed || candidate.angles.length >= 3 && now - candidate.firstAt >= 2400;
  return { candidate, angle: accepted ? Math.round(median(candidate.angles)) : null };
}
