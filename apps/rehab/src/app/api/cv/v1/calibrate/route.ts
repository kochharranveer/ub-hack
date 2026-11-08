import { cv } from "@/server/cv/service";
import { cvRespond,readBody } from "@/server/cv/http";
export function POST(req:Request){return cvRespond(req,async actor=>cv.calibrate(actor.subject,await readBody(req)));}
