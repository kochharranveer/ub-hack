import { getReports } from "@platform/peers";
import { respond } from "@platform/http";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return respond(() => getReports(), req);
}
