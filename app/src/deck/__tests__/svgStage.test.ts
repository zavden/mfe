// @vitest-environment node
/* The SVG stage against the canvas: the same pieces, in the order the canvas paints them, for
 * every example of the repository; its groups and their names; the attributes it writes. */
import { beforeAll, describe, expect, it } from 'vitest';
import { makeScene, type Scene } from '../../embed/engine';
import { renderedExample, type Rendered } from '../../embed/__tests__/fixtures';
import type { Drawable } from '../../scene';
import { EXAMPLES } from '../../test/examples';
import { nodeDocument } from '../../test/nodeDocument';
import { clipNames } from '../names';
import { pathData } from '../pathData';
import { createSvgStage, type SvgStage } from '../svgStage';

const doc = nodeDocument();

const rendered = new Map<string, Rendered>();
beforeAll(async () => {
  for (const name of EXAMPLES) rendered.set(name, await renderedExample(name));
}, 120_000);

function staged(name: string): { scene: Scene; stage: SvgStage; names: Map<string, string> } {
  const { project, resolved } = rendered.get(name)!;
  const scene = makeScene(project, resolved, { includeHidden: true });
  const names = clipNames(project);
  return { scene, stage: createSvgStage(doc, scene, names), names };
}

/** What the canvas paints of an instant, in its order: the drawables with something to paint. */
function painted(drawables: readonly Drawable[]): Drawable[] {
  return drawables.filter((d) => {
    const fill = d.fill ? d.fill.opacity : 0;
    const stroke = d.stroke && d.stroke.width > 0 ? d.stroke.opacity : 0;
    return fill > 0 || stroke > 0;
  });
}

const paths = (stage: SvgStage) => [...stage.element.querySelectorAll('.mfe-scene path')];

describe('the SVG stage', () => {
  it.each(EXAMPLES)('draws %s piece by piece in the order the canvas paints', (name) => {
    const { scene, stage } = staged(name);
    const steps = Math.ceil(scene.duration * 8);
    let pieces = 0;
    // Forwards, and then back over the same instants: the stage keeps its elements between
    // frames, and what it kept must not change what it draws.
    const instants = Array.from({ length: steps + 1 }, (_, k) => (k / steps) * scene.duration);
    for (const t of [...instants, ...[...instants].reverse()]) {
      const drawables = scene.evaluate(t);
      stage.draw(drawables, scene.frameAt(t));
      const expected = painted(drawables);
      const drawn = paths(stage);
      expect(drawn.map((path) => path.getAttribute('d'))).toEqual(
        expected.map((d) => pathData(d.path.contours)),
      );
      expect(drawn.map((path) => path.getAttribute('fill'))).toEqual(
        expected.map((d) => (d.fill && d.fill.opacity > 0 ? d.fill.color : 'none')),
      );
      pieces += drawn.length;
    }
    expect(pieces).toBeGreaterThan(0);
  });

  it('has a group for each clip, by its name, and no id anywhere', () => {
    const { scene, stage, names } = staged('hello.mfe.json');
    const groups = [...stage.element.querySelectorAll('.mfe-clip')];
    expect(groups.map((group) => group.getAttribute('data-clip')).sort()).toEqual(
      [...names.values()].sort(),
    );
    for (const clip of scene.project.clips) {
      expect(stage.clip(clip.id)?.getAttribute('data-clip')).toBe(names.get(clip.id));
    }
    expect(stage.clip('c_nothing')).toBeNull();
    stage.draw(scene.evaluate(scene.duration / 2), scene.frame);
    expect(stage.element.querySelectorAll('[id]')).toHaveLength(0);
    expect(stage.element.getAttribute('class')).toBe('mfe-stage');
  });

  it('keeps a clip’s own glyphs in its group, each with its glyph index', () => {
    const { scene, stage, names } = staged('hello.mfe.json');
    const clip = scene.project.clips[0]!;
    // Once its intro is over and before anything takes its glyphs.
    const t = clip.start + clip.intro.duration + 0.01;
    const drawables = scene.evaluate(t);
    stage.draw(drawables, scene.frame);
    const own = painted(drawables).filter((d) => d.clipId === clip.id && !d.transfer);
    expect(own.length).toBeGreaterThan(0);
    const group = stage.element.querySelector(`[data-clip="${names.get(clip.id)}"]`)!;
    expect([...group.children].map((path) => path.getAttribute('data-glyph'))).toEqual(
      own.map((d) => String(d.glyph)),
    );
    expect([...group.children].every((path) => path.getAttribute('class') === 'mfe-glyph')).toBe(
      true,
    );
  });

  it('draws the glyphs in flight of a relation in its own group, named by its clips', () => {
    const { scene, stage, names } = staged('hello.mfe.json');
    const relation = scene.project.relations[0]!;
    const to = scene.project.clips.find((clip) => clip.id === relation.toClipId)!;
    const t = to.start + relation.offset + relation.duration / 2;
    const drawables = scene.evaluate(t);
    stage.draw(drawables, scene.frame);
    const flying = painted(drawables).filter((d) => d.transfer !== undefined);
    expect(flying.length).toBeGreaterThan(0);
    const [flight] = stage.flights();
    expect(flight).toMatchObject({ from: relation.fromClipId, to: relation.toClipId });
    expect(flight!.element.getAttribute('data-from')).toBe(names.get(relation.fromClipId));
    expect(flight!.element.getAttribute('data-to')).toBe(names.get(relation.toClipId));
    expect(flight!.element.children).toHaveLength(flying.length);
    // And after the relation, none is left there.
    stage.draw(scene.evaluate(to.start + relation.offset + relation.duration + 0.01), scene.frame);
    expect(flight!.element.children).toHaveLength(0);
  });

  it('draws what an emphasis adds for a moment in the effects group', () => {
    const { scene, stage } = staged('emphasis.mfe.json');
    let seen = 0;
    for (let k = 0; k <= scene.duration * 20; k++) {
      const drawables = scene.evaluate(k / 20);
      stage.draw(drawables, scene.frame);
      const temps = painted(drawables).filter((d) => d.role === 'temp');
      const effects = [...stage.element.querySelectorAll('.mfe-effects > *')];
      expect(effects).toHaveLength(temps.length);
      expect(effects.every((path) => path.getAttribute('class') === 'mfe-effect')).toBe(true);
      expect(effects.every((path) => !path.hasAttribute('data-glyph'))).toBe(true);
      seen += temps.length;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('writes the frame as its viewBox, y down, and follows the camera', () => {
    const { scene, stage } = staged('camera.mfe.json');
    stage.draw(scene.evaluate(0), scene.frame);
    const [x, y, width, height] = stage.element.getAttribute('viewBox')!.split(' ').map(Number);
    expect(height).toBe(8);
    expect(width).toBeCloseTo((8 * scene.project.meta.width) / scene.project.meta.height, 3);
    expect(x).toBeCloseTo(-width! / 2, 3);
    expect(y).toBe(-4);
    const boxes = new Set<string>();
    for (let k = 0; k <= scene.duration * 4; k++) {
      const t = k / 4;
      stage.draw(scene.evaluate(t), scene.frameAt(t));
      boxes.add(stage.element.getAttribute('viewBox')!);
    }
    expect(boxes.size).toBeGreaterThan(1);
  });

  it('paints a stroke as the canvas does: a hundredth of a unit per unit of Manim’s', () => {
    const { scene, stage } = staged('shapes.mfe.json');
    let stroked = 0;
    for (let k = 0; k <= scene.duration * 4; k++) {
      const drawables = scene.evaluate(k / 4);
      stage.draw(drawables, scene.frame);
      const expected = painted(drawables);
      paths(stage).forEach((path, index) => {
        const { stroke, fill } = expected[index]!;
        const has = !!stroke && stroke.opacity > 0 && stroke.width > 0;
        expect(path.getAttribute('stroke')).toBe(has ? stroke.color : null);
        expect(path.getAttribute('stroke-width')).toBe(
          has ? String(Math.round(stroke.width * 100) / 10000) : null,
        );
        const opacity = fill && fill.opacity > 0 && fill.opacity < 1 ? fill.opacity : null;
        expect(path.getAttribute('fill-opacity')).toBe(opacity === null ? null : String(opacity));
        if (has) stroked++;
      });
    }
    expect(stroked).toBeGreaterThan(0);
    const root = stage.element.querySelector('.mfe-scene')!;
    expect(root.getAttribute('stroke-linejoin')).toBe('miter');
    expect(root.getAttribute('stroke-miterlimit')).toBe('10');
    expect(root.getAttribute('stroke-linecap')).toBe('butt');
    expect(root.getAttribute('fill-rule')).toBe('nonzero');
  });

  it('writes a glyph that did not move once, and takes away what is no longer drawn', () => {
    const { scene, stage } = staged('hello.mfe.json');
    const clip = scene.project.clips[0]!;
    const t = clip.start + clip.intro.duration + 0.01;
    stage.draw(scene.evaluate(t), scene.frame);
    const first = paths(stage);
    const writes: string[] = [];
    for (const path of first) {
      const setAttribute = path.setAttribute.bind(path);
      path.setAttribute = (name: string, value: string) => {
        writes.push(name);
        setAttribute(name, value);
      };
    }
    stage.draw(scene.evaluate(t + 0.005), scene.frame);
    expect(paths(stage)).toEqual(first);
    expect(writes).toEqual([]);
    stage.draw([], scene.frame);
    expect(paths(stage)).toHaveLength(0);
  });

  it('has a free layer under the scene and one over it', () => {
    const { stage } = staged('hello.mfe.json');
    expect([...stage.element.children].map((child) => child.getAttribute('class'))).toEqual([
      'mfe-below',
      'mfe-scene',
      'mfe-above',
    ]);
    expect(stage.layer('below')).toBe(stage.element.firstElementChild);
    expect(stage.layer('above')).toBe(stage.element.lastElementChild);
  });
});
