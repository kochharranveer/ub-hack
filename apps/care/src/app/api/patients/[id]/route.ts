import { getPatientRecord, updatePatientRecord } from "@/server/patient-portal";
import { respond } from "@platform/http";

export const dynamic = "force-dynamic";

export function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(async () => getPatientRecord((await ctx.params).id));
}

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(async () => updatePatientRecord((await ctx.params).id, await req.json()));
}
