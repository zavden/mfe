/** LAME/Xing declares both encoder delay and trailing padding. The demuxer's packet timeline
 * already removes decoder/encoder priming, but its duration omits the LAME trailing padding. */
export function mp3GaplessFrames(bytes: Uint8Array): number | null {
  const ascii = (at: number, count: number) =>
    String.fromCharCode(...bytes.subarray(at, at + count));
  for (let start = 0; start + 192 < bytes.length; start++) {
    if (bytes[start] !== 255 || (bytes[start + 1]! & 0xe0) !== 0xe0) continue;
    const version = (bytes[start + 1]! >> 3) & 3;
    const layer = (bytes[start + 1]! >> 1) & 3;
    if (version === 1 || layer !== 1) continue;
    const mono = bytes[start + 3]! >> 6 === 3;
    const xing = start + 4 + (version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17);
    if (!['Xing', 'Info'].includes(ascii(xing, 4))) continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const flags = view.getUint32(xing + 4);
    if (!(flags & 1)) return null;
    const count = view.getUint32(xing + 8);
    const lame =
      xing +
      8 +
      (flags & 1 ? 4 : 0) +
      (flags & 2 ? 4 : 0) +
      (flags & 4 ? 100 : 0) +
      (flags & 8 ? 4 : 0);
    if (lame + 24 > bytes.length || !['LAME', 'Lavf', 'Lavc'].includes(ascii(lame, 4))) return null;
    const delay = (bytes[lame + 21]! << 4) | (bytes[lame + 22]! >> 4);
    const padding = ((bytes[lame + 22]! & 15) << 8) | bytes[lame + 23]!;
    const frames = count * (version === 3 ? 1152 : 576) - delay - padding;
    return frames > 0 ? frames : null;
  }
  return null;
}

export async function mp3PresentationFrames(blob: Blob): Promise<number | null> {
  const header = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
  let start = 0;
  if (header.length === 10 && String.fromCharCode(...header.subarray(0, 3)) === 'ID3') {
    const size =
      ((header[6]! & 127) << 21) |
      ((header[7]! & 127) << 14) |
      ((header[8]! & 127) << 7) |
      (header[9]! & 127);
    start = 10 + size + (header[3] === 4 && header[5]! & 16 ? 10 : 0);
  }
  return mp3GaplessFrames(new Uint8Array(await blob.slice(start, start + 65536).arrayBuffer()));
}
