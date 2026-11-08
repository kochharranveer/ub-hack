import { checkins } from "@/server/checkin";
import { respond } from "@platform/http";
export function POST(req:Request) { return respond(async()=>checkins.continueAfterConfirmation(await req.json())); }
