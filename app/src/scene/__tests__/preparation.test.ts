// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clipLifetimes,
  createAppear,
  createDisappear,
  createRelation,
  validateProject,
  type Target,
} from '../../model';
import { generatePython } from '../../export/codegen';
import { createContext } from '../../export/codegen/context';
import { buildEvents, createEvaluator, exportEvaluator } from '../index';
import { byKey, centerOf, plainClip, sceneWith, summary } from './sceneKit';

vi.mock('../../model/lifetime', async (original) => {
  const actual = await original<typeof import('../../model/lifetime')>();
  return { ...actual, clipLifetimes: vi.fn(actual.clipLifetimes) };
});

afterEach(() => vi.clearAllMocks());

async function fixture(target: Target = 'ce') {
  const scene = await sceneWith({ a: 'abcd', b: 'xy' }, target);
  const appear = createAppear(1, 'fade_in', [3], { duration: 0.5 });
  const disappear = createDisappear(4, 'fade_out', [2], { duration: 0.5 });
  const a = plainClip(scene, 'a', 0, 0, 6, { actions: [appear, disappear] });
  const b = plainClip(scene, 'b', 1, 0, 6);
  a.id = 'clip-a';
  b.id = 'clip-b';
  const relation = createRelation(a.id, b.id, {
    offset: 2,
    duration: 1,
    pairs: [{ from: [0, 1], to: [0], style: 'transform', extras: 'copies', principal: 1 }],
  });
  scene.project.relations.push(relation);
  return { ...scene, a, b, appear, disappear, relation };
}

const exportOptions = (target: Target) => ({
  target,
  sceneName: 'Prepared',
  indexing: 'auto' as const,
  comments: true,
});

describe('operation-local lifetime preparation', () => {
  it('reuses caller lifetimes without mutating them or changing event ordering', async () => {
    const { project, a, b, appear, disappear, relation } = await fixture();
    const expected = buildEvents(project);
    expect(expected.map((event) => event.id)).toEqual([
      `intro:${a.id}`,
      `intro:${b.id}`,
      `appear:${appear.id}`,
      `relation:${relation.id}`,
      `disappear:${disappear.id}`,
      `outro:${a.id}`,
      `outro:${b.id}`,
    ]);
    const lifetimes = clipLifetimes(project);
    const before = structuredClone(lifetimes);
    vi.mocked(clipLifetimes).mockClear();

    expect(buildEvents(project, lifetimes)).toEqual(expected);
    expect(clipLifetimes).not.toHaveBeenCalled();
    expect(lifetimes).toEqual(before);
    expect(expected.find((event) => event.id === `outro:${a.id}`)).toMatchObject({
      except: [1, 2], // The authored principal is consumed; the other source is copied.
    });
  });

  it('simulates once for each evaluator and codegen context', async () => {
    const { project, formulas } = await fixture();
    const evaluator = createEvaluator(project, formulas);
    expect(clipLifetimes).toHaveBeenCalledExactlyOnceWith(project);
    vi.mocked(clipLifetimes).mockClear();

    const context = createContext(project, formulas, exportOptions('ce'));
    expect(clipLifetimes).toHaveBeenCalledExactlyOnceWith(project);
    expect(context.events).toEqual(evaluator.events);
    vi.mocked(clipLifetimes).mockClear();

    // Export validation remains its own pass; codegen no longer prepares lifetimes twice.
    generatePython(project, formulas, exportOptions('ce'));
    expect(clipLifetimes).toHaveBeenCalledTimes(2);
  });

  it('evaluates an edited candidate, undo, and a later edit of that candidate afresh', async () => {
    const { project, formulas, a, appear } = await fixture();
    const original = createEvaluator(project, formulas);
    const before = summary(original.evaluate(2));
    expect(byKey(original.evaluate(2)).has(`${a.id}:3`)).toBe(true);
    const candidate = structuredClone(project);
    const candidateAppear = candidate.clips[0]!.actions[0]!;
    candidateAppear.start = 3;
    const issues = validateProject(candidate);
    const edited = createEvaluator(candidate, formulas);
    expect(edited.events.find((event) => event.id === `appear:${appear.id}`)).toMatchObject({
      start: 3,
      end: 3.5,
    });
    expect(byKey(edited.evaluate(2)).has(`${a.id}:3`)).toBe(false);
    expect(summary(createEvaluator(project, formulas).evaluate(2))).toEqual(before);
    expect(validateProject(candidate)).toEqual(issues);

    candidateAppear.start = 1;
    expect(summary(createEvaluator(candidate, formulas).evaluate(2))).toEqual(before);
  });

  it('uses a replacement render map for the same project', async () => {
    const { project, formulas, a } = await fixture();
    const original = createEvaluator(project, formulas);
    const before = byKey(original.evaluate(0.5));
    const resolved = formulas.get(a.formulaId)!;
    const replacement = new Map(formulas);
    replacement.set(a.formulaId, {
      ...resolved,
      canonToRender: [1, 0, ...resolved.canonToRender.slice(2)],
    });
    const after = byKey(createEvaluator(project, replacement).evaluate(0.5));
    expect(centerOf(after.get(`${a.id}:0`)!)).toEqual(centerOf(before.get(`${a.id}:1`)!));
    expect(centerOf(after.get(`${a.id}:0`)!)).not.toEqual(centerOf(before.get(`${a.id}:0`)!));
    expect(summary(original.evaluate(0.5))).toEqual(
      summary(createEvaluator(project, formulas).evaluate(0.5)),
    );
  });

  it('preserves complete diagnostic values and order for an invalid candidate', async () => {
    const { project, formulas } = await fixture();
    const candidate = structuredClone(project);
    candidate.clips[0]!.actions.push(createDisappear(1.5, 'fade_out', [0, 1], { duration: 1 }));
    const issues = validateProject(candidate);
    expect(issues.some((issue) => issue.identity !== undefined)).toBe(true);
    createEvaluator(candidate, formulas);
    const output = generatePython(candidate, formulas, exportOptions('ce'));
    expect(output.issues.slice(0, issues.length)).toEqual(issues);
    expect(validateProject(candidate)).toEqual(issues);
  });

  it.each(['ce', 'gl'] as const)(
    'keeps hidden tracks in %s exports and their warning',
    async (target) => {
      const { project, formulas, a } = await fixture(target);
      const options = exportOptions(target);
      const visible = generatePython(project, formulas, options);
      const visibleEvaluator = exportEvaluator(project, formulas);
      const expectedFrames = [0.5, 2.5, 3.5, 4.5].map((time) =>
        summary(visibleEvaluator.evaluate(time)),
      );
      const hidden = structuredClone(project);
      hidden.tracks[0]!.hidden = true;
      expect(
        createEvaluator(hidden, formulas)
          .evaluate(0.5)
          .some((glyph) => glyph.clipId === a.id),
      ).toBe(false);
      const exported = exportEvaluator(hidden, formulas);
      expect([0.5, 2.5, 3.5, 4.5].map((time) => summary(exported.evaluate(time)))).toEqual(
        expectedFrames,
      );
      expect(exported.events).toEqual(buildEvents(project));

      const output = generatePython(hidden, formulas, options);
      expect(output.code).toBe(visible.code);
      expect(output.issues.filter((issue) => issue.code !== 'export-hidden-track')).toEqual(
        visible.issues,
      );
      expect(output.issues.filter((issue) => issue.code === 'export-hidden-track')).toEqual([
        {
          severity: 'warning',
          code: 'export-hidden-track',
          message: `Track "${project.tracks[0]!.name}" is hidden in the preview but is exported like the others.`,
          path: ['tracks', 0, 'hidden'],
        },
      ]);
    },
  );
});
