import { respond } from "@platform/http";
import { productionEnabled } from "@platform/production/config";
import { identity } from "@platform/production/context";
export const dynamic="force-dynamic";
export function GET(req:Request){return respond(()=>({role:productionEnabled()?identity().role:"clinician",runtime:productionEnabled()?"production":"demo"}),req);}
