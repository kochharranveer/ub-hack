import { readJson } from "@platform/body";
import { voice } from "@/server/service";
import { respond } from "@platform/http";
export function POST(req: Request) { return respond(async () => voice.cancel(await readJson(req)), req); }
