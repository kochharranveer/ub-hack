import { z } from "zod";
import { DomainError } from "../../../../packages/platform/json-store";
const Input = z
  .object({
    text: z
      .string()
      .min(1)
      .max(4000)
      .refine((s) => Boolean(s.trim())),
  })
  .strict();
export function speechStatus(): {
  engine: "browser" | "elevenlabs";
  configured: boolean;
} {
  const engine = process.env.PANDA_TTS_MODE || "browser";
  if (engine !== "browser" && engine !== "elevenlabs")
    throw new DomainError(
      "NOT_CONFIGURED",
      "PANDA_TTS_MODE must be browser or elevenlabs.",
      503,
    );
  return {
    engine,
    configured:
      engine === "browser" ||
      Boolean(
        process.env.PANDA_ELEVENLABS_API_KEY &&
        process.env.PANDA_ELEVENLABS_VOICE_ID &&
        process.env.PANDA_ELEVENLABS_MODEL_ID,
      ),
  };
}
export async function synthesize(raw: unknown, signal?: AbortSignal) {
  const { text } = Input.parse(raw);
  const key = process.env.PANDA_ELEVENLABS_API_KEY;
  const voice = process.env.PANDA_ELEVENLABS_VOICE_ID;
  const model = process.env.PANDA_ELEVENLABS_MODEL_ID;
  if (speechStatus().engine !== "elevenlabs" || !key || !voice || !model)
    throw new DomainError(
      "NOT_CONFIGURED",
      "Configure ElevenLabs on the Panda server, or choose browser speech.",
      503,
    );
  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" +
        encodeURIComponent(voice) +
        "?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: /eleven_v[34]/.test(model)
            ? { stability: 0.5 }
            : { stability: 0.4, similarity_boost: 0.75, style: 0, speed: 1 },
        }),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
      },
    );
    if (
      !response.ok ||
      !response.headers.get("content-type")?.toLowerCase().startsWith("audio/")
    )
      throw new DomainError(
        "TTS_UNAVAILABLE",
        "ElevenLabs could not return audio. Retry or choose browser speech.",
        503,
      );
    // Buffer under the timeout so upstream body failures still get a JSON envelope.
    const audio = await response.arrayBuffer();
    if (!audio.byteLength) throw new Error("empty audio");
    return audio;
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError(
      "TTS_UNAVAILABLE",
      "Speech request stopped, failed, or timed out. Text is still available.",
      503,
    );
  }
}

/** Stream raw16-bit mono PCM so playback can start before the sentence is finished. */
export async function streamSpeech(raw: unknown, signal?: AbortSignal) {
  const { text } = Input.parse(raw),
    key = process.env.PANDA_ELEVENLABS_API_KEY,
    voice = process.env.PANDA_ELEVENLABS_VOICE_ID,
    model = process.env.PANDA_ELEVENLABS_MODEL_ID;
  if (speechStatus().engine !== "elevenlabs" || !key || !voice || !model)
    throw new DomainError(
      "NOT_CONFIGURED",
      "Configure ElevenLabs on the Panda server.",
      503,
    );
  const cancel = new AbortController();
  const bounded = AbortSignal.any([
    cancel.signal,
    AbortSignal.timeout(20000),
    ...(signal ? [signal] : []),
  ]);
  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" +
        encodeURIComponent(voice) +
        "/stream?output_format=pcm_24000",
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: /eleven_v[34]/.test(model)
            ? { stability: 0.5 }
            : { stability: 0.4, similarity_boost: 0.75, style: 0, speed: 1 },
        }),
        signal: bounded,
      },
    );
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get("content-type")?.toLowerCase().startsWith("audio/")
    )
      throw new DomainError(
        "TTS_UNAVAILABLE",
        "Speech could not start. Your reply remains available as text.",
        503,
      );
    const reader = response.body.getReader();
    let size = 0;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          size += value.length;
          if (size > 4 * 1024 * 1024) throw Error("Audio limit");
          controller.enqueue(value);
        } catch {
          cancel.abort();
          void reader.cancel().catch(() => {});
          controller.error(new Error("Speech stream interrupted"));
        }
      },
      async cancel() {
        cancel.abort();
        await reader.cancel().catch(() => {});
      },
    });
  } catch (error) {
    cancel.abort();
    if (error instanceof DomainError) throw error;
    throw new DomainError(
      "TTS_UNAVAILABLE",
      "Speech could not start. Your reply remains available as text.",
      503,
    );
  }
}
