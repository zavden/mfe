import { useProjectStore } from '../../store';
import { compositionConflict, type TextCompositionSession } from './textCompositionStore';

/** What the project says of a session as it stands: recomputed whenever the project changes. */
export function useSessionFacts(session: TextCompositionSession) {
  const project = useProjectStore((state) => state.project);
  const uses = project.clips.filter((clip) => clip.formulaId === session.original.id).length;
  const selectedClip = project.clips.find((clip) => clip.id === session.clipId);
  const selectedLocked =
    !!selectedClip && !!project.tracks.find((track) => track.id === selectedClip.trackId)?.locked;
  const placementEnabled =
    !session.clipId || (!!session.placement && !selectedLocked && !selectedClip?.attach);
  return {
    project,
    uses,
    selectedLocked,
    placementEnabled,
    conflict: compositionConflict(session),
  };
}
