import { listCarePlanOptions } from "@/server/fhir";
import { respond } from "@platform/http";

export function GET() {
  return respond(listCarePlanOptions);
}
