import test from "node:test";
import assert from "node:assert/strict";
import { PcmDecoder, wavAudio } from "../apps/panda/src/app/pcm-audio";
import { SpeechTurn, playbackEcho } from "../apps/panda/src/app/speech-turn";
import { ConversationAudio } from "../apps/panda/src/app/conversation-audio";
import { streamSpeech } from "../apps/panda/src/server/speech";
const frame = (amplitude: number) => new Float32Array(320).fill(amplitude);
test("PCM decoding keeps signed samples across arbitrary network boundaries", () => {
  const d = new PcmDecoder();
  assert.deepEqual([...d.decode(new Uint8Array([0]))], []);
  assert.deepEqual(
    [...d.decode(new Uint8Array([128, 255, 127, 0, 0]))],
    [-1, 32767 / 32768, 0],
  );
  d.finish();
  assert.throws(() => {
    const broken = new PcmDecoder();
    broken.decode(new Uint8Array([1]));
    broken.finish();
  }, /Incomplete/);
});
test("speech capture retains the beginning of an utterance and finishes after a natural pause", async () => {
  const turn = new SpeechTurn(16000);
  for (let i = 0; i < 15; i++) turn.push(frame(0), false, true);
  let began = false;
  for (let i = 0; i < 15; i++)
    began = turn.push(frame(0.08), false, true).began || began;
  assert.equal(began, true);
  let result = turn.push(frame(0), false, true);
  for (let i = 0; i < 33 && !result.complete; i++)
    result = turn.push(frame(0), false, true);
  assert.equal(result.complete, true);
  const blob = wavAudio(result.chunks!, 16000),
    view = new DataView(await blob.arrayBuffer());
  assert.equal(blob.type, "audio/wav");
  assert.equal(view.getUint32(24, true), 16000);
  assert.ok(view.getUint32(40, true) > 16000 * 0.3 * 2);
});
test("short noise and unecho-cancelled playback cannot interrupt Panda", () => {
  const turn = new SpeechTurn(16000);
  for (let i = 0; i < 100; i++)
    assert.equal(turn.push(frame(0.1), true, false).began, false);
  const quiet = new SpeechTurn(16000);
  quiet.push(frame(0.04), false, true);
  quiet.push(frame(0.04), false, true);
  assert.equal(quiet.push(frame(0), false, true).began, false);
});
test("sustained new speech can interrupt echo-cancelled playback after settling", () => {
  const turn = new SpeechTurn(16000);
  for (let i = 0; i < 20; i++) turn.push(frame(0.002), true, true);
  let began = false;
  for (let i = 0; i < 12; i++)
    began = turn.push(frame(0.09), true, true).began || began;
  assert.equal(began, true);
});
test("playback echo is filtered without dropping a real negative medicine answer", () => {
  assert.equal(
    playbackEcho(
      "Have you taken your evening atorvastatin",
      "Have you taken your evening atorvastatin?",
    ),
    true,
  );
  assert.equal(
    playbackEcho(
      "No I haven't taken my medicine",
      "Have you taken your evening atorvastatin?",
    ),
    false,
  );
  assert.equal(playbackEcho("Yes", "Yes, shall I mark it taken?"), false);
});
test("PCM plays before the network stream ends and cancellation stops queued audio", async () => {
  let supply!: ReadableStreamDefaultController<Uint8Array>,
    ended = 0,
    started = 0,
    cancelled = 0,
    stops = 0;
  const sources: {
    onended: (() => void) | null;
    buffer: AudioBuffer | null;
    connect: () => void;
    disconnect: () => void;
    start: () => void;
    stop: () => void;
  }[] = [];
  const context = {
    state: "running",
    currentTime: 0,
    destination: {},
    resume: async () => {},
    close: async () => {},
    createBuffer: (_channels: number, length: number, rate: number) => ({
      duration: length / rate,
      copyToChannel: () => {},
    }),
    createBufferSource: () => {
      const source = {
        onended: null as (() => void) | null,
        buffer: null as AudioBuffer | null,
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {
          stops++;
        },
      };
      sources.push(source);
      return source;
    },
  };
  const audio = new ConversationAudio(() => context as unknown as AudioContext);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      supply = controller;
    },
    cancel() {
      cancelled++;
    },
  });
  const pending = audio.playPcm(
    stream,
    24000,
    () => {
      started++;
    },
    () => {
      ended++;
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  supply.enqueue(new Uint8Array([0, 0, 0, 0]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, 1);
  assert.equal(ended, 0);
  audio.stop();
  await pending;
  assert.equal(cancelled, 1);
  assert.equal(stops, 1);
  assert.equal(ended, 0);
});
test("streamed speech keeps server credentials private and propagates cancellation upstream", async () => {
  const before = { ...process.env },
    fetcher = globalThis.fetch;
  let cancelled = 0;
  Object.assign(process.env, {
    PANDA_TTS_MODE: "elevenlabs",
    PANDA_ELEVENLABS_API_KEY: "fake-private",
    PANDA_ELEVENLABS_VOICE_ID: "voice",
    PANDA_ELEVENLABS_MODEL_ID: "eleven_multilingual_v2",
  });
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/stream\?output_format=pcm_24000$/);
    assert.equal(
      new Headers(options?.headers).get("xi-api-key"),
      "fake-private",
    );
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([0, 0]));
        },
        cancel() {
          cancelled++;
        },
      }),
      { headers: { "Content-Type": "audio/pcm" } },
    );
  };
  try {
    const stream = await streamSpeech({ text: "How is your knee feeling?" });
    const reader = stream.getReader();
    assert.equal((await reader.read()).value?.length, 2);
    await reader.cancel();
    assert.equal(cancelled, 1);
  } finally {
    globalThis.fetch = fetcher;
    for (const key of Object.keys(process.env))
      if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});
