import type { RehabBridgeEvent } from "../../../../packages/contracts/checkin";
import type { VoiceReply } from "../../../../packages/contracts/voice";

export type PendingExerciseFeedback = {
  requestId: string;
  checkinId: string;
  event: RehabBridgeEvent;
};
export function transientExerciseEvent(event: RehabBridgeEvent) {
  return [
    "guided_analysis",
    "guided_calibration",
    "guided_feedback",
    "camera_status",
    "tracking_status",
  ].includes(event.type);
}
function scope(item: PendingExerciseFeedback) {
  return (
    item.checkinId +
    ":" +
    ("sessionId" in item.event ? item.event.sessionId : "calibration")
  );
}
/** Replace obsolete live updates; session starts and saved reports are never dropped. */
export function queueExerciseFeedback(
  queue: PendingExerciseFeedback[],
  next: PendingExerciseFeedback,
) {
  if (transientExerciseEvent(next.event))
    queue = queue.filter(
      (item) =>
        !(scope(item) === scope(next) && item.event.type === next.event.type),
    );
  if (["report_saved", "guided_report_saved"].includes(next.event.type))
    queue = queue.filter(
      (item) =>
        !(scope(item) === scope(next) && transientExerciseEvent(item.event)),
    );
  return [...queue, next];
}

/** Speaking cadence is independent of observation frequency and provider calls. */
export class ExerciseCoachingCadence {
  private lastAt = -Infinity;
  private lastKey = "";
  private lastScope = "";
  decide(reply: VoiceReply, now = Date.now()): "speak" | "wait" | "drop" {
    const text = reply.speechText || reply.message;
    const key = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    const session =
      reply.checkin?.id + ":" + (reply.exerciseSessionId || "calibration");
    if (session !== this.lastScope) {
      this.lastAt = -Infinity;
      this.lastKey = "";
      this.lastScope = session;
    }
    if (
      reply.exerciseCue?.expiresAt &&
      Date.parse(reply.exerciseCue.expiresAt) <= now
    )
      return "drop";
    if (!key || (key === this.lastKey && now - this.lastAt < 20000))
      return "drop";
    if (now - this.lastAt < 6000) return "wait";
    this.lastAt = now;
    this.lastKey = key;
    return "speak";
  }
}
