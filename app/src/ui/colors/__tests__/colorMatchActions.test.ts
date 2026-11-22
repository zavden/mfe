// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createClip, createColorMatch, createEmptyProject, createFormula } from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import {
  addColorMatchEntry,
  createColorMatchList,
  deleteColorMatchList,
  duplicateColorMatchList,
  entryIssues,
  formulasOfSelection,
  freeName,
  moveColorMatchEntry,
  nextEntryColor,
  nextMatchName,
  removeColorMatchEntry,
  renameColorMatchList,
  updateColorMatchEntry,
} from '../colorMatchActions';

const lists = () => useProjectStore.getState().project.colorMatches;
const undoSteps = () => {
  let n = 0;
  while (history.canUndo()) {
    history.undo();
    n++;
  }
  return n;
};

afterEach(() => {
  loadProject(createEmptyProject());
});

describe('names and colours', () => {
  it('finds the next free list name and a free copy name', () => {
    expect(nextMatchName([])).toBe('Match colors 1');
    expect(nextMatchName([{ name: 'Match colors 1' }, { name: 'Match colors 3' }])).toBe(
      'Match colors 2',
    );
    expect(freeName('Course', [])).toBe('Course');
    expect(freeName('Course', [{ name: 'Course' }])).toBe('Course copy');
    expect(freeName('Course', [{ name: 'Course' }, { name: 'Course copy' }])).toBe('Course copy 2');
  });

  it('starts new entries on the vivid Manim colours, in turn', () => {
    expect(nextEntryColor(0)).toBe('#58C4DD'); // BLUE
    expect(nextEntryColor(1)).toBe('#5CD0B3'); // TEAL
    expect(nextEntryColor(10)).toBe('#58C4DD');
  });

  it('says what each entry lacks', () => {
    const match = createColorMatch('m', [
      { pattern: '$x$', color: '#FFFFFF' },
      { pattern: '', color: '#FFFFFF' },
      { pattern: '\\frac{a', color: '#FFFFFF' },
    ]);
    expect(entryIssues(match)).toEqual([null, 'Type some LaTeX.', 'The braces are not balanced.']);
  });
});

describe('formulasOfSelection', () => {
  it('takes the selected formulas, or the formulas of the selected clips, each once', () => {
    const project = createEmptyProject();
    const f = createFormula({ name: 'f' });
    const g = createFormula({ name: 'g' });
    project.formulas.push(f, g);
    const track = project.tracks[0]!.id;
    project.clips.push(createClip(f.id, track, 0, 2), createClip(f.id, track, 3, 5));
    project.clips.push(createClip(g.id, track, 6, 8));
    const [c1, c2, c3] = project.clips.map((c) => c.id);
    expect(formulasOfSelection(project, { kind: 'none' })).toEqual([]);
    expect(formulasOfSelection(project, { kind: 'formula', id: g.id })).toEqual([g.id]);
    expect(formulasOfSelection(project, { kind: 'formulas', ids: [f.id, g.id] })).toEqual([
      f.id,
      g.id,
    ]);
    expect(formulasOfSelection(project, { kind: 'clips', ids: [c1!, c2!, c3!] })).toEqual([
      f.id,
      g.id,
    ]);
    expect(formulasOfSelection(project, { kind: 'action', clipId: c3!, actionId: 'a' })).toEqual([
      g.id,
    ]);
  });
});

describe('list edits', () => {
  it('creates, duplicates, renames and deletes lists, one undo step each', () => {
    const id = createColorMatchList();
    expect(lists().map((l) => l.name)).toEqual(['Match colors 1']);
    addColorMatchEntry(id, { pattern: 'x' });
    renameColorMatchList(id, '  Course  ');
    renameColorMatchList(id, '   '); // ignored
    expect(lists()[0]!.name).toBe('Course');
    const copy = duplicateColorMatchList(id)!;
    expect(lists().map((l) => l.name)).toEqual(['Course', 'Course copy']);
    expect(lists()[1]!.entries).toEqual([{ pattern: 'x', color: '#58C4DD' }]);
    expect(lists()[1]!.id).toBe(copy);
    deleteColorMatchList(id);
    expect(lists().map((l) => l.name)).toEqual(['Course copy']);
    expect(duplicateColorMatchList('gone')).toBeNull();
    expect(undoSteps()).toBe(5);
    expect(lists()).toEqual([]);
  });

  it('adds, changes, moves and removes entries, one undo step each, and ignores no-ops', () => {
    const id = createColorMatchList();
    expect(addColorMatchEntry(id)).toBe(0);
    expect(addColorMatchEntry(id, { pattern: 'y', color: '#000000' })).toBe(1);
    expect(addColorMatchEntry('gone')).toBe(-1);
    updateColorMatchEntry(id, 0, { pattern: 'x' });
    updateColorMatchEntry(id, 0, { pattern: 'x' }); // no change: no step
    updateColorMatchEntry(id, 5, { pattern: 'z' }); // no such entry
    expect(lists()[0]!.entries).toEqual([
      { pattern: 'x', color: '#58C4DD' },
      { pattern: 'y', color: '#000000' },
    ]);
    moveColorMatchEntry(id, 1, -1);
    moveColorMatchEntry(id, 0, -1); // past the start: nothing
    expect(lists()[0]!.entries.map((e) => e.pattern)).toEqual(['y', 'x']);
    removeColorMatchEntry(id, 0);
    expect(lists()[0]!.entries.map((e) => e.pattern)).toEqual(['x']);
    expect(undoSteps()).toBe(6);
  });
});
