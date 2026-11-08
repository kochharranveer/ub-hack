import { cv } from "@/server/cv/service";
import { cvRespond } from "@/server/cv/http";
export const dynamic="force-dynamic";
export function GET(req:Request,ctx:{params:Promise<{id:string;eventId:string}>}){return cvRespond(req,async actor=>{const {id,eventId}=await ctx.params;return cv.feedback(actor.subject,id,eventId);});}
