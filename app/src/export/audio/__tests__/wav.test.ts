// @vitest-environment node
import { expect, it } from 'vitest';
import { pcm16Bytes, wavHeader } from '../wav';

it('writes exact PCM frame counts and saturates both polarities symmetrically', () => {
  const header = wavHeader(48001);
  const view = new DataView(header.buffer);
  expect(view.getUint32(40, true)).toBe(48001 * 4);
  expect(view.getUint32(4, true)).toBe(48001 * 4 + 36);
  const bytes = pcm16Bytes({
    startFrame: 0,
    sampleRate: 48000,
    channels: [new Float32Array([-2, 0, 2]), new Float32Array([0.5, -0.5, 1])],
  });
  const pcm = new DataView(bytes.buffer);
  expect(pcm.getInt16(0, true)).toBe(-32768);
  expect(pcm.getInt16(2, true)).toBe(16384);
  expect(pcm.getInt16(8, true)).toBe(32767);
});
