import { rehab } from "@/server/service";
import { respond } from "@platform/http";
import { getCare } from "@platform/peers";
import { DomainError } from "@platform/json-store";
export function GET(req:Request,context:{params:Promise<{id:string}>}) {
  return respond(async()=>{
    const session=await rehab.session((await context.params).id);
    if (session.patientId!==(await getCare()).patientId) throw new DomainError("FORBIDDEN","Patient mismatch",403);
    return session;
  }, req);
}
