// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createFormula,
  createTexFormula,
  createTextFormula,
  defaultClipState,
  FORMAT_VERSION,
  newClipState,
  parseProject,
  serializeProject,
  setStartPosition,
  startPositionOf,
  type Project,
} from '../index';
import { smallProject } from './fixtures';

/* Where the new clips of a library object start (`startPosition`, format 24, D124): the pure
 * functions that read and write it, and the field in the file. */

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};

/** The small project with a LaTeX text and a font text that keep a start position. */
function placed(): Project {
  const project = smallProject();
  project.formulas.push(
    createTexFormula({ name: 't1', source: 'Title', startPosition: [-5, 3] }),
    createTextFormula({ name: 'p1', source: 'Words', startPosition: [2.5, -1.25] }),
  );
  return project;
}

describe('startPositionOf', () => {
  it('is the centre of the frame for an object that keeps no position', () => {
    expect(startPositionOf(createTexFormula())).toEqual([0, 0]);
    expect('startPosition' in createTexFormula()).toBe(false);
  });

  it('is the position the object keeps, as a fresh array', () => {
    const text = createTexFormula({ startPosition: [-5, 3] });
    const at = startPositionOf(text);
    expect(at).toEqual([-5, 3]);
    expect(at).not.toBe(text.startPosition);
  });
});

describe('newClipState', () => {
  it('is Manim’s state for an object that keeps no position', () => {
    expect(newClipState(createFormula())).toEqual(defaultClipState());
  });

  it('is that state at the object’s position, sharing nothing with the object', () => {
    const text = createTextFormula({ startPosition: [2.5, -1.25] });
    const state = newClipState(text);
    expect(state).toEqual({ ...defaultClipState(), position: [2.5, -1.25] });
    state.position[0] = 9;
    expect(text.startPosition).toEqual([2.5, -1.25]);
  });
});

describe('setStartPosition', () => {
  it('keeps a copy of the position', () => {
    const text = createTexFormula();
    const at: [number, number] = [-5, 3];
    setStartPosition(text, at);
    expect(text.startPosition).toEqual([-5, 3]);
    expect(text.startPosition).not.toBe(at);
  });

  it('drops the field at the centre of the frame', () => {
    const text = createTexFormula({ startPosition: [-5, 3] });
    setStartPosition(text, [0, 0]);
    expect('startPosition' in text).toBe(false);
    // Minus zero is the centre too.
    setStartPosition(text, [1, 1]);
    setStartPosition(text, [-0, 0]);
    expect('startPosition' in text).toBe(false);
  });
});

describe('a start position in a project file', () => {
  it('goes to the file and back, on a LaTeX text and on a font text', () => {
    const text = serializeProject(opened(serializeProject(placed())));
    const again = opened(text);
    expect(again.formulas.at(-2)!.startPosition).toEqual([-5, 3]);
    expect(again.formulas.at(-1)!.startPosition).toEqual([2.5, -1.25]);
    expect(serializeProject(again)).toBe(text);
    // Read from the file, it sits after the intro and before the snapshot.
    const keys = Object.keys(again.formulas.at(-2)!);
    expect(keys.slice(keys.indexOf('intro'), keys.indexOf('intro') + 3)).toEqual([
      'intro',
      'startPosition',
      'snapshot',
    ]);
  });

  it('is absent from an object that keeps none', () => {
    const text = serializeProject(opened(serializeProject(smallProject())));
    expect(text).not.toContain('"startPosition"');
    expect(opened(text).formulas.every((f) => !('startPosition' in f))).toBe(true);
  });

  it('is not in a file of format 23, which opens as it is', () => {
    const text = serializeProject(opened(serializeProject(smallProject())));
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 23');
    expect(old).not.toBe(text);
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(23);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(serializeProject(result.project)).toBe(text);
  });

  it.each([
    ['a single number', '3'],
    ['one coordinate', '[3]'],
    ['three coordinates', '[1, 2, 3]'],
    ['a coordinate that is not a number', '[1, "2"]'],
    ['a coordinate beyond every number', '[1e999, 0]'],
    ['null', 'null'],
  ])('refuses %s as a start position', (_what, value) => {
    const text = serializeProject(placed());
    const broken = text.replace(/"startPosition": \[[^\]]*\]/, `"startPosition": ${value}`);
    expect(broken).not.toBe(text);
    expect(parseProject(broken).ok).toBe(false);
  });
});
