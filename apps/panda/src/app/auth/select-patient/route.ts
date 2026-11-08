import { z } from "zod";
import { readJson } from "@platform/body";
import { respond } from "@platform/http";
import { identity, requireRole } from "@platform/production/context";
import { assignedPatients } from "@platform/production/accounts";
import { DomainError } from "@platform/json-store";
export function POST(req: Request) {
  return respond(async () => {
    requireRole("clinician");
    const { patientId } = z
      .object({ patientId: z.string().uuid() })
      .strict()
      .parse(await readJson(req));
    if (!(await assignedPatients(identity())).includes(patientId))
      throw new DomainError(
        "FORBIDDEN",
        "This patient is not assigned to you.",
        403,
      );
    return Response.json(
      { ok: true, data: { selected: true } },
      {
        headers: {
          "Set-Cookie":
            "panda-patient=" +
            patientId +
            "; Path=/; HttpOnly; Secure; SameSite=Lax",
        },
      },
    );
  }, req);
}
