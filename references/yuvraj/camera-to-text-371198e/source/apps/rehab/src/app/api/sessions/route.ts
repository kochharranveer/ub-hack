import { rehab } from "@/server/service";
import { getCare } from "@platform/peers";
import { respond } from "@platform/http";
export const dynamic = "force-dynamic";
export function GET() {
  return respond(() => rehab.reports());
}
export function POST(req: Request) {
  return respond(async () => rehab.start(await req.json(), await getCare()));
}
