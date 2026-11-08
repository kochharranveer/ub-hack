import { productionEnabled } from "../../../../packages/platform/production/config";
import { postgresMemoryTransaction } from "./postgres-memory";
import { DatabaseSync } from "node:sqlite";
import { mkdir, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { CheckinSession, PatientMemoryEvent, MemoryKind, ConversationTurn } from "../../../../packages/contracts/checkin";
import { DomainError } from "../../../../packages/platform/json-store";
import { voiceDatabaseFile } from "./repository";
type Receipt = { fingerprint: string; result: unknown };
export interface MemoryTransaction {
  session(id: string): CheckinSession | undefined;
  latestSession(): CheckinSession | undefined;
  saveSession(session: CheckinSession): void;
  append(event: PatientMemoryEvent): void;
  events(kind?: MemoryKind, limit?: number): PatientMemoryEvent[];
  count(): number;
  receipt(id: string): Receipt | undefined;
  saveReceipt(id: string, payload: unknown, result: unknown): void;
  dialogue(limit?:number): ConversationTurn[];
  appendDialogue(turn:ConversationTurn):void;
  forget(): void;
}
const state = globalThis as typeof globalThis & { __patientMemoryQueues?: Map<string, Promise<unknown>> };
const queues = state.__patientMemoryQueues ??= new Map();
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class PatientMemoryRepository {
  constructor(readonly file = path.join(path.dirname(voiceDatabaseFile()), "patient-memory.sqlite")) {}
  transaction<T>(patientId: string, fn: (tx: MemoryTransaction) => T | Promise<T>): Promise<T> {
    if(productionEnabled())return postgresMemoryTransaction(patientId,fn);
    const file = path.resolve(this.file);
    const work = (queues.get(file) ?? Promise.resolve()).then(async () => {
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const db = new DatabaseSync(file);
      let active = false;
      try {
        await chmod(file, 0o600);
        db.exec(`
          PRAGMA journal_mode=WAL;
          CREATE TABLE IF NOT EXISTS voice_patient_events (
            patient_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, at TEXT NOT NULL,
            PRIMARY KEY(patient_id,id)
          );
          CREATE INDEX IF NOT EXISTS voice_patient_events_lookup ON voice_patient_events(patient_id,kind,at);
          CREATE TABLE IF NOT EXISTS voice_checkins (
            id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS voice_checkins_patient ON voice_checkins(patient_id,updated_at);
          CREATE TABLE IF NOT EXISTS voice_checkin_receipts (
            patient_id TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL,
            PRIMARY KEY(patient_id,id)
          );
          CREATE TABLE IF NOT EXISTS voice_dialogue_turns (
            patient_id TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,at TEXT NOT NULL,
            PRIMARY KEY(patient_id,id)
          );
          CREATE INDEX IF NOT EXISTS voice_dialogue_patient ON voice_dialogue_turns(patient_id,at);
        `);
        db.exec("BEGIN IMMEDIATE"); active = true;
        const parse = <T>(row: Record<string, unknown> | undefined) => row ? JSON.parse(String(row.data)) as T : undefined;
        const tx: MemoryTransaction = {
          session(id) { return parse<CheckinSession>(db.prepare("SELECT data FROM voice_checkins WHERE patient_id=? AND id=?").get(patientId,id)); },
          latestSession() { return parse<CheckinSession>(db.prepare("SELECT data FROM voice_checkins WHERE patient_id=? ORDER BY updated_at DESC,rowid DESC LIMIT 1").get(patientId)); },
          saveSession(value) {
            if (value.patientId !== patientId) throw new DomainError("FORBIDDEN","Patient mismatch",403);
            db.prepare("INSERT INTO voice_checkins VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE patient_id=excluded.patient_id")
              .run(value.id,patientId,JSON.stringify(value),value.updatedAt);
          },
          append(value) {
            if (value.patientId !== patientId) throw new DomainError("FORBIDDEN","Patient mismatch",403);
            db.prepare("INSERT OR IGNORE INTO voice_patient_events VALUES (?,?,?,?,?)").run(patientId,value.id,value.kind,JSON.stringify(value),value.at);
          },
          events(kind,limit=50) {
            const rows = kind
              ? db.prepare("SELECT data FROM voice_patient_events WHERE patient_id=? AND kind=? ORDER BY at DESC,rowid DESC LIMIT ?").all(patientId,kind,Math.min(limit,200))
              : db.prepare("SELECT data FROM voice_patient_events WHERE patient_id=? ORDER BY at DESC,rowid DESC LIMIT ?").all(patientId,Math.min(limit,200));
            return rows.map(row => JSON.parse(String(row.data)) as PatientMemoryEvent);
          },
          count() { return Number(db.prepare("SELECT count(*) AS n FROM voice_patient_events WHERE patient_id=?").get(patientId)!.n); },
          receipt(id) {
            const row = db.prepare("SELECT fingerprint,result FROM voice_checkin_receipts WHERE patient_id=? AND id=?").get(patientId,id);
            return row ? {fingerprint:String(row.fingerprint),result:JSON.parse(String(row.result))} : undefined;
          },
          saveReceipt(id,payload,result) {
            db.prepare("INSERT INTO voice_checkin_receipts VALUES (?,?,?,?)").run(patientId,id,fingerprint(payload),JSON.stringify(result));
          },
          dialogue(limit=40) {
            return db.prepare("SELECT data FROM voice_dialogue_turns WHERE patient_id=? ORDER BY at DESC,rowid DESC LIMIT ?")
              .all(patientId,Math.min(limit,200)).reverse().map(row=>JSON.parse(String(row.data)) as ConversationTurn);
          },
          appendDialogue(turn) {
            if(!tx.session(turn.checkinId))throw new DomainError("FORBIDDEN","Conversation does not belong to this patient.",403);
            db.prepare("INSERT OR IGNORE INTO voice_dialogue_turns VALUES(?,?,?,?)").run(patientId,turn.id,JSON.stringify(turn),turn.at);
          },
          forget() {
            for (const table of ["voice_patient_events","voice_checkins","voice_checkin_receipts","voice_dialogue_turns"])
              db.prepare("DELETE FROM " + table + " WHERE patient_id=?").run(patientId);
          },
        };
        const result = await fn(tx);
        db.exec("COMMIT"); active=false;
        return result;
      } catch(e) {
        if (active) db.exec("ROLLBACK");
        if (e instanceof Error && /database is locked|database is busy/.test(e.message))
          throw new DomainError("STORAGE_BUSY","Patient memory is busy. Retry with the same request ID.",503);
        throw e;
      } finally { db.close(); }
    });
    const tail = work.catch(() => {});
    queues.set(file,tail);
    void tail.finally(() => {if (queues.get(file) === tail) queues.delete(file);});
    return work;
  }
  async snapshot(patientId: string) {
    return this.transaction(patientId, tx => ({ patientId, retention:"until_deleted" as const, totalEvents:tx.count(), events:tx.events(), transcript:tx.dialogue(100),checkin:tx.latestSession() ?? null }));
  }
  async prompt(patientId: string) {
    const snapshot = await this.snapshot(patientId);
    return JSON.stringify({retention:snapshot.retention,totalEvents:snapshot.totalEvents,
      entries:snapshot.events.slice(0,16).map(event => ({kind:event.kind,quote:event.quote.slice(0,500),at:event.at,source:event.source,metadata:event.metadata}))});
  }
  async recall(patientId: string) {
    return this.transaction(patientId,tx=>{
      const kinds:MemoryKind[]=["wellbeing","medication_context","medication_report","food","scheduling_pending","exercise_readiness","exercise_feedback","exercise_report","exercise_review","pain_review"];
      const byKind=Object.fromEntries(kinds.map(kind=>[kind,tx.events(kind,20)])) as Record<MemoryKind,PatientMemoryEvent[]>;
      return {patientId,totalEvents:tx.count(),events:tx.events(),byKind};
    });
  }
}
export const patientMemory = new PatientMemoryRepository();
