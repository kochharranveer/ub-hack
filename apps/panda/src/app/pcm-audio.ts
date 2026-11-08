/** Decode chunks split on arbitrary network boundaries without losing odd bytes. */
export class PcmDecoder {
  private odd: number | null = null;
  decode(chunk: Uint8Array) {
    const size = chunk.length + (this.odd === null ? 0 : 1);
    const bytes = new Uint8Array(size);
    let offset = 0;
    if (this.odd !== null) {
      bytes[0] = this.odd;
      offset = 1;
    }
    bytes.set(chunk, offset);
    const count = Math.floor(size / 2);
    this.odd = size % 2 ? bytes[size - 1] : null;
    const view = new DataView(bytes.buffer);
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++)
      samples[i] = view.getInt16(i * 2, true) / 32768;
    return samples;
  }
  finish() {
    if (this.odd !== null) throw Error("Incomplete speech audio");
  }
}
export function wavAudio(chunks: Float32Array[], rate: number) {
  const count = chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    buffer = new ArrayBuffer(44 + count * 2),
    view = new DataView(buffer);
  const write = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(at + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + count * 2, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, count * 2, true);
  let at = 44;
  for (const chunk of chunks)
    for (const sample of chunk) {
      view.setInt16(
        at,
        Math.round(
          Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767),
        ),
        true,
      );
      at += 2;
    }
  return new Blob([buffer], { type: "audio/wav" });
}
