import { voice } from "@/server/service";
import { respond } from "@platform/http";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return respond(() => voice.context(), req);
}
