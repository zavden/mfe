// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parsePathData, pathData, written } from '../pathData';

/** A closed square of side 1 at the origin's upper right, and an open stroke. */
const square = [
  0, 0, 0.5, 0, 1, 0, 1, 0, 1, 0.5, 1, 1, 1, 1, 0.5, 1, 0, 1, 0, 1, 0, 0.5, 0, 0, 0, 0,
];
const open = [-1, -1, -0.5, -1.25, 0.5, -0.75, 1, -1];

describe('pathData', () => {
  it('writes contours as M, C and Z with y down', () => {
    expect(pathData([open])).toBe('M-1 1C-0.5 1.25 0.5 0.75 1 1');
    expect(pathData([square])).toBe(
      'M0 0C0.5 0 1 0 1 0C1 -0.5 1 -1 1 -1C0.5 -1 0 -1 0 -1C0 -0.5 0 0 0 0Z',
    );
    expect(pathData([open, square])).toBe(pathData([open]) + pathData([square]));
  });

  it('rounds each number to a ten-thousandth, and writes no negative zero', () => {
    expect(written(0.123449)).toBe(0.1234);
    expect(written(0.12345001)).toBe(0.1235);
    expect(written(-0.00001)).toBe(0);
    expect(Object.is(written(-0.00001), 0)).toBe(true);
    expect(pathData([[0.00004, -0.00004, 1 / 3, 2 / 3, 1, 1, 2, 2]])).toBe(
      'M0 0C0.3333 -0.6667 1 -1 2 -2',
    );
  });

  it('leaves out a contour of less than one curve', () => {
    expect(pathData([[1, 2]])).toBe('');
    expect(pathData([[1, 2, 3, 4, 5, 6]])).toBe('');
    expect(pathData([])).toBe('');
  });

  it('closes a contour whose last point is its first, and only that one', () => {
    expect(pathData([square]).endsWith('Z')).toBe(true);
    expect(pathData([open]).endsWith('Z')).toBe(false);
  });
});

describe('parsePathData', () => {
  it('gives back what pathData wrote, y up again', () => {
    expect(parsePathData(pathData([open, square]))).toEqual([open, square]);
    expect(parsePathData('')).toEqual([]);
  });

  it('keeps a closed contour closed after the rounding: equal points stay equal', () => {
    const wobbly = square.map((value, index) => value + (index % 2 ? 1 : -1) * 0.123456789);
    const [back] = parsePathData(pathData([wobbly]));
    expect(back!.at(-2)).toBe(back![0]);
    expect(back!.at(-1)).toBe(back![1]);
    expect(pathData([back!])).toBe(pathData([wobbly]));
  });

  it('reads commas, several curves after one C, and no negative zero', () => {
    const [contour] = parsePathData('M 0,0 C 1,0 1,0 1,-1 2,-1 2,-1 2,0 Z');
    expect(contour).toEqual([0, 0, 1, 0, 1, 0, 1, 1, 2, 1, 2, 1, 2, 0]);
    expect(contour!.every((value) => !Object.is(value, -0))).toBe(true);
  });

  it('refuses what pathData does not write, saying what', () => {
    expect(() => parsePathData('M0 0L1 1')).toThrow('the command "L" is not one of M, C, Z');
    expect(() => parsePathData('M0 0c1 1 1 1 1 1')).toThrow('"c" is not one of');
    expect(() => parsePathData('C0 0 1 1 2 2')).toThrow('a "C" before any "M"');
    expect(() => parsePathData('M0 0C1 1 2')).toThrow('"C" wants 6 numbers, got "the end"');
    expect(() => parsePathData('M0')).toThrow('"M" wants 2 numbers');
  });
});
