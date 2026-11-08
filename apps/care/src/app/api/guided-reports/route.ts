import { respond } from "@platform/http";
import { getGuidedReports } from "@platform/guided-rehab";
import { care } from "@/server/service";
export const dynamic="force-dynamic";
export function GET(req:Request){return respond(async()=>{const current=await care.snapshot();return (await getGuidedReports()).filter(report=>report.careReference?.patientId===current.patientId);},req);}
