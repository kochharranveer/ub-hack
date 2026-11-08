import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
// Local, single-process demo persistence only. Domain owners replace this with repositories.
const runtime = globalThis as typeof globalThis & {
  __pandaStoreQueues?: Map<string, Promise<unknown>>;
};
const queues = (runtime.__pandaStoreQueues ??= new Map());
export class JsonStore<T> {
  private get tail() {
    return queues.get(path.resolve(this.file)) || Promise.resolve();
  }
  private set tail(value: Promise<unknown>) {
    queues.set(path.resolve(this.file), value);
  }
  constructor(
    readonly file: string,
    private seed: () => T,
  ) {}
  private async read(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return this.seed();
      throw e;
    }
  }
  snapshot(): Promise<T> {
    return this.tail.then(() => this.read());
  }
  update<R>(fn: (state: T) => R | Promise<R>): Promise<R> {
    const work = this.tail.then(async () => {
      const state = await this.read();
      const value = await fn(state);
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = this.file + "." + randomUUID() + ".tmp";
      await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
      await rename(tmp, this.file);
      return value;
    });
    this.tail = work.catch(() => {});
    return work;
  }
}
export function dataFile(name: string) {
  return path.resolve(process.env.PANDA_DATA_DIR || ".data", name + ".json");
}
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
export type Receipt = { fingerprint: string; result: unknown };
export function once<T>(
  receipts: Record<string, Receipt>,
  id: string,
  payload: unknown,
  fn: () => T,
): T {
  const fingerprint = JSON.stringify(payload);
  const previous = receipts[id];
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new DomainError(
        "CONFLICT",
        "Request ID reused with different input",
      );
    return previous.result as T;
  }
  const result = fn();
  receipts[id] = { fingerprint, result: structuredClone(result) };
  return result;
}
