import { DomainError } from "../json-store";
import { databaseTransaction } from "./database";
import type { Identity } from "./context";
export async function consumeLimit(
  actor: Identity,
  path: string,
  method: string,
) {
  const guidedGeneration=/^\/rehab\/api\/cv\/v1\/sessions\/[^/]+\/feedback\/[^/]+\/generate$/.test(path);
  const provider = guidedGeneration ||
    /^\/api\/voice\/(?:turn|checkin\/(?:start|answer|continue)|speak|transcribe)$/.test(
      path,
    );
  const bucket = provider ? "provider" : "api";
  const minute = provider ? 45 : 240;
  const day = provider ? 500 : 10000;
  await databaseTransaction(actor.subject, actor.patientId, async (client) => {
    for (const [seconds, max] of [
      [60, minute],
      [86400, day],
    ]) {
      const window = Math.floor(Date.now() / 1000 / seconds) * seconds;
      const out = await client.query(
        "INSERT INTO panda_platform.rate_limits(subject,bucket,window_start,count) VALUES($1,$2,$3,1) ON CONFLICT(subject,bucket,window_start) DO UPDATE SET count=panda_platform.rate_limits.count+1 RETURNING count",
        [actor.subject, bucket + ":" + seconds, window],
      );
      if (Number(out.rows[0].count) > max)
        throw new DomainError(
          "RATE_LIMITED",
          "You've reached Panda's request limit. Please try again later.",
          429,
        );
    }
    await client.query(
      "DELETE FROM panda_platform.rate_limits WHERE subject=$1 AND window_start<$2",
      [actor.subject, Math.floor(Date.now() / 1000) - 172800],
    );
    await client.query(
      "INSERT INTO panda_platform.audit(id,subject,patient_id,event) VALUES($1,$2,$3,$4)",
      [
        actor.requestId,
        actor.subject,
        actor.patientId,
        method + " " + path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id"),
      ],
    );
  });
}
export async function finishAudit(actor: Identity, status: number) {
  await databaseTransaction(actor.subject, actor.patientId, (client) =>
    client.query("UPDATE panda_platform.audit SET status=$2 WHERE id=$1", [
      actor.requestId,
      status,
    ]),
  );
}
