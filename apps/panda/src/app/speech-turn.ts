export class SpeechTurn {
  private elapsed = 0;
  private lastSound = 0;
  private voiced = 0;
  private noise = 0.003;
  private echo = 0.004;
  private playbackAge = 0;
  private hadPlayback = false;
  private started = false;
  private pre: Float32Array[] = [];
  private audio: Float32Array[] = [];
  private preSamples = 0;
  private audioSamples = 0;
  constructor(private rate: number) {}
  push(samples: Float32Array, playback: boolean, echoCancellation: boolean) {
    const duration = (samples.length / this.rate) * 1000;
    this.elapsed += duration;
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / Math.max(samples.length, 1));
    if (playback) {
      if (!this.hadPlayback) this.playbackAge = 0;
      this.playbackAge += duration;
    } else this.playbackAge = 0;
    this.hadPlayback = playback;
    if (!this.started) {
      this.pre.push(samples);
      this.preSamples += samples.length;
      while (this.preSamples > this.rate * 0.32 && this.pre.length > 1)
        this.preSamples -= this.pre.shift()!.length;
    }
    const settling = playback && this.playbackAge < 240;
    if (settling)
      this.echo = Math.max(
        0.004,
        Math.min(0.04, this.echo * 0.85 + rms * 0.15),
      );
    const threshold = Math.max(
      playback ? 0.024 : 0.012,
      this.noise * 3,
      playback ? this.echo * 2.7 : 0,
    );
    const sound =
      rms > threshold && (!playback || (echoCancellation && !settling));
    if (!this.started && !playback && rms < threshold)
      this.noise = this.noise * 0.98 + rms * 0.02;
    this.voiced = sound ? this.voiced + duration : 0;
    let began = false;
    if (!this.started && this.voiced >= (playback ? 180 : 60)) {
      this.started = true;
      this.audio = this.pre;
      this.audioSamples = this.preSamples;
      this.pre = [];
      this.preSamples = 0;
      began = true;
    } else if (this.started) {
      this.audio.push(samples);
      this.audioSamples += samples.length;
    }
    if (sound && this.started) this.lastSound = this.elapsed;
    const complete =
      this.started &&
      (this.elapsed - this.lastSound >= 650 ||
        this.audioSamples >= this.rate * 30);
    // Long replies do not consume the patient's silence allowance.
    if (playback && !this.started) this.lastSound = this.elapsed;
    return {
      began,
      complete,
      noSpeech:
        !this.started && !playback && this.elapsed - this.lastSound >= 8000,
      chunks: complete ? this.audio : undefined,
    };
  }
}
export function playbackEcho(text: string, spoken: string) {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  const a = tokens(text),
    b = tokens(spoken);
  if (a.length < 3 || !b.length) return false;
  const phrase = a.join(" "),
    source = b.join(" ");
  if (source.includes(phrase)) return true;
  return (
    a.length >= 5 &&
    a.filter((word) => b.includes(word)).length / a.length >= 0.92
  );
}
