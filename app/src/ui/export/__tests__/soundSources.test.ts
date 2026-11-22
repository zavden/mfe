// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAudioPlan } from '../../../audio';
import { createAudioAsset, createAudioClip, type Project } from '../../../model';
import { audioProject } from '../../../model/__tests__/audioFixtures';
import { holdRecordings, MissingRecordingsError } from '../soundSources';

const HASH = { narration: 'a'.repeat(64), music: 'b'.repeat(64), bell: 'c'.repeat(64) };

/** The fixture's narration, plus music and a bell on the same track, one after the other. */
function threeRecordings(): Project {
  const { project, track } = audioProject();
  const add = (name: string, file: string, contentHash: string, start: number) => {
    const asset = createAudioAsset({
      name,
      originalName: file,
      mimeType: 'audio/mpeg',
      byteLength: 1000,
      contentHash,
      duration: 100,
      sampleRate: 48000,
      channels: 2,
    });
    project.audioAssets.push(asset);
    project.audioClips.push(createAudioClip(asset.id, track.id, start, start + 5));
    project.audioClips.push(createAudioClip(asset.id, track.id, start + 5, start + 10));
  };
  add('Music', 'music.mp3', HASH.music, 30);
  add('bell.wav', 'bell.wav', HASH.bell, 50);
  return project;
}

function store(missing: string[] = []) {
  return {
    pinAvailable: vi.fn(async (_owner: string, hashes: readonly string[]) =>
      hashes.filter((hash) => missing.includes(hash)),
    ),
    releaseOwner: vi.fn(async () => undefined),
  };
}

describe('the recordings an export mixes', () => {
  it('are held, each once, until the lease is released', async () => {
    const repository = store();
    const lease = await holdRecordings(createAudioPlan(threeRecordings()), repository);
    expect(repository.pinAvailable).toHaveBeenCalledOnce();
    const [owner, hashes] = repository.pinAvailable.mock.calls[0]!;
    expect(owner).toBe(lease.ownerId);
    expect(owner).toMatch(/^export:/);
    expect([...hashes].sort()).toEqual([HASH.narration, HASH.music, HASH.bell]);
    expect(repository.releaseOwner).not.toHaveBeenCalled();
    await lease.release();
    expect(repository.releaseOwner).toHaveBeenCalledWith(owner);
  });

  it('are only those of the range, and a muted track’s are not among them', async () => {
    const project = threeRecordings();
    const repository = store();
    await holdRecordings(createAudioPlan(project, { start: 0, end: 25 }), repository);
    expect(repository.pinAvailable.mock.calls[0]![1]).toEqual([HASH.narration]);
    for (const track of project.tracks) if (track.kind === 'audio') track.muted = true;
    const lease = await holdRecordings(createAudioPlan(project), repository);
    // Nothing to hold: the store is not asked.
    expect(repository.pinAvailable).toHaveBeenCalledOnce();
    await lease.release();
    expect(repository.releaseOwner).not.toHaveBeenCalled();
  });

  it('stop the export when one is missing: which one, and what brings it back', async () => {
    const repository = store([HASH.music]);
    const held = holdRecordings(createAudioPlan(threeRecordings()), repository);
    await expect(held).rejects.toBeInstanceOf(MissingRecordingsError);
    await expect(held).rejects.toThrow(
      'The recording “Music” (music.mp3) is missing: the browser no longer holds its original ' +
        'audio. Import the same file again in the Audio tab, or mute its track, and export again.',
    );
    // What was held for a moment is let go.
    expect(repository.releaseOwner).toHaveBeenCalledWith(repository.pinAvailable.mock.calls[0]![0]);
  });

  it('name every missing recording, by its file when the name is the file', async () => {
    const repository = store([HASH.narration, HASH.bell]);
    await expect(holdRecordings(createAudioPlan(threeRecordings()), repository)).rejects.toThrow(
      '2 recordings are missing: “Narration” (narration.mp3) and “bell.wav”. The browser no ' +
        'longer holds their original audio. Import the same files again in the Audio tab, or ' +
        'mute their tracks, and export again.',
    );
  });
});
