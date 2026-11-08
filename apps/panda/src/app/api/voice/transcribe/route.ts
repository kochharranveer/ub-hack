import { transcribe } from "@/server/transcription";
import { respond } from "@platform/http";
export function POST(req:Request){return respond(async()=>({text:await transcribe(await req.formData(),req.signal)}));}
