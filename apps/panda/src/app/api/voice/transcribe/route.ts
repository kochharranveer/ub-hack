import { transcribe } from "@/server/transcription";
import { readFormData } from "@platform/body";
import { respond } from "@platform/http";
export function POST(req:Request){return respond(async()=>({text:await transcribe(await readFormData(req),req.signal)}),req);}
