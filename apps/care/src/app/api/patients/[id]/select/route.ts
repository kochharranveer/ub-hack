import { selectPatientRecord } from "@/server/patient-portal";
import { respond } from "@platform/http";

export function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(async () => selectPatientRecord((await ctx.params).id));
}
