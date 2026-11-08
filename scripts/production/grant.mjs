import { Pool } from "pg";
import { z } from "zod";
const [subject, patient] = process.argv.slice(2);
z.string().uuid().parse(subject);
if (patient) z.string().uuid().parse(patient);
const raw = process.env.PANDA_MIGRATION_DATABASE_URL;
if (!raw)
  throw Error(
    "This administrative command requires PANDA_MIGRATION_DATABASE_URL, never browser credentials",
  );
const url = new URL(raw);
const local = ["localhost", "127.0.0.1"].includes(url.hostname);
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
  url.searchParams.delete(key);
const pool = new Pool({
  connectionString: url.toString(),
  max: 1,
  ssl: local
    ? false
    : {
        rejectUnauthorized: true,
        ...(process.env.PANDA_DATABASE_CA
          ? { ca: process.env.PANDA_DATABASE_CA }
          : {}),
      },
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const user = await client.query(
    "SELECT id FROM auth.users WHERE id=$1 AND email_confirmed_at IS NOT NULL",
    [subject],
  );
  if (!user.rows.length)
    throw Error("Clinician must be an existing verified Supabase account");
  await client.query(
    "INSERT INTO panda_identity.principals(subject,role) VALUES($1,'clinician') ON CONFLICT(subject) DO UPDATE SET role='clinician'",
    [subject],
  );
  if (patient) {
    const user = await client.query(
      "SELECT id FROM auth.users WHERE id=$1 AND email_confirmed_at IS NOT NULL",
      [patient],
    );
    if (!user.rows.length)
      throw Error("Patient must have an existing Supabase account");
    await client.query(
      "INSERT INTO panda_identity.principals(subject) VALUES($1) ON CONFLICT DO NOTHING",
      [patient],
    );
    await client.query(
      "INSERT INTO panda_identity.patient_grants(subject,patient_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [subject, patient],
    );
  }
  await client.query("COMMIT");
  console.log("Clinician access updated. No invitation or message was sent.");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
