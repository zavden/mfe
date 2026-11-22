import type { AudioPcm } from '../../audio/types';

export function wavHeader(frames: number, sampleRate = 48_000): Uint8Array<ArrayBuffer> {
  const dataBytes = frames * 4;
  if (!Number.isSafeInteger(frames) || frames < 0 || dataBytes > 0xffffffff - 36)
    throw new Error('PCM WAV exceeds the RIFF size limit.');
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const text = (offset: number, value: string) =>
    header.set(new TextEncoder().encode(value), offset);
  text(0, 'RIFF');
  view.setUint32(4, dataBytes + 36, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, dataBytes, true);
  return header;
}

export function pcm16Bytes(block: AudioPcm): Uint8Array<ArrayBuffer> {
  const count = block.channels[0].length;
  const bytes = new Uint8Array(count * 4);
  const view = new DataView(bytes.buffer);
  for (let frame = 0; frame < count; frame++)
    for (let channel = 0; channel < 2; channel++) {
      const sample = Math.max(-1, Math.min(1, block.channels[channel]![frame]!));
      view.setInt16(
        frame * 4 + channel * 2,
        Math.round(sample * (sample < 0 ? 32768 : 32767)),
        true,
      );
    }
  return bytes;
}
