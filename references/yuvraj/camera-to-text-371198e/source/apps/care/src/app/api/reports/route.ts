import { getReports } from "@platform/peers";
import { respond } from "@platform/http";
export const dynamic = "force-dynamic";
export function GET() {
  return respond(() => getReports());
}
