import { checkins } from "@/server/checkin";
import { respond } from "@platform/http";
export const dynamic="force-dynamic";
export function GET() { return respond(()=>checkins.memory()); }
export function DELETE(req:Request) { return respond(async()=>checkins.forget(await req.json())); }
