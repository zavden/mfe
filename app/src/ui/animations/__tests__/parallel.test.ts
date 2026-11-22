// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createDisappear,
  createLineFormula,
  createPartTransform,
  createRelation,
} from '../../../model';
import { complementGlyphs, parallelComplement, parallelWith } from '../parallel';
import { oneClipScene } from './fixtures';

describe('parallelWith', () => {
  it('lists the blocks of the clip that overlap in time, not those that only touch', () => {
    const a = createAppear(1, 'write', [0], { duration: 2 }); // [1, 3)
    const b = createDisappear(2, 'fade_out', [1], { duration: 2 }); // [2, 4)
    const c = createAppear(3, 'create', [2], { duration: 1 }); // [3, 4): touches a
    const { clip } = oneClipScene({ glyphs: 3, start: 0, end: 10, actions: [a, b, c] });
    expect(parallelWith(clip, a).map((x) => x.id)).toEqual([b.id]);
    expect(parallelWith(clip, b).map((x) => x.id)).toEqual([a.id, c.id]);
    expect(parallelWith(clip, c).map((x) => x.id)).toEqual([b.id]);
  });
});

describe('complementGlyphs', () => {
  /* Five glyphs; 3 and 4 hidden at the start, so 0–2 are on screen from the clip start. */
  const scene = (action: Parameters<typeof complementGlyphs>[2]) =>
    oneClipScene({ glyphs: 5, start: 0, end: 10, hiddenGlyphs: [3, 4], actions: [action] });

  it('for an Appear, the other glyphs that are off screen when it starts', () => {
    const write = createAppear(2, 'write', [3]);
    const { project, clip } = scene(write);
    expect(complementGlyphs(project, clip, write)).toEqual([4]);
  });

  it('for a Disappear, the other glyphs that are on screen when it starts', () => {
    const fade = createDisappear(2, 'fade_out', [0]);
    const { project, clip } = scene(fade);
    expect(complementGlyphs(project, clip, fade)).toEqual([1, 2]);
  });

  it('for a part Transform, every other glyph', () => {
    const part = createPartTransform(2, [1]);
    const { project, clip } = scene(part);
    expect(complementGlyphs(project, clip, part)).toEqual([0, 2, 3, 4]);
  });

  it('for a new block alongside others, leaves out what they animate and what its kind names', () => {
    // 3 and 4 hidden; a Write brings 3 over [2, 4). A Create of every glyph at 3 runs with it.
    const write = createAppear(2, 'write', [3], { duration: 2 });
    const { project, clip } = scene(write);
    const create = createAppear(3, 'create', 'all');
    expect(parallelComplement(project, clip, create, [write])).toEqual([4]);
    // A later Write names 4 already: nothing is left for the new block.
    const later = createAppear(6, 'write', [4]);
    const two = oneClipScene({
      glyphs: 5,
      start: 0,
      end: 10,
      hiddenGlyphs: [3, 4],
      actions: [write, later],
    });
    expect(parallelComplement(two.project, two.clip, create, [write])).toEqual([]);
  });

  it('is empty for a block of every glyph, and when nothing is left', () => {
    const all = createAppear(2, 'write', 'all');
    const { project, clip } = scene(all);
    expect(complementGlyphs(project, clip, all)).toEqual([]);
    const both = createAppear(2, 'write', [3, 4]);
    const other = scene(both);
    expect(complementGlyphs(other.project, other.clip, both)).toEqual([]);
  });

  it('for an Appear, leaves out a glyph a relation consumed or brings later (audit A8-02)', () => {
    // Glyph 1 goes to the other clip over [2, 3); glyph 3 comes from it over [5, 6), hidden till
    // then. A Write of glyph 4 at 7 s: the copy for the others would bring nothing.
    const write = createAppear(7, 'write', [4]);
    const { project, clip, formula } = scene(write);
    const other = createClip(formula.id, project.tracks[1]!.id, 0, 10);
    project.clips.push(other);
    project.relations.push(
      createRelation(clip.id, other.id, {
        offset: 2,
        pairs: [{ from: [1], to: [1], style: null }],
      }),
      createRelation(other.id, clip.id, {
        offset: 5,
        pairs: [{ from: [3], to: [3], style: null }],
      }),
    );
    expect(complementGlyphs(project, clip, write)).toEqual([]);
    // At 4 s, glyph 3 is still to come: it is left out too.
    write.start = 4;
    expect(complementGlyphs(project, clip, write)).toEqual([]);
    // Without the relations, glyph 3 would be brought (1 is on screen).
    project.relations = [];
    expect(complementGlyphs(project, clip, write)).toEqual([3]);
  });

  it('is empty for a block of an arrow, which takes all of it (audit A5-07)', () => {
    // A FadeOut of the tip alone, as a file may have it: a formula of two glyphs would leave the
    // first for a copy; the shaft of an arrow is no glyph a block takes alone.
    const fade = createDisappear(2, 'fade_out', [1]);
    const { project, clip, formula } = oneClipScene({
      glyphs: 2,
      start: 0,
      end: 10,
      actions: [fade],
    });
    expect(complementGlyphs(project, clip, fade)).toEqual([0]);
    project.formulas[0] = {
      ...createLineFormula({ line: 'arrow', snapshot: formula.snapshot }),
      id: formula.id,
    };
    expect(complementGlyphs(project, clip, fade)).toEqual([]);
  });
});
