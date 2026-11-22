// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { AudioPlan } from '../../../audio/plan';
import type { AudioReader } from '../../../audio/types';
import type { CompanionClient } from '../../../engine';
import { audioProject } from '../../../model/__tests__/audioFixtures';
import { createAudioPlan } from '../../../audio';
import { assertCoversVideo, sendSoundtrack, SOUND_REQUEST_BYTES, soundFrames } from '../soundtrack';

/** One clip over the whole range; the "recording" is a constant `level` in both channels. */
function mix(seconds: number, level = 0.5): { plan: AudioPlan; reader: AudioReader } {
  const { project, clip } = audioProject();
  clip.start = 0;
  clip.end = 60;
  clip.sourceStart = 0;
  clip.volume = [];
  const reader: AudioReader = {
    read: async (_asset, startFrame, frameCount) => ({
      startFrame,
      sampleRate: 48000,
      channels: [
        new Float32Array(frameCount).fill(level),
        new Float32Array(frameCount).fill(level),
      ] as const,
    }),
  };
  return { plan: createAudioPlan(project, { start: 0, duration: seconds }), reader };
}

function recorder(fail?: (offset: number) => unknown) {
  const sent: { kind: string; id: string; offset: number; bytes: Uint8Array }[] = [];
  const client = {
    sendJobAudio: vi.fn(async (kind: string, id: string, offset: number, body: Blob) => {
      const failure = fail?.(offset);
      if (failure) throw failure;
      sent.push({ kind, id, offset, bytes: new Uint8Array(await body.arrayBuffer()) });
      return {};
    }),
  } as unknown as CompanionClient;
  const file = () => {
    const out = new Uint8Array(sent.reduce((n, piece) => n + piece.bytes.length, 0));
    for (const piece of sent) out.set(piece.bytes, piece.offset);
    return out;
  };
  return { client, sent, file };
}

const never = new AbortController().signal;

describe('soundFrames', () => {
  it('is the length of the video at 48 kHz, to the nearest sample', () => {
    expect(soundFrames(20, 10)).toBe(96000);
    expect(soundFrames(1, 3)).toBe(16000);
    expect(soundFrames(1, 7)).toBe(6857);
    expect(soundFrames(5, 7)).toBe(34286);
    expect(soundFrames(1, 240)).toBe(200);
  });

  it('a plan of another length or another start is refused before anything is sent', () => {
    const { plan } = mix(2);
    expect(() => assertCoversVideo(plan, 0, 20, 10)).not.toThrow();
    expect(() => assertCoversVideo(plan, 0, 21, 10)).toThrow('same frame-quantized output range');
    expect(() => assertCoversVideo(plan, 0.5, 20, 10)).toThrow('same frame-quantized');
  });
});

describe('sendSoundtrack', () => {
  it('sends one WAV file: the header first, then the samples, in order', async () => {
    const { client, sent, file } = recorder();
    const soundtrack = mix(2);
    const progress: number[] = [];
    await sendSoundtrack(client, 'video', 'job1', soundtrack, (p) => progress.push(p.frame), never);
    expect(sent.map((piece) => [piece.kind, piece.id])).toEqual([['video', 'job1']]);
    const bytes = file();
    expect(bytes.length).toBe(44 + 96000 * 4);
    const view = new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(96000 * 4 + 36);
    expect(new TextDecoder().decode(bytes.subarray(8, 16))).toBe('WAVEfmt ');
    expect([view.getUint16(20, true), view.getUint16(22, true), view.getUint32(24, true)]).toEqual([
      1, 2, 48000,
    ]);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(96000 * 4);
    // 16-bit samples of the mix, both channels
    expect(view.getInt16(44, true)).toBe(Math.round(0.5 * 32767));
    expect(view.getInt16(44 + 4 * 95999 + 2, true)).toBe(Math.round(0.5 * 32767));
    expect(progress.at(-1)).toBe(96000);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it('cuts the file into requests no larger than the limit, each where the last one ended', async () => {
    const { client, sent, file } = recorder();
    await sendSoundtrack(client, 'manim', 'm1', mix(2), () => {}, never, 100_000);
    expect(sent.length).toBe(Math.ceil((44 + 96000 * 4) / 100_000));
    expect(sent.every((piece) => piece.kind === 'manim')).toBe(true);
    let offset = 0;
    for (const piece of sent) {
      expect(piece.offset).toBe(offset);
      expect(piece.bytes.length).toBeLessThanOrEqual(100_000);
      offset += piece.bytes.length;
    }
    // every request but the last is full: the connection is kept busy
    expect(sent.slice(0, -1).every((piece) => piece.bytes.length === 100_000)).toBe(true);
    expect(file().length).toBe(44 + 96000 * 4);
    // the header is in the first one, whole
    expect(new TextDecoder().decode(sent[0]!.bytes.subarray(36, 40))).toBe('data');
  });

  it('never asks for more than its own request size, whatever the companion allows', async () => {
    const { client, sent } = recorder();
    await sendSoundtrack(client, 'video', 'j', mix(30), () => {}, never, 1024 ** 3);
    expect(Math.max(...sent.map((piece) => piece.bytes.length))).toBe(SOUND_REQUEST_BYTES);
  });

  it('counts the samples over full scale and clamps them in the file', async () => {
    const { client, file } = recorder();
    let clipped = 0;
    await sendSoundtrack(
      client,
      'video',
      'j',
      mix(0.1, 1.5),
      (p) => {
        clipped = p.clippedSamples;
      },
      never,
    );
    expect(clipped).toBe(4800 * 2);
    expect(new DataView(file().buffer).getInt16(44, true)).toBe(32767);
  });

  it('stops at the first request that fails', async () => {
    const { client, sent } = recorder((offset) => (offset > 0 ? new Error('gone') : null));
    await expect(
      sendSoundtrack(client, 'video', 'j', mix(2), () => {}, never, 100_000),
    ).rejects.toThrow('gone');
    expect(sent).toHaveLength(1);
  });

  it('stops mixing when it is aborted', async () => {
    const { client, sent } = recorder();
    const controller = new AbortController();
    const promise = sendSoundtrack(
      client,
      'video',
      'j',
      mix(30),
      (p) => {
        if (p.frame > 48000) controller.abort();
      },
      controller.signal,
    );
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(sent).toEqual([]);
  });
});
