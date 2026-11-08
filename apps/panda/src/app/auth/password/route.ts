import { currentAuth } from "@platform/production/auth";
import { Password } from "@platform/production/auth-routes";
import { readJson } from "@platform/body";
import { respond } from "@platform/http";
import { DomainError } from "@platform/json-store";
export function POST(req: Request) {
  return respond(async () => {
    const auth = currentAuth();
    const { error } = await auth.client.auth.updateUser(
      Password.parse(await readJson(req)),
    );
    if (error)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Password could not be changed. Use at least 12 characters or request a fresh recovery link.",
        400,
      );
    return auth.apply(Response.json({ ok: true, data: { updated: true } }));
  }, req);
}
