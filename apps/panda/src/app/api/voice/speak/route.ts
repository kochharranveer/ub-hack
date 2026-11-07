import { z } from "zod";
import { respond } from "@platform/http";
import { DomainError } from "@platform/json-store";
const Input = z.object({ text: z.string().min(1).max(4000) }).strict();
// Demo-only. Add authenticated actor checks, per-user quotas and consent records before deployment.
export async function POST(req: Request) {
  let audio: Response | undefined;
  const validation = await respond(async () => {
    const { text } = Input.parse(await req.json());
    const key = process.env.PANDA_ELEVENLABS_API_KEY,
      voice = process.env.PANDA_ELEVENLABS_VOICE_ID,
      model = process.env.PANDA_ELEVENLABS_MODEL_ID;
    if (process.env.PANDA_TTS_MODE !== "elevenlabs" || !key || !voice || !model)
      throw new DomainError(
        "NOT_CONFIGURED",
        "Configure ElevenLabs on the Panda server, or use browser speech.",
        503,
      );
    audio = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" +
        encodeURIComponent(voice) +
        "?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: model }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!audio.ok)
      throw new DomainError(
        "TTS_UNAVAILABLE",
        "ElevenLabs rejected the request.",
        503,
      );
    return null;
  });
  if (!audio?.ok) return validation;
  return new Response(audio.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Panda-Speech": "elevenlabs",
    },
  });
}
