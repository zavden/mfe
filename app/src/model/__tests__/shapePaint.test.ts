// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createShapeFormula,
  createTween,
  FORMAT_VERSION,
  hasPaint,
  PAINT_FIELDS,
  paintsApart,
  parseProject,
  serializeProject,
  shapePaint,
  type Project,
} from '../index';
import { smallProject } from './fixtures';

/* A shape's paint (format 23, D123): the object's fill colour, in the file as `fillColor` when it
 * has one, and what a Transform sets of the paint — `strokeWidth`, `strokeOpacity`, `fillOpacity`,
 * `fillColor` in a clip state. */

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};

/** The small project with a box `s1` on a clip of its own, repainted by a Transform. */
function painted(): Project {
  const project = smallProject();
  const box = createShapeFormula({ name: 's1', width: 2, height: 1, fillColor: '#ff8800' });
  project.formulas.push(box);
  const clip = createClip(box.id, project.tracks[0]!.id, 20, 26, {
    actions: [
      createTween(1, 1, { strokeWidth: 8, strokeOpacity: 0.4, fillOpacity: 0.8 }),
      createTween(3, 1, { fillColor: '#00ff00' }),
    ],
  });
  project.clips.push(clip);
  return project;
}

describe('shapePaint', () => {
  const box = createShapeFormula({ name: 's1' });

  it('is the object’s own style, and a fill of the stroke’s colour, while no state sets any', () => {
    expect(shapePaint(box)).toEqual({
      strokeWidth: 4,
      strokeOpacity: 1,
      fillOpacity: 0,
      fillColor: null,
    });
    expect(shapePaint({ ...box, fillColor: '#FF8800' }).fillColor).toBe('#FF8800');
  });

  it('takes what a state sets, field by field, over the object’s', () => {
    const own = { ...box, fillColor: '#FF8800' };
    expect(shapePaint(own, { strokeWidth: 8, fillOpacity: 0.5 })).toEqual({
      strokeWidth: 8,
      strokeOpacity: 1,
      fillOpacity: 0.5,
      fillColor: '#FF8800',
    });
    expect(shapePaint(own, { fillColor: '#00FF00', strokeOpacity: 0 })).toMatchObject({
      strokeOpacity: 0,
      fillColor: '#00FF00',
    });
    // Zero is a value, not "unset".
    expect(shapePaint(box, { strokeWidth: 0 }).strokeWidth).toBe(0);
  });

  it('knows a state that sets some paint, and a shape whose paint is read from its states', () => {
    expect(PAINT_FIELDS).toEqual(['strokeWidth', 'strokeOpacity', 'fillOpacity', 'fillColor']);
    expect(hasPaint({})).toBe(false);
    expect(hasPaint({ fillOpacity: 0 })).toBe(true);
    expect(paintsApart(box, [{}, {}])).toBe(false);
    expect(paintsApart(box, [{}, { strokeWidth: 2 }])).toBe(true);
    expect(paintsApart({ ...box, fillColor: '#FF8800' }, [])).toBe(true);
    // A brace or a formula has no paint of its own, whatever a state says.
    const formula = smallProject().formulas[0]!;
    expect(paintsApart(formula, [{ strokeWidth: 2 }])).toBe(false);
  });
});

describe('a shape’s paint, in the file', () => {
  it('is kept by a save and a load, the colours in upper case', () => {
    const text = serializeProject(painted());
    const again = opened(text);
    const box = again.formulas.at(-1)!;
    expect(box).toMatchObject({ kind: 'shape', fillColor: '#FF8800' });
    const [first, second] = again.clips.at(-1)!.actions;
    expect(first).toMatchObject({
      kind: 'tween',
      to: { strokeWidth: 8, strokeOpacity: 0.4, fillOpacity: 0.8 },
    });
    expect(second).toMatchObject({ kind: 'tween', to: { fillColor: '#00FF00' } });
    expect(serializeProject(opened(serializeProject(again)))).toBe(serializeProject(again));
  });

  it('is absent from a shape without a fill colour and from a state that sets none', () => {
    const project = painted();
    delete (project.formulas.at(-1) as { fillColor?: string }).fillColor;
    project.clips.at(-1)!.actions = [createTween(1, 1, { opacity: 0.5 })];
    const text = serializeProject(opened(serializeProject(project)));
    const again = opened(text);
    expect('fillColor' in again.formulas.at(-1)!).toBe(false);
    const tween = again.clips.at(-1)!.actions[0]!;
    expect(tween.kind === 'tween' && Object.keys(tween.to)).toEqual(['opacity']);
    expect(Object.keys(again.clips.at(-1)!.initial)).not.toEqual(
      expect.arrayContaining([...PAINT_FIELDS]),
    );
    // Only the object's own style names a stroke width: once in the whole file.
    expect(text.match(/"strokeWidth"/g)).toHaveLength(1);
    expect(text).not.toContain('"fillColor"');
  });

  it('is not in a file of format 22, which opens as it is', () => {
    const text = serializeProject(opened(serializeProject(smallProject())));
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 22');
    expect(old).not.toBe(text);
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(22);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(serializeProject(result.project)).toBe(text);
  });

  it.each([
    ['strokeWidth', -1],
    ['strokeOpacity', 1.5],
    ['fillOpacity', -0.1],
    ['fillColor', 'orange'],
  ])('refuses a state whose %s is %s', (field, value) => {
    const project = painted();
    const tween = project.clips.at(-1)!.actions[0]!;
    (tween as unknown as { to: Record<string, unknown> }).to[field] = value;
    expect(parseProject(serializeProject(project)).ok).toBe(false);
  });

  it('refuses a fill colour that is not a colour', () => {
    const project = painted();
    (project.formulas.at(-1) as { fillColor?: unknown }).fillColor = 'none';
    expect(parseProject(serializeProject(project)).ok).toBe(false);
  });
});
