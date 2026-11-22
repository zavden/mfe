/* Authored audio commands. Original bytes and derived waveforms never enter history. */
import {
  AUDIO_PROJECT_DURATION_LIMIT,
  createAudioClip,
  createAudioTrack,
  defaultAudioFadeDuration,
  duplicateAudioClip,
  setAudioFade,
  splitAudioClip,
  type AudioClip,
  type Project,
} from '../../model';
import { history, useProjectStore, useUiStore, type Selection } from '../../store';
import { notify } from '../project/noticeStore';
import { findFreeSlot, newAudioTrackName } from './clipOps';

export function audioEditable(project: Project, clip: AudioClip): boolean {
  return project.tracks.some(
    (track) => track.id === clip.trackId && track.kind === 'audio' && !track.locked,
  );
}

/** The audio clips of the selection that can be edited: what the S key splits at the playhead
 * and Delete removes. While there is one, S is the timeline's (the preview's circle selector,
 * which S switches otherwise, leaves it alone: `project/shortcuts.ts`). */
export function selectedEditableAudio(project: Project, selection: Selection): AudioClip[] {
  if (selection.kind !== 'clips') return [];
  const selected = new Set(selection.ids);
  return project.audioClips.filter((clip) => selected.has(clip.id) && audioEditable(project, clip));
}

/** Place a selected source interval; a new row is used when existing rows cannot hold it at
 * the playhead. Never silently shorten a long recording. */
export function placeAudio(
  project: Project,
  assetId: string,
  start: number,
  sourceStart: number,
  sourceEnd: number,
  trackId?: string,
): AudioClip | null {
  const asset = project.audioAssets.find((candidate) => candidate.id === assetId);
  const duration = sourceEnd - sourceStart;
  if (
    !asset ||
    ![start, sourceStart, sourceEnd].every(Number.isFinite) ||
    start < 0 ||
    sourceStart < 0 ||
    sourceEnd > asset.duration ||
    duration <= 0 ||
    start + duration > AUDIO_PROJECT_DURATION_LIMIT
  )
    return null;
  const fits = (id: string) => Math.abs(findFreeSlot(project, id, start, duration) - start) < 1e-6;
  let track = trackId
    ? project.tracks.find(
        (candidate) =>
          candidate.id === trackId &&
          candidate.kind === 'audio' &&
          !candidate.locked &&
          fits(candidate.id),
      )
    : project.tracks.find(
        (candidate) => candidate.kind === 'audio' && !candidate.locked && fits(candidate.id),
      );
  if (!track && trackId) return null;
  if (!track) {
    track = createAudioTrack(newAudioTrackName(project.tracks));
    project.tracks.push(track);
  }
  const clip = createAudioClip(assetId, track.id, start, start + duration, { sourceStart });
  project.audioClips.push(clip);
  return clip;
}

export function addAudioToTimeline(
  assetId: string,
  sourceStart: number,
  sourceEnd: number,
  start = useUiStore.getState().time,
  trackId?: string,
): boolean {
  let id: string | null = null;
  useProjectStore.getState().update((draft) => {
    id = placeAudio(draft, assetId, start, sourceStart, sourceEnd, trackId)?.id ?? null;
  });
  if (id) {
    useUiStore.getState().select({ kind: 'clips', ids: [id] });
    if (typeof requestAnimationFrame !== 'undefined')
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-clip-id="${CSS.escape(id!)}"]`)
          ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }),
      );
  } else
    notify({
      kind: 'warning',
      title: 'Audio does not fit here',
      message:
        'Choose an unlocked audio track with space and a source interval that ends within 60 minutes of project time.',
    });
  return id !== null;
}

export function editAudioClip(id: string, edit: (clip: AudioClip, project: Project) => void): void {
  useProjectStore.getState().update((draft) => {
    const clip = draft.audioClips.find((candidate) => candidate.id === id);
    if (clip && audioEditable(draft, clip)) edit(clip, draft);
  });
}

/** Inside a project update: the audio clips of `ids` that can be edited and that `time` is
 * inside are cut in two there. Returns the ids of the halves (`splitAtPlayhead`,
 * `splitActions.ts`). */
export function splitAudioAt(draft: Project, ids: ReadonlySet<string>, time: number): string[] {
  const result: string[] = [];
  draft.audioClips = draft.audioClips.flatMap((clip) => {
    if (!ids.has(clip.id) || !audioEditable(draft, clip) || time <= clip.start || time >= clip.end)
      return [clip];
    const pieces = splitAudioClip(clip, time);
    if (!pieces) return [clip];
    result.push(...pieces.map((piece) => piece.id));
    return pieces;
  });
  return result;
}

export function duplicateAudioClips(project: Project, ids: ReadonlySet<string>): AudioClip[] {
  const copies: AudioClip[] = [];
  const scratch = { ...project, audioClips: [...project.audioClips] };
  for (const clip of project.audioClips) {
    if (!ids.has(clip.id) || !audioEditable(project, clip)) continue;
    const start = findFreeSlot(scratch, clip.trackId, clip.end, clip.end - clip.start);
    if (start + clip.end - clip.start > AUDIO_PROJECT_DURATION_LIMIT) continue;
    const copy = duplicateAudioClip(clip, start);
    scratch.audioClips.push(copy);
    copies.push(copy);
  }
  return copies;
}

/** Copy the audio clips of `ids` that can be edited, each into the free time after it, as one
 * undo step, and select the copies (the audio menu's Duplicate). A drag still held is given up
 * first: the copies are of the clips it leaves. */
export function duplicateAudio(ids: ReadonlySet<string>): void {
  history.cancelForeignGesture();
  const { project, update } = useProjectStore.getState();
  const copies = duplicateAudioClips(project, ids);
  update((draft) => {
    draft.audioClips.push(...copies);
  });
  if (copies.length) {
    useUiStore.getState().select({ kind: 'clips', ids: copies.map((copy) => copy.id) });
  }
}

export function fadeAudioClip(id: string, side: 'in' | 'out', duration?: number): void {
  editAudioClip(id, (clip) =>
    Object.assign(clip, setAudioFade(clip, side, duration ?? defaultAudioFadeDuration(clip))),
  );
}
