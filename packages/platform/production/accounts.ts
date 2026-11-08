import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError } from "../json-store";
import { databaseTransaction } from "./database";
import type { Identity } from "./context";
const uuid = z.string().uuid();
export async function accountIdentity(
  subject: string,
  displayName: string,
  selected: string | undefined,
  accessToken: string,
  invited = false,
): Promise<Identity> {
  uuid.parse(subject);
  if (selected && !uuid.safeParse(selected).success)
    throw new DomainError("FORBIDDEN", "Invalid patient selection.", 403);
  return databaseTransaction(subject, null, async (client) => {
    if (invited)
      await client.query(
        "INSERT INTO panda_identity.principals(subject,display_name) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [subject, displayName.slice(0, 100)],
      );
    const principal = (
      await client.query(
        "SELECT role,display_name FROM panda_identity.principals WHERE subject=$1",
        [subject],
      )
    ).rows[0];
    if (!principal)
      throw new DomainError(
        "FORBIDDEN",
        "Your care team needs to activate this account before you can use Panda.",
        403,
      );
    const grants =
      principal.role === "clinician"
        ? (
            await client.query(
              "SELECT patient_id FROM panda_identity.patient_grants WHERE subject=$1 ORDER BY patient_id",
              [subject],
            )
          ).rows.map((row) => String(row.patient_id))
        : [];
    const patientId =
      selected || (principal.role === "patient" ? subject : grants[0] || null);
    if (
      patientId &&
      (principal.role === "patient"
        ? patientId !== subject
        : !grants.includes(patientId))
    )
      throw new DomainError(
        "FORBIDDEN",
        "This patient is not assigned to your account.",
        403,
      );
    return {
      subject,
      patientId,
      role: principal.role,
      displayName: principal.display_name,
      accessToken,
      requestId: randomUUID(),
    };
  });
}
export async function assignedPatients(actor: Identity) {
  return databaseTransaction(actor.subject, null, async (client) =>
    actor.role === "patient"
      ? [actor.subject]
      : (
          await client.query(
            "SELECT patient_id FROM panda_identity.patient_grants WHERE subject=$1 ORDER BY patient_id",
            [actor.subject],
          )
        ).rows.map((row) => String(row.patient_id)),
  );
}
