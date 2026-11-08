import { readJson } from "@platform/body";
import { rehab } from "@/server/service";
import { getCare } from "@platform/peers";
import { respond } from "@platform/http";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return respond(() => rehab.reports(), req);
}
export function POST(req: Request) {
  return respond(async () => rehab.start(await readJson(req), await getCare()), req);
}
