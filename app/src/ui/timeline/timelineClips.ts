/* Raw clip lookup for timeline editors. Visual operations narrow to Clip before touching
 * glyphs/animations; movement and selection share only the temporal fields. */
import type { AudioClip, Clip, Project } from '../../model';

export type TimelineClip = Clip | AudioClip;

export function timelineClips(project: Project): TimelineClip[] {
  return [...project.clips, ...project.audioClips];
}

export function timelineClip(project: Project, id: string): TimelineClip | undefined {
  return (
    project.clips.find((clip) => clip.id === id) ??
    project.audioClips.find((clip) => clip.id === id)
  );
}

export function isAudioClip(clip: TimelineClip): clip is AudioClip {
  return 'assetId' in clip;
}

export function timelineClipName(project: Project, clip: TimelineClip): string {
  return isAudioClip(clip)
    ? (project.audioAssets.find((asset) => asset.id === clip.assetId)?.name ?? 'Missing audio')
    : (project.formulas.find((formula) => formula.id === clip.formulaId)?.name ??
        'Missing formula');
}
