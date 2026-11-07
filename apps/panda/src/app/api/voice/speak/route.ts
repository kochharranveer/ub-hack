import { respond } from "@platform/http";
import { synthesize } from "@/server/speech";
export async function POST(req: Request) {
  let audio: ArrayBuffer | undefined;
  const validation = await respond(async () => {
    audio = await synthesize(await req.json(), req.signal);
    return null;
  });
  if (!audio) return validation;
  return new Response(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Panda-Speech": "elevenlabs" },
  });
}
