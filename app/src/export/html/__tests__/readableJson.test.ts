// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readExample } from '../../../test/examples';
import { compactJson, readableJson } from '../readableJson';

describe('readableJson', () => {
  it('keeps on one line what fits, and opens what does not, one member per line', () => {
    expect(readableJson({ position: [0, 1.5], scale: 1 })).toBe(
      '{ "position": [0, 1.5], "scale": 1 }',
    );
    expect(readableJson({ a: [1, 2, 3], b: { c: 'x' } }, 20)).toBe(
      '{\n  "a": [1, 2, 3],\n  "b": { "c": "x" }\n}',
    );
    expect(
      readableJson(
        [
          [1, 2],
          [3, 4],
        ],
        10,
      ),
    ).toBe('[\n  [1, 2],\n  [3, 4]\n]');
    expect(readableJson({ long: [111111, 222222, 333333] }, 16)).toBe(
      '{\n  "long": [\n    111111,\n    222222,\n    333333\n  ]\n}',
    );
  });

  it('counts the key and the indent in the width of a line', () => {
    const text = readableJson({ someLongKeyName: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, 40);
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(40);
  });

  it('writes the empty ones, the primitives and null as JSON does', () => {
    expect(readableJson([])).toBe('[]');
    expect(readableJson({})).toBe('{}');
    expect(readableJson(null)).toBe('null');
    expect(readableJson('a "b"\n')).toBe('"a \\"b\\"\\n"');
    expect(readableJson({ a: undefined, b: [undefined] })).toBe('{ "b": [null] }');
    expect(compactJson({ a: [], b: {} })).toBe('{ "a": [], "b": {} }');
  });

  it('is read back by JSON.parse as what it was, with lines of a hundred columns at most', () => {
    const project = JSON.parse(readExample('completing-the-square.mfe.json')) as unknown;
    const text = readableJson(project);
    expect(JSON.parse(text)).toEqual(project);
    const lines = text.split('\n');
    // A line is longer only when one string or one key with its string is.
    const long = lines.filter((line) => line.length > 100);
    for (const line of long) expect(line.trim()).toMatch(/^("[^"]*": )?"/);
    expect(lines.length).toBeLessThan(JSON.stringify(project, null, 2).split('\n').length / 2);
  });
});
