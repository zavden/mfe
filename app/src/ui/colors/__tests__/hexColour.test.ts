// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseHexColour } from '../hexColour';

describe('parseHexColour', () => {
  it.each([
    ['#58C4DD', '#58C4DD'],
    ['58c4dd', '#58C4DD'],
    ['  #fc6255 ', '#FC6255'],
    ['#abc', '#AABBCC'],
    ['F0f', '#FF00FF'],
    ['000000', '#000000'],
  ])('reads %j as %s', (text, color) => {
    expect(parseHexColour(text)).toBe(color);
  });

  it.each(['', '#', '#12', '#1234', '#12345', '#1234567', '#GGGGGG', 'red', '# 58C4DD', '##fff'])(
    'refuses %j',
    (text) => {
      expect(parseHexColour(text)).toBeNull();
    },
  );
});
