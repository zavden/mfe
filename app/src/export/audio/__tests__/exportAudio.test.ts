// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createAudioPlan } from '../../../audio/plan';
import type { AudioReader } from '../../../audio/types';
import { createEmptyProject } from '../../../model';
import { exportAudio } from '../index';

const silence: AudioReader = {
  read() {
    throw new Error('Nothing to read: the scene has no clip');
  },
};

function plan(seconds: number) {
  const project = createEmptyProject();
  project.meta.duration = seconds;
  return createAudioPlan(project);
}

describe('audio export without a file to write to', () => {
  it('assembles a WAV in memory and returns it', async () => {
    const blob = (await exportAudio(plan(0.25), silence, { format: 'wav' }))!;
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 12000 * 4);
  });

  it('starts a long WAV as any other: no size is refused beforehand', async () => {
    // Half an hour of WAV is 330 MiB. Mixing its first block is enough to know it began.
    const abort = new AbortController();
    let begun = 0;
    const running = exportAudio(plan(1800), silence, {
      format: 'wav',
      signal: abort.signal,
      onProgress: ({ frame }) => {
        begun = frame;
        abort.abort(new DOMException('Enough', 'AbortError'));
      },
    });
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(begun).toBe(4096);
  });
});
