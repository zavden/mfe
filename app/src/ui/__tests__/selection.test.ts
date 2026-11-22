// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createTween, type Project } from '../../model';
import { smallProject } from '../../model/__tests__/fixtures';
import type { Selection } from '../../store';
import {
  formulaSelection,
  highlightedClipIds,
  isCameraSelection,
  pruneSelection,
  selectedBlock,
  selectedFormulaIds,
} from '../selection';

const order = ['a', 'b', 'c', 'd', 'e'];

/** The small project with a tween on its first clip, and that block selected. */
function projectWithBlock(): {
  project: Project;
  selection: Extract<Selection, { kind: 'action' }>;
} {
  const project = smallProject();
  const clip = project.clips[0]!;
  const tween = createTween(1, 1, {});
  clip.actions.push(tween);
  return { project, selection: { kind: 'action', clipId: clip.id, actionId: tween.id } };
}

describe('selection shapes', () => {
  it('normalises and reads formula selections', () => {
    expect(formulaSelection([], order)).toEqual({ kind: 'none' });
    expect(formulaSelection(['c'], order)).toEqual({ kind: 'formula', id: 'c' });
    expect(formulaSelection(['e', 'a'], order)).toEqual({ kind: 'formulas', ids: ['a', 'e'] });
    expect(selectedFormulaIds({ kind: 'formula', id: 'a' })).toEqual(['a']);
    expect(selectedFormulaIds({ kind: 'formulas', ids: ['a', 'e'] })).toEqual(['a', 'e']);
    expect(selectedFormulaIds({ kind: 'clips', ids: ['x'] })).toEqual([]);
  });

  it('highlights the selected clips, or the clip of the selected block', () => {
    expect(highlightedClipIds({ kind: 'clips', ids: ['x', 'y'] })).toEqual(['x', 'y']);
    expect(highlightedClipIds({ kind: 'action', clipId: 'x', actionId: 'a1' })).toEqual(['x']);
    expect(highlightedClipIds({ kind: 'formula', id: 'f' })).toEqual([]);
    expect(highlightedClipIds({ kind: 'none' })).toEqual([]);
  });

  it('finds the selected block while its clip and the block exist', () => {
    const { project, selection } = projectWithBlock();
    const clip = project.clips[0]!;
    expect(selectedBlock(selection, project.clips)).toEqual({ clip, action: clip.actions[0] });
    expect(selectedBlock({ kind: 'clips', ids: [clip.id] }, project.clips)).toBeNull();
    expect(
      selectedBlock({ kind: 'action', clipId: clip.id, actionId: 'gone' }, project.clips),
    ).toBeNull();
    expect(selectedBlock(selection, [])).toBeNull();
  });
});

describe('pruneSelection', () => {
  it('returns the very same selection while everything in it exists', () => {
    const { project, selection } = projectWithBlock();
    const [a, b] = project.formulas;
    const [ca, cb] = project.clips;
    const cases: Selection[] = [
      { kind: 'none' },
      { kind: 'formula', id: a!.id },
      { kind: 'formulas', ids: [a!.id, b!.id] },
      { kind: 'clips', ids: [ca!.id, cb!.id] },
      { kind: 'relation', id: project.relations[0]!.id },
      selection,
    ];
    for (const current of cases) expect(pruneSelection(current, project)).toBe(current);
  });

  it('drops the clips, relation or block that are gone', () => {
    const { project, selection } = projectWithBlock();
    const [ca, cb] = project.clips;
    expect(pruneSelection({ kind: 'clips', ids: [ca!.id, 'gone'] }, project)).toEqual({
      kind: 'clips',
      ids: [ca!.id],
    });
    expect(pruneSelection({ kind: 'clips', ids: ['gone'] }, project)).toEqual({ kind: 'none' });
    expect(pruneSelection({ kind: 'relation', id: 'gone' }, project)).toEqual({ kind: 'none' });
    // The block's clip is gone, or just the block.
    const without = { ...project, clips: [cb!] };
    expect(pruneSelection(selection, without)).toEqual({ kind: 'none' });
    expect(pruneSelection({ ...selection, actionId: 'gone' }, project)).toEqual({ kind: 'none' });
  });

  it('knows a selection of the camera', () => {
    expect(isCameraSelection({ kind: 'camera' })).toBe(true);
    expect(isCameraSelection({ kind: 'cameraMove', id: 'n1' })).toBe(true);
    expect(isCameraSelection({ kind: 'targetCamera', id: 'k1' })).toBe(true);
    expect(isCameraSelection({ kind: 'none' })).toBe(false);
    expect(isCameraSelection({ kind: 'clips', ids: ['a'] })).toBe(false);
  });

  it('keeps a move, a target camera or the camera while the scene has it', () => {
    const project = smallProject();
    const off: Selection[] = [
      { kind: 'cameraMove', id: 'n1' },
      { kind: 'targetCamera', id: 'k1' },
      { kind: 'camera' },
    ];
    // The multicamera off: none of them.
    for (const current of off) expect(pruneSelection(current, project)).toEqual({ kind: 'none' });
    project.camera = {
      initial: { center: [0, 0], height: 8 },
      targets: [{ id: 'k1', name: 'Camera 1', center: [1, 0], height: 4 }],
      moves: [{ id: 'n1', start: 1, duration: 1, easing: 'smooth', to: { kind: 'start' } }],
    };
    for (const current of off) expect(pruneSelection(current, project)).toBe(current);
    expect(pruneSelection({ kind: 'cameraMove', id: 'gone' }, project)).toEqual({ kind: 'none' });
    expect(pruneSelection({ kind: 'targetCamera', id: 'gone' }, project)).toEqual({ kind: 'none' });
  });

  it('drops the formulas that are gone, keeping list order and the single-formula shape', () => {
    const project = smallProject();
    const [a, b] = project.formulas;
    expect(pruneSelection({ kind: 'formula', id: 'gone' }, project)).toEqual({ kind: 'none' });
    expect(pruneSelection({ kind: 'formulas', ids: [b!.id, a!.id, 'gone'] }, project)).toEqual({
      kind: 'formulas',
      ids: [a!.id, b!.id],
    });
    expect(pruneSelection({ kind: 'formulas', ids: ['gone', b!.id] }, project)).toEqual({
      kind: 'formula',
      id: b!.id,
    });
    expect(pruneSelection({ kind: 'formulas', ids: ['gone', 'lost'] }, project)).toEqual({
      kind: 'none',
    });
  });
});
