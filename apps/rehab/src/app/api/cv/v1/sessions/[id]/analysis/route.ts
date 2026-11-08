import { cv } from "@/server/cv/service";
import { cvRespond } from "@/server/cv/http";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return cvRespond(req,actor=>cv.analysis(actor.subject,id));}
