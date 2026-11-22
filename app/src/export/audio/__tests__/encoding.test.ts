// @vitest-environment node
import { expect, it } from 'vitest';
import { canEncodeAac, createAudioEncoder, videoAudioEncoding } from '../encoding';

// The app carries no AAC encoder of its own: the answer is the browser's WebCodecs, and Node
// (like Chrome on Linux) has none.
it('cannot encode AAC without an encoder from the browser, and refuses to try', async () => {
  expect(await canEncodeAac()).toBe(false);
  await expect(createAudioEncoder('mp4-aac')).rejects.toThrow(
    'This browser cannot encode AAC. Export WAV or WebM (Opus) instead.',
  );
});

it('gives an MP4 the AAC the browser has, Opus otherwise, and a WebM always Opus', () => {
  expect(videoAudioEncoding('mp4', true)).toBe('mp4-aac');
  expect(videoAudioEncoding('mp4', false)).toBe('mp4-opus');
  expect(videoAudioEncoding('webm', true)).toBe('webm-opus');
  expect(videoAudioEncoding('webm', false)).toBe('webm-opus');
});
