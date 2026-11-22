/* Audio metadata fixtures; originals/decoded samples belong to the media/engine test layers. */
import { createAudioAsset, createAudioClip, createAudioTrack, createEmptyProject } from '../index';

export function audioProject() {
  const project = createEmptyProject('Audio');
  const track = createAudioTrack('Narration');
  const asset = createAudioAsset({
    name: 'Narration',
    originalName: 'narration.mp3',
    mimeType: 'audio/mpeg',
    byteLength: 128000,
    contentHash: 'a'.repeat(64),
    duration: 100,
    sampleRate: 48000,
    channels: 2,
  });
  const clip = createAudioClip(asset.id, track.id, 10, 20, {
    sourceStart: 30,
    volume: [
      { id: 'volume_before', time: 20, gain: 0.5 },
      { id: 'volume_start', time: 30, gain: 0 },
      { id: 'volume_end', time: 40, gain: 1 },
      { id: 'volume_after', time: 50, gain: 0.25 },
    ],
  });
  project.tracks.push(track);
  project.audioAssets.push(asset);
  project.audioClips.push(clip);
  return { project, asset, track, clip };
}
