import { respond } from "@platform/http";
import { readJson } from "@platform/body";
import { synthesize } from "@/server/speech";
export function POST(req:Request){return respond(async()=>new Response(await synthesize(await readJson(req),req.signal),{headers:{"Content-Type":"audio/mpeg","Cache-Control":"no-store","X-Panda-Speech":"elevenlabs"}}),req);}
