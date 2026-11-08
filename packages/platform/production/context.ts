import { AsyncLocalStorage } from "node:async_hooks";
import { DomainError } from "../json-store";
import { productionEnabled } from "./config";
export type Identity = {
  subject: string;
  patientId: string | null;
  role: "patient" | "clinician";
  displayName: string;
  accessToken: string;
  requestId: string;
};
const runtime = globalThis as typeof globalThis & {
  __pandaIdentity?: AsyncLocalStorage<Identity>;
};
export const identityScope = (runtime.__pandaIdentity ??=
  new AsyncLocalStorage<Identity>());
export function identity() {
  const actor = identityScope.getStore();
  if (!actor) throw new DomainError("UNAUTHENTICATED", "Please sign in.", 401);
  return actor;
}
export function activePatient() {
  const patient = identity().patientId;
  if (!patient)
    throw new DomainError(
      "FORBIDDEN",
      "Your care team account has no assigned patient. Ask an administrator to grant access.",
      403,
    );
  return patient;
}
export function actorId(demo: string) {
  return productionEnabled() ? identity().subject : demo;
}
export function requireRole(role: Identity["role"]) {
  if (productionEnabled() && identity().role !== role)
    throw new DomainError(
      "FORBIDDEN",
      role === "clinician"
        ? "This action requires an assigned clinician."
        : "This action belongs to the patient account.",
      403,
    );
}
