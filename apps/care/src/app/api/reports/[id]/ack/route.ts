import { getGuidedSession } from "@platform/guided-rehab";
import { readJson } from "@platform/body";
import { care } from "@/server/service";
import { getReports } from "@platform/peers";
import { DomainError } from "@platform/json-store";
import { respond } from "@platform/http";
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const id = (await ctx.params).id;
    let report: {sessionId:string;patientId:string}|undefined = (await getReports()).find((r) => r.sessionId === id);
    if(!report){const guided=await getGuidedSession(id);if(guided.report&&guided.careReference)report={sessionId:id,patientId:guided.careReference.patientId};}
    if (!report)
      throw new DomainError("NOT_FOUND", "Saved report not found", 404);
    return care.acknowledgeReport(report, await readJson(req));
  }, req);
}
