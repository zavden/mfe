// @vitest-environment node
/* The Python of a tween that carries a shape to other glyphs (`TweenFit`, D123): the new shape is
 * built on the target before the play the tween starts in, and `Transform` carries the one to the
 * other. The whole scene of a project of them is pinned (`shape-fits`) and rendered in both
 * libraries by the export check; here, what the lines are made of. */
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../../engine';
import {
  createClip,
  createEmptyProject,
  createFitTween,
  createFormula,
  createShapeAttach,
  createShapeFormula,
  createTween,
  defaultIntro,
  defaultOutro,
  setIdGenerator,
  type ClipAction,
  type ShapeFormula,
  type Target,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import { settleScene } from '../../../scene';
import { generatePython } from '..';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** Two boxes `host` (at the left) and `other` (bigger, at the right) over [0, 6), and a shape
 * `mark` of `fields` around the first from 1 s, with `actions` — which get the id of `other`'s
 * clip to go to. The Python for `target`, and its lines that say `mark`. */
function python(
  target: Target,
  fields: Partial<ShapeFormula>,
  actions: (otherClip: string, hostClip: string) => ClipAction[],
  hideOther = false,
) {
  const restore = setIdGenerator(sequentialIds());
  try {
    const project = createEmptyProject();
    project.meta.target = target;
    const host = createShapeFormula({ name: 'host', width: 2, height: 1 });
    const other = createShapeFormula({ name: 'other', width: 3, height: 2 });
    const mark = createShapeFormula({ name: 'mark', ...fields });
    project.formulas.push(host, other, mark);
    const a = createClip(host.id, project.tracks[0]!.id, 0, 6, none);
    a.initial.position = [-3, 1];
    const b = createClip(other.id, project.tracks[1]!.id, 0, 6, none);
    b.initial.position = [3, -1];
    const c = createClip(mark.id, project.tracks[0]!.id, 6, 12, {
      ...none,
      attach: createShapeAttach(a.id, 'all', 0.2),
      actions: actions(b.id, a.id),
    });
    c.start = 1;
    c.end = 6;
    project.tracks.push({ ...project.tracks[0]!, id: 't3', name: 'Track 3' });
    c.trackId = 't3';
    project.clips.push(a, b, c);
    const local = refreshLocalRenders(project, new Map());
    const settled = settleScene(local.project, local.formulas, refreshLocalRenders);
    // The other object turned into a formula with nothing written, after the fit was made: it
    // draws nothing, so the Python has no mobject of it.
    const exported = hideOther
      ? {
          ...settled.project,
          formulas: settled.project.formulas.map((formula) =>
            formula.id === other.id
              ? { ...createFormula({ name: 'other', source: '' }), id: other.id }
              : formula,
          ),
        }
      : settled.project;
    const out = generatePython(exported, settled.formulas, {
      target,
      sceneName: 'Fits',
      indexing: 'auto',
      comments: false,
    });
    const lines = out.code.split('\n').map((line) => line.trim());
    return { issues: out.issues, lines, mark: lines.filter((line) => line.includes('mark')) };
  } finally {
    restore();
  }
}

describe('the Python of a tween’s fit', () => {
  it('builds the new shape on the target, by the shape’s constructor and with its gap, then transforms', () => {
    const ce = python('ce', { shape: 'box', cornerRadius: 0.1 }, (other) => [
      createFitTween(1, 1, { clipId: other, glyphs: 'all' }, [], {}, 'linear'),
    ]);
    expect(ce.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(ce.mark).toEqual([
      'mark = SurroundingRectangle(host, buff=0.2, color="#FFFF00", corner_radius=0.1)',
      'self.add(mark)',
      'mark_to = SurroundingRectangle(other, buff=0.2, color="#FFFF00", corner_radius=0.1)',
      'self.play(Transform(mark, mark_to, rate_func=linear), run_time=1)',
    ]);
    // ManimGL rounds the corners after building, here as for the shape itself.
    const gl = python('gl', { shape: 'box', cornerRadius: 0.1 }, (other) => [
      createFitTween(1, 1, { clipId: other, glyphs: 'all' }),
    ]);
    expect(gl.mark).toContain(
      'mark_to = SurroundingRectangle(other, buff=0.2, color="#FFFF00").round_corners(0.1)',
    );
    expect(gl.mark).toContain('self.play(Transform(mark, mark_to), run_time=1)');
  });

  it('builds each kind by its own class, on a group when the fit spans several clips', () => {
    const also = (other: string, host: string) => [
      createFitTween(1, 1, { clipId: other, glyphs: 'all' }, [{ clipId: host, glyphs: 'all' }]),
    ];
    expect(python('ce', { shape: 'circle' }, also).mark).toContain(
      'mark_to = _circle_around(VGroup(other, host), buff=0.2, color="#FC6255")',
    );
    expect(python('ce', { shape: 'underline' }, also).mark).toContain(
      'mark_to = Underline(VGroup(other, host), buff=0.2, color="#FFFFFF")',
    );
    expect(python('gl', { shape: 'cross' }, also).mark).toContain(
      'mark_to = Cross(VGroup(other, host), stroke_color="#FC6255", stroke_width=6)',
    );
  });

  it('gives the new shape the colours and the paint the tween arrives with', () => {
    const { mark } = python('ce', { shape: 'box' }, (other) => [
      createTween(0.2, 0.5, { opacity: 0.5 }, 'linear'),
      createFitTween(1, 1, { clipId: other, glyphs: 'all' }, [], {
        color: '#FF0000',
        strokeWidth: 8,
        fillOpacity: 0.4,
        fillColor: '#0000FF',
      }),
    ]);
    // A shape its tweens repaint says the colour of its fill from the start.
    expect(mark[0]).toBe(
      'mark = SurroundingRectangle(host, buff=0.2, color="#FFFF00").set_fill("#FFFF00")',
    );
    // The clip's opacity, 0.5 by then, is in both opacities.
    expect(mark).toContain(
      'mark_to = SurroundingRectangle(other, buff=0.2, color="#FF0000", stroke_width=8, fill_opacity=0.2, stroke_opacity=0.5).set_fill("#0000FF")',
    );
  });

  it('numbers the shapes of a chain, and a later tween starts from where the fit left the shape', () => {
    const { mark } = python('ce', { shape: 'box' }, (other, host) => [
      createFitTween(1, 1, { clipId: other, glyphs: 'all' }),
      createFitTween(2.5, 1, { clipId: host, glyphs: 'all' }),
      createTween(4, 0.5, { position: [0, 0] }),
    ]);
    expect(mark.filter((line) => line.startsWith('mark_to'))).toEqual([
      'mark_to = SurroundingRectangle(other, buff=0.2, color="#FFFF00")',
      'mark_to_2 = SurroundingRectangle(host, buff=0.2, color="#FFFF00")',
    ]);
    expect(mark).toContain('self.play(Transform(mark, mark_to_2), run_time=1)');
    // Back on the first box, at (−3, 1): the plain tween moves it from there to the origin.
    expect(mark.at(-1)).toBe('self.play(mark.animate.move_to([0, 0, 0]), run_time=0.5)');
  });

  it('builds the new shape at the size and the place the editor fitted it to, for a target it has no mobject for', () => {
    const { mark } = python(
      'ce',
      { shape: 'box' },
      (other) => [createFitTween(1, 1, { clipId: other, glyphs: 'all' })],
      true,
    );
    // The other box is 3 × 2 at (3, −1): 0.2 wider all round.
    expect(mark.filter((line) => line.startsWith('mark_to'))).toEqual([
      'mark_to = Rectangle(width=3.4, height=2.4, color="#FFFF00").move_to([3, -1, 0])',
    ]);
  });
});
