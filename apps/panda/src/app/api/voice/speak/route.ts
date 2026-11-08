import { respond } from "@platform/http";
import { readJson } from "@platform/body";
import { synthesize,streamSpeech } from "@/server/speech";
export function POST(req:Request){return respond(async()=>{
 const body=await readJson(req);
 if(req.headers.get("accept")?.includes("audio/pcm"))return new Response(await streamSpeech(body,req.signal),{headers:{"Content-Type":"audio/pcm","X-Panda-Audio-Rate":"24000","Cache-Control":"no-store, no-transform","X-Accel-Buffering":"no"}});
 return new Response(await synthesize(body,req.signal),{headers:{"Content-Type":"audio/mpeg","Cache-Control":"no-store","X-Panda-Speech":"elevenlabs"}});
},req);}
