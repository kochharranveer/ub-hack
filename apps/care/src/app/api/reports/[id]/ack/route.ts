import { care } from "@/server/service";
import { getReports } from "@platform/peers";
import { DomainError } from "@platform/json-store";
import { respond } from "@platform/http";
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const id = (await ctx.params).id;
    const report = (await getReports()).find((r) => r.sessionId === id);
    if (!report)
      throw new DomainError("NOT_FOUND", "Saved report not found", 404);
    return care.acknowledgeReport(report, await req.json());
  });
}
