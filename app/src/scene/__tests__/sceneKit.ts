/* Test helpers: formulas rendered with the mock engine, projects and the drawable summaries the
 * evaluator tests compare. */
import { resolveFormula, toSnapshot, type FormulaRender, type ResolvedFormula } from '../../engine';
import { createMockEngine } from '../../test/mockEngine';
import {
  createClip,
  createEmptyProject,
  createFormula,
  defaultIntro,
  defaultOutro,
  type Clip,
  type Formula,
  type Project,
  type Target,
} from '../../model';
import { boxCenter, contoursBox } from '../../geom';
import { expect } from 'vitest';
import type { Drawable, SceneEvaluator } from '../index';

export async function mockRender(latex: string, target: Target = 'ce'): Promise<FormulaRender> {
  const result = await createMockEngine().render({
    kind: 'math',
    latex,
    packages: [],
    preamble: '',
    target,
    fontSize: 48,
    prefer: 'auto',
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.render;
}

export interface Scene {
  project: Project;
  formulas: Map<string, ResolvedFormula>;
  /** formula name → formula */
  f: Record<string, Formula>;
}

/** A project with the given formulas (name → latex), no clips yet. */
export async function sceneWith(
  latexByName: Record<string, string>,
  target: Target = 'ce',
): Promise<Scene> {
  const project = createEmptyProject();
  project.meta.target = target;
  const formulas = new Map<string, ResolvedFormula>();
  const f: Record<string, Formula> = {};
  for (const [name, latex] of Object.entries(latexByName)) {
    const render = await mockRender(latex, target);
    const formula = createFormula({ name, source: latex, snapshot: toSnapshot(render) });
    project.formulas.push(formula);
    formulas.set(formula.id, resolveFormula(formula, render));
    f[name] = formula;
  }
  return { project, formulas, f };
}

/** A clip without intro/outro animation unless `fields` says otherwise. */
export function plainClip(
  scene: Scene,
  formula: string,
  track: number,
  start: number,
  end: number,
  fields: Partial<Omit<Clip, 'id' | 'formulaId' | 'trackId' | 'start' | 'end'>> = {},
): Clip {
  const clip = createClip(scene.f[formula]!.id, scene.project.tracks[track]!.id, start, end, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
    ...fields,
  });
  scene.project.clips.push(clip);
  return clip;
}

export function centerOf(d: Drawable): [number, number] {
  return boxCenter(contoursBox(d.path.contours));
}

/** `clipId:glyph` → drawable. */
export function byKey(drawn: readonly Drawable[]): Map<string, Drawable> {
  return new Map(drawn.map((d) => [d.key, d]));
}

/** Compact, comparable form of a drawable list. */
export function summary(drawn: readonly Drawable[]) {
  const r = (x: number) => Math.round(x * 1e6) / 1e6;
  return drawn.map((d) => ({
    key: d.key,
    z: d.z,
    fill: d.fill && { ...d.fill, opacity: r(d.fill.opacity) },
    stroke: d.stroke && { ...d.stroke, opacity: r(d.stroke.opacity), width: r(d.stroke.width) },
    path: d.path.contours.map((c) => c.map(r)),
  }));
}

/** Keep transfer and Morph scenarios distinct while sharing their reverse/replay contract. */
export function expectReverseReplay(
  evaluator: SceneEvaluator,
  freshEvaluator: () => SceneEvaluator,
  times: readonly number[],
): void {
  const first = times.map((t) => summary(evaluator.evaluate(t)));
  const fresh = freshEvaluator();
  [...times].reverse().forEach((t, i) => {
    expect(summary(fresh.evaluate(t)), `reverse t=${t}`).toEqual(first[times.length - 1 - i]);
  });
  times.forEach((t, i) => {
    expect(summary(evaluator.evaluate(t)), `replay t=${t}`).toEqual(first[i]);
  });
}
