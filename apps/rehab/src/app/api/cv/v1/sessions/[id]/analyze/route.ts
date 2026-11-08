import { cv } from "@/server/cv/service";
import { cvRespond,readBody } from "@/server/cv/http";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return cvRespond(req,async actor=>cv.analyze(actor.subject,id,await readBody(req)));}
