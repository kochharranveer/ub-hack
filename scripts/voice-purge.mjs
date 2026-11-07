import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
const { SqliteVoiceRepository } = await import("../apps/panda/src/server/repository.ts");
const file = process.env.PANDA_VOICE_DATABASE || path.resolve(process.env.PANDA_DATA_DIR || path.join(root, "apps", "panda", ".data"), "voice.sqlite");
if (!existsSync(file)) console.log("No voice database to maintain.");
else {
  await new SqliteVoiceRepository(file).transaction(() => {});
  console.log("Expired voice records purged. Unexpired retry receipts preserved.");
}
