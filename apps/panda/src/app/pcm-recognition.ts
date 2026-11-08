import type { SpeechInput } from "./recorded-recognition";
import { SpeechTurn } from "./speech-turn";
import { wavAudio } from "./pcm-audio";
const prepared = new WeakMap<AudioContext, Promise<void>>();
export async function preparePcmInput(context: AudioContext) {
  if (!context.audioWorklet || typeof AudioWorkletNode === "undefined")
    return false;
  let ready = prepared.get(context);
  if (!ready) {
    ready = context.audioWorklet.addModule("/audio/input.worklet.js");
    prepared.set(context, ready);
  }
  try {
    await ready;
    return true;
  } catch {
    prepared.delete(context);
    return false;
  }
}
export function pcmRecognition(
  transcribe: (audio: Blob, signal: AbortSignal) => Promise<string>,
  context: AudioContext,
  stream: () => Promise<MediaStream>,
  options: {
    playback: () => boolean;
    onSpeechStart: () => void;
    processing: () => void;
    level?: (value: number) => void;
  },
): SpeechInput {
  let active = false,
    node: AudioWorkletNode | null = null,
    source: MediaStreamAudioSourceNode | null = null,
    controller: AbortController | null = null;
  const cleanup = () => {
    if (node) {
      node.port.onmessage = null;
      node.port.close();
      node.disconnect();
      node = null;
    }
    source?.disconnect();
    source = null;
  };
  const input: SpeechInput = {
    lang: "en-US",
    continuous: false,
    interimResults: false,
    onresult: null,
    onerror: null,
    onend: null,
    abort() {
      active = false;
      controller?.abort();
      controller = null;
      cleanup();
    },
    start() {
      active = true;
      void (async () => {
        try {
          const captured = await stream();
          if (!active) return;
          const cancelled =
            captured.getAudioTracks()[0]?.getSettings().echoCancellation ===
            true;
          node = new AudioWorkletNode(context, "panda-input", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
          });
          source = context.createMediaStreamSource(captured);
          source.connect(node);
          node.connect(context.destination);
          const turn = new SpeechTurn(context.sampleRate);
          node.port.onmessage = (message: MessageEvent<Float32Array>) => {
            if (!active) return;
            let energy = 0;
            for (const sample of message.data) energy += sample * sample;
            options.level?.(
              Math.min(
                1,
                Math.sqrt(energy / Math.max(1, message.data.length)) * 9,
              ),
            );
            const result = turn.push(
              message.data,
              options.playback(),
              cancelled,
            );
            if (result.began) options.onSpeechStart();
            if (result.noSpeech) {
              input.abort();
              input.onerror?.({ error: "no-speech" });
              input.onend?.();
              return;
            }
            if (result.complete && result.chunks) {
              cleanup();
              controller = new AbortController();
              options.processing();
              void transcribe(
                wavAudio(result.chunks, context.sampleRate),
                controller.signal,
              )
                .then((text) => {
                  if (!active) return;
                  const transcript = text.trim();
                  if (transcript)
                    input.onresult?.({
                      results: { 0: { 0: { transcript } } },
                    });
                  else input.onerror?.({ error: "no-speech" });
                  if (active) {
                    active = false;
                    input.onend?.();
                  }
                })
                .catch((error) => {
                  if (active) {
                    active = false;
                    input.onerror?.({
                      error: "transcription-unavailable",
                      message:
                        error instanceof Error
                          ? error.message
                          : "Speech transcription failed",
                    });
                    input.onend?.();
                  }
                });
            }
          };
        } catch (error) {
          if (active) {
            input.abort();
            input.onerror?.({
              error:
                (error as Error).name === "NotAllowedError"
                  ? "not-allowed"
                  : "audio-capture",
            });
            input.onend?.();
          }
        }
      })();
    },
  };
  return input;
}
