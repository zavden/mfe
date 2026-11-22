/* Small scenes for the animation-block tests: one formula of `glyphs` boxes in a row (a MathJax
 * snapshot) on one clip of the first track, without an outro; and the owner's three-row
 * derivation. */
import {
  createClip,
  createEmptyProject,
  createFormula,
  defaultIntro,
  defaultOutro,
  type Clip,
  type ClipAction,
  type Formula,
  type IntroSpec,
  type Project,
} from '../../../model';

export interface OneClipOptions {
  glyphs: number;
  start: number;
  end: number;
  actions?: ClipAction[];
  /** Default: no intro. */
  intro?: IntroSpec;
  hiddenGlyphs?: number[];
  /** Other fields of the clip. */
  fields?: Partial<Clip>;
}

export function oneClipScene(options: OneClipOptions): {
  project: Project;
  clip: Clip;
  formula: Formula;
} {
  const project = createEmptyProject();
  const glyphs = Array.from({ length: options.glyphs }, (_, i) => ({
    label: String(i),
    center: [i, 0] as [number, number],
    size: [1, 1] as [number, number],
  }));
  const formula = createFormula({
    name: 'f',
    snapshot: { backend: 'mathjax', key: 'k', glyphs },
    hiddenGlyphs: options.hiddenGlyphs ?? [],
  });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, options.start, options.end, {
    intro: options.intro ?? defaultIntro('none'),
    outro: defaultOutro('none'),
    actions: options.actions ?? [],
    ...options.fields,
  });
  project.clips.push(clip);
  return { project, clip, formula };
}

/** The owner's derivation `A &= x_1 \\ &= x_2 \\ &= x_3` as MathJax draws it: ten glyphs in
 * three aligned rows (A = x 1 | = x 2 | = x 3, the subscripts a little lower), on a clip over
 * [0, 10] with Write and FadeOut and nothing hidden (a Morph target skips the intro by arriving). */
export function derivationScene(actions: ClipAction[] = []): {
  project: Project;
  clip: Clip;
  formula: Formula;
} {
  const labels = ['A', '=', 'x', '1', '=', 'x', '2', '=', 'x', '3'];
  const columns = [0, 0.6, 1.2, 1.45, 0.6, 1.2, 1.45, 0.6, 1.2, 1.45];
  const rows = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2];
  const subscript = (i: number) => (i === 3 || i === 6 || i === 9 ? 0.15 : 0);
  const project = createEmptyProject();
  const formula = createFormula({
    name: 'steps',
    source: 'A &= x_1 \\\\ &= x_2 \\\\ &= x_3',
    snapshot: {
      backend: 'mathjax',
      key: 'rows',
      glyphs: labels.map((label, i) => ({
        label,
        center: [columns[i]!, -rows[i]! * 1.2 - subscript(i)],
        size: [0.3, 0.4],
      })),
    },
  });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 10, {
    intro: defaultIntro('write'),
    outro: defaultOutro('fade_out'),
    actions,
  });
  project.clips.push(clip);
  return { project, clip, formula };
}
