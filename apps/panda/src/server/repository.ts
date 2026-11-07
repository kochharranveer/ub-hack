import { DatabaseSync } from "node:sqlite";
import { mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import type { VoiceCommand, VoiceReply } from "../../../../packages/contracts/voice";
import { DomainError } from "../../../../packages/platform/json-store";

export type Proposal = {
  id: string;
  command: VoiceCommand;
  patientId: string;
  planId: string;
  planVersion: number;
  expiresAt: number;
  engine: VoiceReply["engine"];
  mode: VoiceReply["mode"];
  confirmedAt?: number;
  result?: VoiceReply;
};
export type Turn = { requestId: string; text: string; reply: VoiceReply; at: string };
type Receipt = { fingerprint: string; result: VoiceReply };
export interface VoiceTransaction {
  receipt(id: string): Receipt | undefined;
  saveTurn(turn: Turn, fingerprint: string): void;
  proposal(id: string): Proposal | undefined;
  saveProposal(proposal: Proposal): void;
  history(): Turn[];
}
export interface VoiceRepository {
  transaction<T>(fn: (tx: VoiceTransaction) => Promise<T> | T): Promise<T>;
}
const runtime = globalThis as typeof globalThis & { __voiceQueues?: Map<string, Promise<unknown>> };
const queues = (runtime.__voiceQueues ??= new Map());
export const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_RECEIPTS = 1000;

/** Local single-host repository. SQLite transactions include receipt + proposal + turn.
 * A second process gets a retryable busy error, never a partially committed write.
 * Care is a separate HTTP transaction: its stable proposal request ID handles recovery.
 */
export class SqliteVoiceRepository implements VoiceRepository {
  constructor(readonly file: string, private now = Date.now) {}

  transaction<T>(fn: (tx: VoiceTransaction) => Promise<T> | T): Promise<T> {
    const key = path.resolve(this.file);
    const work = (queues.get(key) ?? Promise.resolve()).then(async () => {
      await mkdir(path.dirname(key), { recursive: true, mode: 0o700 });
      const db = new DatabaseSync(key);
      let active = false;
      try {
        await chmod(key, 0o600);
        db.exec(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS voice_sessions (
            id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS voice_turns (
            request_id TEXT PRIMARY KEY, text TEXT NOT NULL, reply TEXT NOT NULL, at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS voice_receipts (
            request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL, at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS voice_proposals (
            id TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL, at INTEGER NOT NULL
          );
        `);
        db.exec("BEGIN IMMEDIATE");
        active = true;
        const now = this.now();
        const cutoff = now - RETENTION_MS;
        for (const table of ["voice_turns", "voice_receipts", "voice_proposals"])
          db.prepare(`DELETE FROM ${table} WHERE at < ?`).run(cutoff);
        db.prepare("DELETE FROM voice_sessions WHERE updated_at < ?").run(cutoff);
        const tx: VoiceTransaction = {
          receipt(id) {
            const row = db.prepare("SELECT fingerprint, result FROM voice_receipts WHERE request_id = ?").get(id);
            return row ? { fingerprint: String(row.fingerprint), result: JSON.parse(String(row.result)) } : undefined;
          },
          saveTurn(turn, fingerprint) {
            const count = db.prepare("SELECT count(*) AS n FROM voice_receipts").get()!;
            if (Number(count.n) >= MAX_RECEIPTS)
              throw new DomainError("STORAGE_LIMIT", "Demo conversation capacity reached. Retry after retention expires.", 503);
            db.prepare("INSERT INTO voice_receipts VALUES (?, ?, ?, ?)").run(turn.requestId, fingerprint, JSON.stringify(turn.reply), now);
            db.prepare("INSERT INTO voice_turns VALUES (?, ?, ?, ?)").run(turn.requestId, turn.text, JSON.stringify(turn.reply), now);
            db.exec("DELETE FROM voice_turns WHERE request_id NOT IN (SELECT request_id FROM voice_turns ORDER BY at DESC, rowid DESC LIMIT 50)");
            db.prepare(`INSERT INTO voice_sessions VALUES ('synthetic-demo', ?, ?)
              ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`).run(now, now);
          },
          proposal(id) {
            const row = db.prepare("SELECT data FROM voice_proposals WHERE id = ?").get(id);
            return row ? JSON.parse(String(row.data)) as Proposal : undefined;
          },
          saveProposal(p) {
            db.prepare(`INSERT INTO voice_proposals VALUES (?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(p.id, JSON.stringify(p), p.expiresAt, now);
          },
          history() {
            return db.prepare("SELECT * FROM voice_turns ORDER BY at, rowid").all().map(row => {
              let reply = JSON.parse(String(row.reply)) as VoiceReply;
              if (reply.proposalId) {
                const proposal = tx.proposal(reply.proposalId);
                if (proposal?.result) reply = proposal.result;
                else if (proposal?.confirmedAt !== undefined) {
                  reply = { ...reply, message: "Confirmation submitted; result pending. Retry the same confirmation to check.\n" + reply.message };
                } else if (!proposal || proposal.expiresAt <= now) {
                  const { proposalId: _id, ...rest } = reply;
                  reply = { ...rest, message: "This confirmation expired. Ask Panda again." };
                }
              }
              return { requestId: String(row.request_id), text: String(row.text), reply, at: new Date(Number(row.at)).toISOString() };
            });
          },
        };
        const result = await fn(tx);
        db.exec("COMMIT");
        active = false;
        return result;
      } catch (e) {
        if (active) db.exec("ROLLBACK");
        if (e instanceof Error && /database is locked|database is busy/.test(e.message))
          throw new DomainError("STORAGE_BUSY", "Another voice request is running. Retry with the same request ID.", 503);
        throw e;
      } finally {
        db.close();
      }
    });
    const tail = work.catch(() => {});
    queues.set(key, tail);
    void tail.finally(() => { if (queues.get(key) === tail) queues.delete(key); });
    return work;
  }
}

export function voiceDatabaseFile() {
  return process.env.PANDA_VOICE_DATABASE || path.resolve(process.env.PANDA_DATA_DIR || ".data", "voice.sqlite");
}
