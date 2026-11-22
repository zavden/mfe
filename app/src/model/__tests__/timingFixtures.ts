import {
  createAttach,
  createClip,
  createEmptyProject,
  createFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Clip,
  type ClipAction,
  type Project,
} from '../index';

export const noPhases = () => ({ intro: defaultIntro('none'), outro: defaultOutro('none') });
export const timingErrorsOf = (project: Project) =>
  validateProject(project).filter((issue) => issue.severity === 'error');

export function timingScene(actions: ClipAction[] = []) {
  const project = createEmptyProject();
  const formula = createFormula({
    name: 'Target',
    source: 'xx',
    snapshot: {
      backend: 'mathjax',
      key: 'timing-two-glyphs',
      glyphs: [0, 1].map((i) => ({
        label: 'x',
        center: [i, 0] as [number, number],
        size: [1, 1] as [number, number],
      })),
    },
  });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 10, {
    ...noPhases(),
    actions,
  });
  project.clips.push(clip);
  return { project, clip, formula };
}

export function attachmentConsumer(
  project: Project,
  target: Clip,
  start = 5,
  glyphs: number[] = [0],
): Clip {
  const track = createTrack(`Label ${project.clips.length}`);
  project.tracks.push(track);
  const clip = createClip(target.formulaId, track.id, start, 10, {
    ...noPhases(),
    attach: createAttach(target.id, glyphs),
  });
  project.clips.push(clip);
  return clip;
}

export function withActionTiming(
  project: Project,
  clip: Clip,
  actionId: string,
  timing: { start: number; duration: number },
): Project {
  return {
    ...project,
    clips: project.clips.map((c) =>
      c.id === clip.id
        ? { ...c, actions: c.actions.map((a) => (a.id === actionId ? { ...a, ...timing } : a)) }
        : c,
    ),
  };
}
