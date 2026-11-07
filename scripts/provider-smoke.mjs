import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
const { classify, providerStatus } = await import("../apps/panda/src/server/provider.ts");
const { synthesize } = await import("../apps/panda/src/server/speech.ts");
const { fixtureCare } = await import("../packages/contracts/fixtures.ts");
try {
  const status = providerStatus();
  if (status.engine === "demo_rules" || !status.configured)
    throw Error("Configure Gemini or OpenAI in root .env.local before the live test. See .env.example.");
  // This command intentionally spends provider credits; only synthetic fixture text is sent.
  const result = await classify("Show my approved plan", fixtureCare());
  if (result.command?.name !== "read_plan") throw Error("Live model did not select read_plan. Review routing before claiming acceptance.");
  console.log("PASS: actual " + result.engine + " call returned the validated read_plan tool.");
  const evidence = { at: new Date().toISOString(), engine: result.engine, ai: "passed", tts: "not configured", playback: "requires human listening" };
  if (process.env.PANDA_TTS_MODE === "elevenlabs") {
    const audio = await synthesize({ text: "This is Panda's synthetic speech test. Your reviewed plan is ready." });
    await mkdir(path.join(root, "work"), { recursive: true });
    await writeFile(path.join(root, "work", "elevenlabs-smoke.mp3"), new Uint8Array(audio), { mode: 0o600 });
    evidence.tts = "audio returned; listen to work/elevenlabs-smoke.mp3";
    console.log("PASS: actual ElevenLabs audio saved to work/elevenlabs-smoke.mp3. Listen to verify playback.");
  } else console.log("PENDING: live ElevenLabs is not configured; browser speech remains available.");
  await mkdir(path.join(root, "work"), { recursive: true });
  await writeFile(path.join(root, "work", "provider-evidence.json"), JSON.stringify(evidence, null, 2), { mode: 0o600 });
} catch (e) {
  // Adapter errors are sanitized; do not dump upstream responses or environment values.
  console.error(e instanceof Error ? e.message : "Live provider check failed.");
  process.exitCode = 1;
}
