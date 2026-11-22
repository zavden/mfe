// @vitest-environment node
/* The licence of the app itself is named in one module (`build/projectLicense.ts`), and its text is
 * the file `LICENSE`. This is where the words of today are pinned: an edition under other terms
 * changes that module, `LICENSE` and this file — and none of the files that read them. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROJECT_LICENSE } from '../projectLicense';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('the licence of the app itself', () => {
  it('is the one of the file LICENSE', () => {
    expect(PROJECT_LICENSE.name).toBe('MIT');
    expect(PROJECT_LICENSE.title).toBe('MIT License');
    expect(read('../LICENSE')).toMatch(/^MIT License\n\nCopyright \(c\) \d{4} /);
  });

  it('says what is under it, in the dialog of the components and at the head of the notices', () => {
    const { title, dialog, notices } = PROJECT_LICENSE;
    expect(`${dialog.before} ${title}${dialog.after}`).toBe(
      'Manim Formula Editor and Chroma Lab, its color studio, are distributed under the MIT ' +
        'License. They contain the open-source components below, each under its own license.',
    );
    expect(notices).toEqual([
      'Manim Formula Editor is distributed under the MIT License: see LICENSE.txt, next to this ' +
        'file. This build also contains the components listed below. Each of them is distributed ' +
        'under its own license, reproduced in full further down.',
      // Chroma Lab has no licence file of its own: its author distributes it with the app.
      'Chroma Lab, the color studio under Preferences, is by the author of Manim Formula Editor ' +
        'and is distributed with it under the same MIT License. Its files are in chroma-lab/, and ' +
        'what it contains from others is listed here and in chroma-lab/vendor/README.md.',
    ]);
  });

  it('is named by nothing else: the dialogs and the notices take its words from the module', () => {
    const name = new RegExp(`\\b${PROJECT_LICENSE.name}\\b`);
    for (const file of ['src/ui/help/AboutDialog.tsx', 'src/ui/help/ThirdPartyDialog.tsx']) {
      const source = read(file);
      expect(source, file).toContain("from 'virtual:third-party'");
      expect(source, file).toContain('projectLicense.');
      expect(source, file).not.toMatch(name);
    }
    // The notices name many licences, the components' own: not this one in a sentence.
    const notices = read('build/thirdParty.ts');
    expect(notices).toContain('PROJECT_LICENSE.notices');
    expect(notices).not.toContain(PROJECT_LICENSE.title);
  });
});
