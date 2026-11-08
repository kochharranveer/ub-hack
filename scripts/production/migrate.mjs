import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
const url = process.env.PANDA_MIGRATION_DATABASE_URL;
if (!url)
  throw Error(
    "Set PANDA_MIGRATION_DATABASE_URL privately; never use the runtime login for migrations",
  );
const parsed = new URL(url);
const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
  parsed.searchParams.delete(key);
const pool = new Pool({
  connectionString: parsed.toString(),
  ssl: local
    ? false
    : {
        rejectUnauthorized: true,
        ...(process.env.PANDA_DATABASE_CA
          ? { ca: process.env.PANDA_DATABASE_CA }
          : {}),
      },
  max: 1,
});
const client = await pool.connect();
try {
  await client.query("CREATE SCHEMA IF NOT EXISTS panda_migrations");
  await client.query(
    "CREATE TABLE IF NOT EXISTS panda_migrations.history(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await client.query("SELECT pg_advisory_lock(hashtext('panda_migrations'))");
  for (const name of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const previous = await client.query(
      "SELECT 1 FROM panda_migrations.history WHERE name=$1",
      [name],
    );
    if (previous.rows.length) continue;
    if (
      name.endsWith("_production.sql") &&
      (
        await client.query(
          "SELECT to_regclass('panda_platform.releases') AS installed",
        )
      ).rows[0].installed
    ) {
      console.log(
        "Existing hosted production schema detected; baseline history before using this migrator.",
      );
      throw Error("Baseline required");
    }
    await client.query("BEGIN");
    try {
      await client.query(await readFile("supabase/migrations/" + name, "utf8"));
      await client.query(
        "INSERT INTO panda_migrations.history(name) VALUES($1)",
        [name],
      );
      await client.query("COMMIT");
      console.log("Applied", name);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await client
    .query("SELECT pg_advisory_unlock(hashtext('panda_migrations'))")
    .catch(() => {});
  client.release();
  await pool.end();
}
