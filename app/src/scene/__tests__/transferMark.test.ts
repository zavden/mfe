// @vitest-environment node
/* A piece of a transfer in flight says which transfer it is of (`Drawable.transfer`): what a
 * drawing that keeps the scene's structure — the stage of the exported page — tells the glyphs on
 * their way from a clip's own. */
import { beforeAll, describe, expect, it } from 'vitest';
import { makeScene, type Scene } from '../../embed/engine';
import { renderedExample } from '../../embed/__tests__/fixtures';
import { EXAMPLES } from '../../test/examples';

const scenes = new Map<string, Scene>();
beforeAll(async () => {
  for (const name of EXAMPLES) {
    const { project, resolved } = await renderedExample(name);
    scenes.set(name, makeScene(project, resolved, { includeHidden: true }));
  }
}, 120_000);

describe('Drawable.transfer', () => {
  it('names the relation on its pieces while it runs, and is absent on everything else', () => {
    const scene = scenes.get('hello.mfe.json')!;
    const relation = scene.project.relations[0]!;
    const to = scene.project.clips.find((clip) => clip.id === relation.toClipId)!;
    const during = scene.evaluate(to.start + relation.offset + relation.duration / 2);
    const pieces = during.filter((drawable) => drawable.transfer !== undefined);
    expect(pieces.length).toBeGreaterThan(0);
    expect(new Set(pieces.map((piece) => piece.transfer))).toEqual(
      new Set([`relation:${relation.id}`]),
    );
    expect(pieces.every((piece) => piece.role === 'object')).toBe(true);
    const after = scene.evaluate(to.start + relation.offset + relation.duration + 0.01);
    expect(after.filter((drawable) => drawable.transfer !== undefined)).toEqual([]);
    expect(after.every((drawable) => !('transfer' in drawable))).toBe(true);
  });

  it('is the key of a transfer event of the scene, for every piece of every example', () => {
    let relations = 0;
    let morphs = 0;
    for (const scene of scenes.values()) {
      const keys = new Set(
        scene.evaluator.events.flatMap((event) => (event.kind === 'transfer' ? [event.key] : [])),
      );
      for (let k = 0; k <= scene.duration * 10; k++) {
        for (const drawable of scene.evaluate(k / 10)) {
          if (drawable.transfer === undefined) continue;
          expect(keys.has(drawable.transfer)).toBe(true);
          if (drawable.transfer.startsWith('morph:')) morphs++;
          else relations++;
        }
      }
    }
    // Both kinds of transfer are in the examples: relations and Morph blocks.
    expect(relations).toBeGreaterThan(0);
    expect(morphs).toBeGreaterThan(0);
  });
});
