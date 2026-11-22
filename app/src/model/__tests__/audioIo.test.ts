// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAudioClip,
  createAudioTrack,
  parseProject,
  serializeProject,
  validateProject,
  visualProject,
} from '../index';
import { audioProject } from './audioFixtures';
import { smallProject } from './fixtures';

describe('format 16 audio data', () => {
  it('migrates legacy rows without changing visibility, locks, clips or formula data', () => {
    const project = smallProject();
    project.tracks[0]!.hidden = true;
    project.tracks[1]!.locked = true;
    const legacy = {
      ...project,
      version: 15,
      tracks: project.tracks.map(({ id, name, hidden, locked }) => ({ id, name, hidden, locked })),
    } as Record<string, unknown>;
    delete legacy.audioAssets;
    delete legacy.audioClips;
    const parsed = parseProject(JSON.stringify(legacy));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.migratedFrom).toBe(15);
    expect(parsed.project).toEqual(project);
    expect(parsed.issues).toEqual([]);
  });

  it('round-trips metadata, source windows, mute/lock and every offscreen volume point', () => {
    const { project, track } = audioProject();
    track.muted = true;
    track.locked = true;
    const json = serializeProject(project);
    const parsed = parseProject(json);
    if (!parsed.ok) throw new Error(`${parsed.error}: ${parsed.details.join(', ')}`);
    expect(parsed.project).toEqual(project);
    expect(parsed.issues).toEqual([]);
    expect(parsed.migratedFrom).toBeNull();
    expect(serializeProject(parsed.project)).toBe(json);
    expect(json).not.toContain('base64');
  });

  it.each([
    [
      'negative gain',
      (p: ReturnType<typeof audioProject>['project']) => {
        p.audioClips[0]!.volume[0]!.gain = -1;
      },
    ],
    [
      'gain above 400%',
      (p: ReturnType<typeof audioProject>['project']) => {
        p.audioClips[0]!.volume[0]!.gain = 4.01;
      },
    ],
    [
      'invalid content hash',
      (p: ReturnType<typeof audioProject>['project']) => {
        p.audioAssets[0]!.contentHash = '../source.mp3';
      },
    ],
    [
      'fractional sample rate',
      (p: ReturnType<typeof audioProject>['project']) => {
        p.audioAssets[0]!.sampleRate = 44100.5;
      },
    ],
  ])('rejects malformed audio fields: %s', (_label, change) => {
    const { project } = audioProject();
    change(project);
    expect(parseProject(serializeProject(project)).ok).toBe(false);
  });

  it('requires explicit collections and track kinds in version 16 instead of silently repairing them', () => {
    const { project } = audioProject();
    const raw = JSON.parse(serializeProject(project)) as Record<string, unknown>;
    delete raw.audioClips;
    expect(parseProject(JSON.stringify(raw)).ok).toBe(false);
    const trackRaw = JSON.parse(serializeProject(project)) as { tracks: Record<string, unknown>[] };
    delete trackRaw.tracks[0]!.kind;
    expect(parseProject(JSON.stringify(trackRaw)).ok).toBe(false);
  });

  it('keeps repairable source, track and envelope errors visible after opening', () => {
    const { project, clip, asset } = audioProject();
    clip.trackId = project.tracks[0]!.id;
    clip.end = clip.start + asset.duration;
    clip.volume[1]!.time = clip.volume[0]!.time;
    clip.volume.at(-1)!.time = asset.duration + 2;
    const parsed = parseProject(serializeProject(project));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['track-kind', 'audio-source-window', 'audio-volume']),
    );
    expect(parsed.project.audioClips[0]!.end).toBe(clip.end);
    expect(validateProject(visualProject(parsed.project))).toEqual([]);
  });

  it('rejects cross-media placement in both directions', () => {
    const project = smallProject();
    const { asset, clip, track } = audioProject();
    project.tracks.push(track);
    project.audioAssets.push(asset);
    project.audioClips.push({ ...clip, trackId: project.tracks[0]!.id });
    project.clips[0]!.trackId = track.id;
    expect(validateProject(project).filter((issue) => issue.code === 'track-kind')).toHaveLength(2);
  });

  it('mixes across rows, allows touching windows and detects nested overlaps within a row', () => {
    const { project, asset, clip, track } = audioProject();
    const otherTrack = createAudioTrack('Music');
    project.tracks.push(otherTrack);
    project.audioClips.push(createAudioClip(asset.id, otherTrack.id, 10, 20));
    project.audioClips.push(createAudioClip(asset.id, track.id, 20, 30));
    expect(validateProject(project)).toEqual([]);
    project.audioClips.push(createAudioClip(asset.id, track.id, 11, 12));
    project.audioClips.push(createAudioClip(asset.id, track.id, 13, 14));
    const overlap = validateProject(project).filter((issue) => issue.code === 'track-overlap');
    expect(overlap).toHaveLength(2);
    expect(clip.end).toBe(20);
  });

  it('includes audio entities and volume points in the global ID namespace', () => {
    const { project, asset, clip } = audioProject();
    asset.id = project.tracks[0]!.id;
    clip.assetId = asset.id;
    clip.volume[0]!.id = clip.id;
    const duplicates = validateProject(project).filter((issue) => issue.code === 'duplicate-id');
    expect(duplicates.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['audioAssets', 'audioClips']),
    );
  });

  it('preserves source recordings beyond one hour when clips use a short interval', () => {
    const { project, asset, clip } = audioProject();
    asset.duration = 3 * 3600;
    clip.sourceStart = 2 * 3600;
    const parsed = parseProject(serializeProject(project));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.issues).toEqual([]);
    expect(parsed.project.audioAssets[0]!.duration).toBe(3 * 3600);
  });
});
