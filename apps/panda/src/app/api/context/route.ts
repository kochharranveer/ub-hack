import { voice } from "@/server/service";
import { respond } from "@platform/http";
export const dynamic = "force-dynamic";
export function GET() {
  return respond(() => voice.context());
}
