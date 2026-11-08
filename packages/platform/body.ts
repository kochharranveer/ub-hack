import { DomainError } from "./json-store";
async function boundedBody(req:Request,max:number){
  if(Number(req.headers.get("content-length")||0)>max)throw new DomainError("PAYLOAD_TOO_LARGE","Request is too large.",413);
  if(!req.body)return new Uint8Array();
  const reader=req.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new DomainError("PAYLOAD_TOO_LARGE","Request is too large.",413);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function readJson(req:Request,max=32768){if(!req.headers.get("content-type")?.includes("application/json"))throw new DomainError("VALIDATION_ERROR","Use an application/json request.",400);return JSON.parse(new TextDecoder().decode(await boundedBody(req,max))) as unknown;}
export async function readFormData(req:Request){const bytes=await boundedBody(req,10*1024*1024+65536);return new Response(bytes,{headers:{"Content-Type":req.headers.get("content-type")||""}}).formData();}
