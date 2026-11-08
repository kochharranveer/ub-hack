import { listPatientRows } from "@/server/patient-portal";
import { respond } from "@platform/http";

export const dynamic = "force-dynamic";

export function GET() {
  return respond(listPatientRows);
}
