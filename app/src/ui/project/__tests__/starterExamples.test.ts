// @vitest-environment node
/* The examples the app carries (`starterExamples.ts`): files of `examples/` as they are, which
 * open as a project of the current format with nothing to tell and nothing a build could lack. */
import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION, parseProject } from '../../../model';
import { EXAMPLES, readExample } from '../../../test/examples';
import { FIRST_EXAMPLE, STARTER_EXAMPLES } from '../starterExamples';

describe('the examples the app carries', () => {
  it('are these four, the whole derivation first', () => {
    expect(STARTER_EXAMPLES.map((example) => [example.id, example.name])).toEqual([
      ['completing-the-square', 'Completing the square'],
      ['hello', 'Hello: one-to-one'],
      ['camera', 'Camera'],
      ['braces', 'Braces'],
    ]);
    expect(FIRST_EXAMPLE.id).toBe('completing-the-square');
  });

  it.each(STARTER_EXAMPLES.map((example) => [example.id, example] as const))(
    '%s is its file of examples/, and opens with nothing to tell',
    (id, example) => {
      const file = `${id}.mfe.json` as (typeof EXAMPLES)[number];
      // A file the repo versions and checks as an example (`test/examples.ts`).
      expect(EXAMPLES).toContain(file);
      expect(JSON.parse(example.text())).toEqual(JSON.parse(readExample(file)));

      const parsed = parseProject(example.text());
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.issues).toEqual([]);
      // Of the current format: an example that had to be upgraded would say so each time it opens.
      expect(parsed.migratedFrom).toBeNull();
      expect(parsed.project.version).toBe(FORMAT_VERSION);
      expect(parsed.project.meta.name).toBe(example.name);
      // Nothing that needs the companion to be drawn, and nothing of the Slides mode (a build
      // without it would refuse the file).
      expect(parsed.textGeometry).toEqual({});
      expect(parsed.project.formulas.filter((formula) => formula.kind === 'text')).toEqual([]);
      expect(JSON.parse(example.text())).not.toHaveProperty('slides');
      expect(parsed.project.formulas.length).toBeGreaterThan(0);
      expect(parsed.project.clips.length).toBeGreaterThan(0);
    },
  );
});
