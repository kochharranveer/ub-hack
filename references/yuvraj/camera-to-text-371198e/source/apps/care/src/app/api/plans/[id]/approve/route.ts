import { care } from "@/server/service";
import { respond } from "@platform/http";
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(async () =>
    care.approve((await ctx.params).id, await req.json()),
  );
}
