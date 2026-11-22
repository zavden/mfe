// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { hashBlob, IncrementalSha256, MEDIA_CHUNK_BYTES } from '../hash';

describe('bounded SHA-256 content identity', () => {
  it.each([0, 3, 55, 56, 63, 64, 65, 127, 128, 1027])(
    'matches native SHA-256 at %i bytes with uneven updates',
    (length) => {
      const bytes = Uint8Array.from({ length }, (_, index) => index % 251);
      const hash = new IncrementalSha256();
      for (let offset = 0; offset < bytes.length; offset += 17)
        hash.update(bytes.subarray(offset, offset + 17));
      expect(hash.digest()).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(() => hash.update(bytes)).toThrow('already finished');
    },
  );

  it('reads only bounded Blob slices and never buffers the complete source', async () => {
    const bytes = new Uint8Array(MEDIA_CHUNK_BYTES * 2 + 81).fill(157);
    const blob = new Blob([bytes]);
    const all = vi.spyOn(blob, 'arrayBuffer').mockRejectedValue(new Error('Unbounded read'));
    const slices = vi.spyOn(blob, 'slice');
    expect(await hashBlob(blob)).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(all).not.toHaveBeenCalled();
    expect(slices.mock.calls).toEqual([
      [0, MEDIA_CHUNK_BYTES],
      [MEDIA_CHUNK_BYTES, MEDIA_CHUNK_BYTES * 2],
      [MEDIA_CHUNK_BYTES * 2, bytes.length],
    ]);
  });

  it('cancels before reading the next bounded chunk', async () => {
    const controller = new AbortController();
    const blob = new Blob([new Uint8Array(MEDIA_CHUNK_BYTES + 1)]);
    const slice = vi.spyOn(blob, 'slice');
    await expect(
      hashBlob(blob, { signal: controller.signal, onProgress: () => controller.abort() }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(slice).toHaveBeenCalledTimes(1);
  });
});
