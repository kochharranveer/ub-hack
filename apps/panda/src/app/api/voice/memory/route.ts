import { readJson } from "@platform/body";
import { checkins } from "@/server/checkin";
import { respond } from "@platform/http";
export const dynamic="force-dynamic";
export function GET(req: Request) { return respond(()=>checkins.memory(), req); }
export function DELETE(req:Request) { return respond(async()=>checkins.forget(await readJson(req)), req); }
