import { describe, expect, it } from 'vitest';
import { KINDS } from '../../../model';
import { COMING_KINDS, DEFAULT_KIND, newObjectChoices } from '../newObject';

describe('the + New ▸ menu', () => {
  it('offers every listed kind, then the announced ones disabled', () => {
    expect(newObjectChoices()).toEqual([
      { id: 'math', label: 'Formula', kind: 'math' },
      { id: 'tex', label: 'Text (LaTeX)', kind: 'tex' },
      { id: 'text', label: 'Text (font)', kind: 'text' },
    ]);
    expect(DEFAULT_KIND).toBe('math');
    expect(KINDS[DEFAULT_KIND].listed).toBe(true);
  });

  it('drops an announced kind the day it has a row, and leaves out unlisted kinds', () => {
    const kinds = {
      math: KINDS.math,
      text: { ...KINDS.math, label: 'Text (font)', namePrefix: 'p' },
      brace: { ...KINDS.math, label: 'Brace', namePrefix: 'b', listed: false },
    };
    expect(
      newObjectChoices(kinds, [
        ...COMING_KINDS,
        { id: 'text', label: 'Text (font)' },
        { id: 'shape', label: 'Shape' },
      ]),
    ).toEqual([
      { id: 'math', label: 'Formula', kind: 'math' },
      { id: 'text', label: 'Text (font)', kind: 'text' },
      { id: 'shape', label: 'Shape', kind: null },
    ]);
  });
});
