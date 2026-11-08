import { readJson } from "@platform/body";
import { care } from "@/server/service";
import { respond } from "@platform/http";
export function POST(req: Request) {
  return respond(async () => care.importPlan(await readJson(req)), req);
}
