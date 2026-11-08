import { getCare } from "@platform/peers";
import { respond } from "@platform/http";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return respond(() => getCare(), req);
}
