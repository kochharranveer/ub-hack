import { signIn, signOut } from "@platform/production/auth-routes";
import { identity } from "@platform/production/context";
import { assignedPatients } from "@platform/production/accounts";
import { respond } from "@platform/http";
export const POST = signIn;
export const DELETE = signOut;
export function GET(req: Request) {
  return respond(async () => {
    const actor = identity();
    return {
      role: actor.role,
      displayName: actor.displayName,
      patientId: actor.patientId,
      patients: await assignedPatients(actor),
    };
  }, req);
}
