import { PcmDecoder } from "./pcm-audio";
/** Unlock once on the patient's tap, then play successive replies without per-turn play buttons. */
export class ConversationAudio {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private generation = 0;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private queued = new Set<AudioBufferSourceNode>();
  private analyser: AnalyserNode | null = null;
  private frequencies = new Uint8Array(128);
  private levels = new Float32Array(48);
  readLevels() {
    this.levels.fill(0);
    if (this.analyser && this.playing) {
      this.analyser.getByteFrequencyData(this.frequencies);
      for (let i = 0; i < this.levels.length; i++)
        this.levels[i] = this.frequencies[2 + Math.floor(i * 1.6)] / 255;
    }
    return this.levels;
  }
  private output(context: AudioContext) {
    if (!this.analyser && context.createAnalyser) {
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;
      this.analyser.connect(context.destination);
    }
    return this.analyser || context.destination;
  }
  get playing() {
    return Boolean(this.source || this.queued.size);
  }
  constructor(
    private readonly create: () => AudioContext = () => new AudioContext(),
  ) {}
  captureContext() {
    return (this.context ??= this.create());
  }
  unlock() {
    this.captureContext();
    return this.context!.state === "running"
      ? Promise.resolve()
      : this.context!.resume();
  }
  stop() {
    this.generation++;
    const reader = this.reader;
    this.reader = null;
    void reader?.cancel().catch(() => {});
    for (const source of this.queued) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    this.queued.clear();
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* Already ended. */
      }
      this.source.disconnect();
      this.source = null;
    }
  }
  close() {
    this.stop();
    this.analyser?.disconnect();
    this.analyser = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  }
  async play(bytes: ArrayBuffer, ended: () => void) {
    this.stop();
    const token = this.generation;
    await this.unlock();
    const context = this.context;
    if (!context || token !== this.generation) return;
    const buffer = await context.decodeAudioData(bytes);
    if (token !== this.generation || this.context !== context) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output(context));
    this.source = source;
    source.onended = () => {
      if (token === this.generation) ended();
    };
    source.start();
  }
  async playPcm(
    stream: ReadableStream<Uint8Array>,
    rate: number,
    started: () => void,
    ended: () => void,
  ) {
    this.stop();
    const token = this.generation;
    await this.unlock();
    const context = this.context;
    if (!context || token !== this.generation) {
      await stream.cancel().catch(() => {});
      return;
    }
    const reader = stream.getReader();
    this.reader = reader;
    const decoder = new PcmDecoder();
    let next = context.currentTime + 0.04,
      finished = false,
      began = false,
      total = 0;
    const done = () => {
      if (finished && this.queued.size === 0 && token === this.generation)
        ended();
    };
    try {
      while (token === this.generation) {
        while (next - context.currentTime > 1.2 && token === this.generation)
          await new Promise((resolve) => setTimeout(resolve, 25));
        const item = await reader.read();
        if (token !== this.generation) return;
        if (item.done) break;
        total += item.value.length;
        if (total > 4 * 1024 * 1024) throw Error("Speech audio is too large");
        const samples = decoder.decode(item.value);
        if (!samples.length) continue;
        const buffer = context.createBuffer(1, samples.length, rate);
        buffer.copyToChannel(samples, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.output(context));
        this.queued.add(source);
        source.onended = () => {
          this.queued.delete(source);
          source.disconnect();
          done();
        };
        next = Math.max(next, context.currentTime + 0.025);
        source.start(next);
        next += buffer.duration;
        if (!began) {
          began = true;
          started();
        }
      }
      decoder.finish();
      if (!total) throw Error("Empty speech audio");
      finished = true;
      done();
    } catch (error) {
      if (token === this.generation) {
        this.stop();
        throw error;
      }
    } finally {
      if (this.reader === reader) this.reader = null;
      reader.releaseLock();
    }
  }
}
