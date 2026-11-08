import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  pandaCoachingFetcher,
  PANDA_COACHING_STYLE,
} from "../packages/yuvraj-integration/coaching-provider";
import {
  ExerciseCoachingCadence,
  queueExerciseFeedback,
  type PendingExerciseFeedback,
} from "../apps/panda/src/app/exercise-coaching";
import type { VoiceReply } from "../packages/contracts/voice";

test("a quota rejection is explicit, makes one attempt, and never fabricates a successful analysis", async () => {
  let calls = 0;
  const fetcher = pandaCoachingFetcher(async () => {
    calls++;
    return new Response("quota exhausted", { status: 429 });
  });
  await assert.rejects(
    () =>
      fetcher(
        "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
        { body: JSON.stringify({}) },
      ),
    (error: any) =>
      error.code === "EXERCISE_AI_RATE_LIMITED" && error.status === 503,
  );
  assert.equal(calls, 1);
});

test("Panda coaching uses the existing analysis request, preserving the original prompt and numeric schema", async () => {
  let calls = 0;
  const response = new Response("provider response");
  const fetcher = pandaCoachingFetcher(async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(
      body.systemInstruction.parts[0].text,
      "Original measurement and evidence rules",
    );
    assert.equal(body.systemInstruction.parts[1].text, PANDA_COACHING_STYLE);
    assert.deepEqual(body.generationConfig.responseSchema.properties, {
      cue: { type: "STRING" },
      completedReps: { type: "INTEGER" },
    });
    assert.deepEqual(body.contents, [
      { role: "user", parts: [{ text: "existing derived observations" }] },
    ]);
    return response;
  });
  const result = await fetcher(
    "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
    {
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "Original measurement and evidence rules" }],
        },
        generationConfig: {
          responseSchema: {
            properties: {
              cue: { type: "STRING" },
              completedReps: { type: "INTEGER" },
            },
          },
        },
        contents: [
          { role: "user", parts: [{ text: "existing derived observations" }] },
        ],
      }),
    },
  );
  assert.equal(result, response);
  assert.equal(calls, 1);
});

test("an optional Rehab credential is scoped to the provider call and never rewrites Panda's credential", async (t) => {
  const previous = process.env.REHAB_GEMINI_API_KEY;
  const panda = process.env.PANDA_GEMINI_API_KEY;
  process.env.REHAB_GEMINI_API_KEY = "synthetic-rehab-key";
  t.after(() => {
    if (previous === undefined) delete process.env.REHAB_GEMINI_API_KEY;
    else process.env.REHAB_GEMINI_API_KEY = previous;
  });
  const calls: { url: string; headers: Headers }[] = [];
  const fetcher = pandaCoachingFetcher(async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    return new Response("ok");
  });
  await fetcher(
    "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
    { headers: { "x-goog-api-key": "synthetic-panda-key" } },
  );
  await fetcher("https://example.com/other", {
    headers: { "x-example": "untouched" },
  });
  assert.equal(calls[0].headers.get("x-goog-api-key"), "synthetic-rehab-key");
  assert.equal(calls[1].headers.get("x-goog-api-key"), null);
  assert.equal(process.env.PANDA_GEMINI_API_KEY, panda);
});

function pending(
  type: "guided_analysis" | "guided_session_started" | "guided_report_saved",
  sequence = 1,
  sessionId = "session-one",
): PendingExerciseFeedback {
  return {
    requestId: randomUUID(),
    checkinId: "checkin-one",
    event:
      type === "guided_analysis"
        ? { version: "1.0.0", type, sessionId, batchSequence: sequence }
        : { version: "1.0.0", type, sessionId },
  };
}
test("a long patient answer retains only the latest pose update while keeping session/report delivery", () => {
  const started = pending("guided_session_started");
  let queue = [started];
  for (let i = 1; i <= 200; i++)
    queue = queueExerciseFeedback(queue, pending("guided_analysis", i));
  assert.equal(queue.length, 2);
  assert.equal(queue[0], started);
  assert.equal(
    queue[1].event.type === "guided_analysis" && queue[1].event.batchSequence,
    200,
  );
  const other = pending("guided_analysis", 1, "another-session");
  queue = queueExerciseFeedback(queue, other);
  const saved = pending("guided_report_saved");
  queue = queueExerciseFeedback(queue, saved);
  assert.deepEqual(queue, [started, other, saved]);
});

function cue(
  text: string,
  expiry = 100000,
  session = "exercise-one",
): VoiceReply {
  return {
    mode: "connected",
    engine: "checkin_workflow",
    message: text,
    checkin: { id: "checkin-one", stage: "exercise" },
    exerciseSessionId: session,
    exerciseCue: {
      eventId: randomUUID(),
      code: "GEMINI_ANALYSIS",
      expiresAt: new Date(expiry).toISOString(),
    },
  };
}
test("speech cadence suppresses repeated wording, spaces corrections, and allows a later reminder", () => {
  const cadence = new ExerciseCoachingCadence();
  assert.equal(cadence.decide(cue("A little slower."), 1000), "speak");
  assert.equal(cadence.decide(cue("A little slower!"), 7000), "drop");
  assert.equal(cadence.decide(cue("Hold there for a moment."), 2000), "wait");
  assert.equal(cadence.decide(cue("Hold there for a moment."), 7000), "speak");
  assert.equal(cadence.decide(cue("Hold there for a moment."), 28000), "speak");
});
test("stale cues never play and a new exercise session has its own cadence", () => {
  const cadence = new ExerciseCoachingCadence();
  assert.equal(
    cadence.decide(cue("Keep that comfortable pace.", 2000), 2000),
    "drop",
  );
  assert.equal(
    cadence.decide(cue("Keep that comfortable pace."), 3000),
    "speak",
  );
  assert.equal(
    cadence.decide(
      cue("Keep that comfortable pace.", 100000, "exercise-two"),
      3100,
    ),
    "speak",
  );
});
