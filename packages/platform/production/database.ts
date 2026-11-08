import { Pool, type PoolClient } from "pg";
import { DomainError } from "../json-store";
import { activePatient, identity } from "./context";
export type SqlClient = Pick<PoolClient, "query">;
export interface DatabasePool {
  connect(): Promise<SqlClient & { release(): void }>;
  end(): Promise<void>;
}
const runtime = globalThis as typeof globalThis & {
  __pandaPostgres?: DatabasePool;
};
export function database(): DatabasePool {
  if (runtime.__pandaPostgres) return runtime.__pandaPostgres;
  const raw = process.env.PANDA_DATABASE_URL;
  if (!raw)
    throw new DomainError(
      "NOT_CONFIGURED",
      "PANDA_DATABASE_URL is required.",
      503,
    );
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  // URL sslmode can override pg's SSL object; control it here and verify certificates.
  for (const name of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(name);
  const pool = new Pool({
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(process.env.PANDA_DATABASE_CA
            ? { ca: process.env.PANDA_DATABASE_CA }
            : {}),
        },
  });
  pool.on("error", () =>
    console.error(JSON.stringify({ event: "database_pool_error" })),
  );
  return (runtime.__pandaPostgres = pool);
}
export async function databaseTransaction<T>(
  subject: string,
  patientId: string | null,
  fn: (client: SqlClient) => Promise<T>,
): Promise<T> {
  const client = await database().connect();
  let active = false;
  try {
    await client.query("BEGIN");
    active = true;
    await client.query("SET LOCAL ROLE panda_runtime");
    await client.query("SET LOCAL lock_timeout = '8s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query(
      "SELECT set_config('panda.subject', $1, true), set_config('panda.patient', $2, true)",
      [subject, patientId || ""],
    );
    const result = await fn(client);
    await client.query("COMMIT");
    active = false;
    return result;
  } catch (error) {
    if (active) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
export async function patientTransaction<T>(
  fn: (client: SqlClient, patientId: string) => Promise<T>,
) {
  const actor = identity(),
    patient = activePatient();
  return databaseTransaction(actor.subject, patient, (client) =>
    fn(client, patient),
  );
}
export type Domain = "care" | "rehab" | "voice" | "cv";
const tables = {
  care: "care.patient_state",
  rehab: "rehab.patient_state",
  voice: "voice.patient_state",
  memory: "voice.patient_memory",
  cv: "rehab.cv_state",
} as const;
export class PostgresStore<T> {
  constructor(
    private domain: keyof typeof tables,
    private seed: () => T,
  ) {}
  snapshot(): Promise<T> {
    return patientTransaction(async (client, id) => {
      const out = await client.query(
        "SELECT data FROM " + tables[this.domain] + " WHERE patient_id=$1",
        [id],
      );
      return out.rows[0]?.data ?? this.seed();
    });
  }
  update<R>(fn: (state: T) => R | Promise<R>): Promise<R> {
    return patientTransaction(async (client, id) => {
      await client.query(
        "INSERT INTO " +
          tables[this.domain] +
          " (patient_id,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING",
        [id, JSON.stringify(this.seed())],
      );
      const out = await client.query(
        "SELECT data FROM " +
          tables[this.domain] +
          " WHERE patient_id=$1 FOR UPDATE",
        [id],
      );
      if (!out.rows[0])
        throw new DomainError(
          "FORBIDDEN",
          "Patient access is unavailable.",
          403,
        );
      const state = out.rows[0].data as T;
      const result = await fn(state);
      await client.query(
        "UPDATE " +
          tables[this.domain] +
          " SET data=$2::jsonb,updated_at=now() WHERE patient_id=$1",
        [id, JSON.stringify(state)],
      );
      return result;
    });
  }
}
