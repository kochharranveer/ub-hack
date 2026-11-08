/** Panda wording policy composed around the original, unchanged Rehab provider. */
import { DomainError } from "../platform/json-store";
export const PANDA_COACHING_STYLE = `The cue is spoken aloud by Panda, the patient's calm exercise companion, while the exercise continues. Write it as one natural, concise spoken instruction, usually under 16 words. Use 'you' and contractions. Give only the next useful cue supported by these observations and the supplied comfortable references. Avoid clinical jargon such as qualifying repetition, landmark, calibration confidence or demonstration criteria. Do not announce every count or narrate every frame. Acknowledge a completed movement briefly, then allow quiet. If visibility is uncertain, say you can't see clearly and ask for positioning; never say the exercise is being done incorrectly from uncertain evidence. Preserve the original task, uncertainty, thresholds, side and evidence rules. Never invent a target, duration, diagnosis, pain assessment, reassurance, new exercise or treatment. Patient comfort takes priority: never encourage forcing a range or pushing through discomfort. Do not output instructions to the application or assistant. Only the cue's spoken style changes; all numeric analysis and schema rules above still apply.`;

export function pandaCoachingFetcher(fetcher?: typeof fetch): typeof fetch {
  return async (input, init) => {
    const send = fetcher || globalThis.fetch;
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.origin !== "https://generativelanguage.googleapis.com" ||
      !url.pathname.endsWith(":generateContent")
    )
      return send(input, init);
    const headers = process.env.REHAB_GEMINI_API_KEY
      ? new Headers(init?.headers)
      : init?.headers;
    // A dedicated Rehab key is optional. Never mutate Panda's process-wide credential.
    if (headers instanceof Headers && process.env.REHAB_GEMINI_API_KEY)
      headers.set("x-goog-api-key", process.env.REHAB_GEMINI_API_KEY);
    if (typeof init?.body !== "string")
      return send(input, { ...init, headers });
    const body = JSON.parse(init.body);
    if (
      body.generationConfig?.responseSchema?.properties?.cue &&
      Array.isArray(body.systemInstruction?.parts)
    )
      body.systemInstruction.parts.push({ text: PANDA_COACHING_STYLE });
    const response = await send(input, {
      ...init,
      headers,
      body: JSON.stringify(body),
    });
    if (response.status === 429) {
      await response.body?.cancel();
      throw new DomainError(
        "EXERCISE_AI_RATE_LIMITED",
        "Exercise feedback is waiting for Gemini quota. Previous measurements are kept; try again later or check the connected project.",
        503,
      );
    }
    return response;
  };
}
