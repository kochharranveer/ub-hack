import { readJson } from "@platform/body";
import { checkins } from "@/server/checkin";
import { respond } from "@platform/http";
export function POST(req:Request) { return respond(async()=>checkins.start(await readJson(req),req.signal), req); }
