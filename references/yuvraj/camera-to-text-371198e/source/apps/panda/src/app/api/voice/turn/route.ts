import { voice } from "@/server/service";
import { respond } from "@platform/http";
export function POST(req: Request) {
  return respond(async () => voice.turn(await req.json()));
}
