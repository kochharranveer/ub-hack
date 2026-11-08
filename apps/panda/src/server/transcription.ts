import { z } from "zod";
import { DomainError } from "../../../../packages/platform/json-store";
const Transcript=z.object({text:z.string().trim().min(1).max(2000)});
export async function transcribe(form:FormData,signal?:AbortSignal) {
  if ([...form.keys()].some(key=>key!=="file")) throw new DomainError("VALIDATION_ERROR","Only a microphone audio file is accepted.",400);
  const file=form.get("file");
  if (!(file instanceof Blob) || !file.size || file.size>10*1024*1024 || !/^(audio\/(webm|mp4|ogg|wav|mpeg|x-wav)|video\/webm)(;|$)/i.test(file.type))
    throw new DomainError("VALIDATION_ERROR","Provide a supported audio recording under 10 MB.",400);
  const key=process.env.PANDA_ELEVENLABS_API_KEY;
  if (!key) throw new DomainError("NOT_CONFIGURED","ElevenLabs transcription is not configured. Use the keyboard.",503);
  const data=new FormData();
  data.set("model_id",process.env.PANDA_STT_MODEL||"scribe_v2");
  data.set("file",file,"microphone."+(/mp4/.test(file.type)?"mp4":/mpeg/.test(file.type)?"mp3":"webm"));
  data.set("tag_audio_events","false");
  data.set("diarize","false");
  try {
    const response=await fetch("https://api.elevenlabs.io/v1/speech-to-text",{
      method:"POST",headers:{"xi-api-key":key},body:data,
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new DomainError("STT_UNAVAILABLE","Speech transcription failed. Check ElevenLabs speech-to-text access or use the keyboard.",503);
    return Transcript.parse(await response.json()).text;
  } catch(e) {
    if(e instanceof DomainError)throw e;
    throw new DomainError("STT_UNAVAILABLE","Speech could not be transcribed. Retry or use the keyboard.",503);
  }
}
