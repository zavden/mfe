/* The licence Manim Formula Editor itself is distributed under, said once.
 *
 * Its text is the file `LICENSE` at the root of the repository, which the build copies to
 * `licenses/LICENSE.txt`. Here are the words that name it: the build writes them at the head of
 * the notices (`thirdParty.ts`) and gives them to the app with the list of components
 * (`virtual:third-party`), for Help ▸ About and Help ▸ Third-party licenses. Neither the dialogs
 * nor the notices write the licence's name themselves: an edition under other terms changes this
 * module and `LICENSE`, and the files that read them stay the same. (The engine of an exported
 * page says its own licence, in the text that travels with every page: `deckRuntime.ts`.) */

/** The licence as a sentence names it; the words of a link to its text. */
const TITLE = 'MIT License';

export interface ProjectLicense {
  /** Its short name — an SPDX identifier where it has one —: what Help ▸ About shows. */
  name: string;
  title: string;
  /** The first paragraph of Help ▸ Third-party licenses: what is under the licence, before the
   * link to its text (whose words are `title`), and how the paragraph goes on after it. */
  dialog: { before: string; after: string };
  /** The first paragraphs of `licenses/THIRD-PARTY-NOTICES.txt`: what the project's own work is
   * under, and where its text is. */
  notices: readonly string[];
}

export const PROJECT_LICENSE: ProjectLicense = {
  name: 'MIT',
  title: TITLE,
  dialog: {
    before: 'Manim Formula Editor and Chroma Lab, its color studio, are distributed under the',
    after: '. They contain the open-source components below, each under its own license.',
  },
  notices: [
    `Manim Formula Editor is distributed under the ${TITLE}: see LICENSE.txt, next to ` +
      'this file. This build also contains the components listed below. Each of them is ' +
      'distributed under its own license, reproduced in full further down.',
    'Chroma Lab, the color studio under Preferences, is by the author of Manim Formula ' +
      `Editor and is distributed with it under the same ${TITLE}. Its files are in ` +
      'chroma-lab/, and what it contains from others is listed here and in ' +
      'chroma-lab/vendor/README.md.',
  ],
};
