/* Stable read-only visual selectors. Audio curve/progress edits do not rebuild formula geometry. */
import { sceneDuration, visualProject, type Project } from '../model';

/** One selector instance per consumer. Preview includes the authored audio duration in its
 * effective metadata, so visuals disappear normally while an audio tail continues. Native
 * Python uses the visual automatic length. Neither view carries audio assets or clip curves. */
export function createVisualProjectSelector(includeAudioDuration = false) {
  let source: Project | undefined;
  let selected: Project | undefined;
  return (state: { project: Project }): Project => {
    const project = state.project;
    if (project === source && selected) return selected;
    const visual = visualProject(project);
    const duration = includeAudioDuration ? sceneDuration(project) : sceneDuration(visual);
    const needsDuration = includeAudioDuration && duration !== sceneDuration(visual);
    const meta = needsDuration
      ? source?.meta === project.meta && selected?.meta.duration === duration
        ? selected.meta
        : { ...project.meta, duration }
      : project.meta;
    source = project;
    if (
      selected &&
      meta === selected.meta &&
      visual.formulas === selected.formulas &&
      visual.clips === selected.clips &&
      visual.relations === selected.relations &&
      visual.colorMatches === selected.colorMatches &&
      visual.tracks.length === selected.tracks.length &&
      visual.tracks.every((track, i) => track === selected!.tracks[i])
    )
      return selected;
    selected = meta === visual.meta ? visual : { ...visual, meta };
    return selected;
  };
}
