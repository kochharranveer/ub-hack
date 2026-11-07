import { rehab } from "@/server/service";
import { respond } from "@platform/http";
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(async () =>
    rehab.finish((await ctx.params).id, await req.json()),
  );
}
