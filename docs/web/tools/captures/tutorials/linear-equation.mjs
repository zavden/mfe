/* Captures of tutorials/linear-equation: the steps of the tutorial, performed in the real app —
 * five formulas, one glyph coloured, five clips on two tracks, four relations, the Python.
 *
 * `buildLinearEquation` performs the whole tutorial through the interface; a script that runs it on
 * the app's empty project (through `withChrome` and `Kit`) and writes what `after` is given makes the
 * examples (`linear-equation-clips`, `linear-equation`), so that the downloads are exactly what the
 * steps leave behind. The items start from those examples, so that each shows one step without
 * redoing the ones before it. */
import {
  applyFormula,
  closeEditor,
  currentProject,
  dropFormula,
  openNewFormula,
  relateClips,
  saveRelation,
  setScale,
  suggestLinks,
} from '../_shared/formula-steps.mjs';

export const EXAMPLES = {
  clips: 'docs/web/examples/linear-equation-clips.mfe.json',
  done: 'docs/web/examples/linear-equation.mfe.json',
};

/** The five formulas, in order: what is typed into the Raw LaTeX field, and the name each gets. */
export const EQUATION = [
  { name: 'equation', latex: '2x + 3 = 11' },
  { name: 'subtract', latex: '2x = 11 - 3' },
  { name: 'simplify', latex: '2x = 8' },
  { name: 'divide', latex: 'x = \\frac{8}{2}' },
  { name: 'answer', latex: 'x = 4' },
];

/** The track of each clip and when it starts: every clip a little before the last one ends. */
const TRACKS = ['Track 2', 'Track 1', 'Track 2', 'Track 1', 'Track 2'];
const START = (i) => 3 * i;
/** Every clip lasts four seconds, so that each formula stays on screen for two. */
const END = (i) => 3 * i + 4;

/** The glyph indices (canonical order of MathJax) that travel, and their colours. */
const COLOURS = [
  { name: 'equation', glyph: 3, swatch: 'GOLD' },
  { name: 'subtract', glyph: 6, swatch: 'GOLD' },
  { name: 'simplify', glyph: 0, swatch: 'BLUE' },
  { name: 'divide', glyph: 3, swatch: 'BLUE' },
];

// ---- the steps -----------------------------------------------------------------------------

/** The two Edit-menu preferences that give every new clip its intro and its outro. */
export async function addIntroAndOutro(kit) {
  await kit.choose('Edit ▸ Always add intro (Write)');
  await kit.choose('Edit ▸ Always add outro (FadeOut)');
}

/** + New, the LaTeX typed into the Raw LaTeX field, the name, a size, Apply, Close. */
export async function writeNamedFormula(page, kit, { name, latex }) {
  await openNewFormula(page, kit);
  await kit.click('raw-latex');
  await kit.type(latex);
  await kit.click('editor-name');
  await page.keyboard.press('ControlOrMeta+a');
  await kit.type(name);
  await page.keyboard.press('Enter');
  await setScale(page, kit, 2);
  await applyFormula(page, kit);
  await closeEditor(page, kit);
}

/** Opens the formula editor of `name` from the pencil on its card. */
export async function editFormula(page, kit, name) {
  const card = page.locator(`[data-testid="formula-item"][data-name="${name}"]`);
  await card.scrollIntoViewIfNeeded();
  await kit.hover(card);
  await kit.click(card.getByTestId('formula-edit'));
  await page.getByTestId('formula-editor').waitFor();
  await page.getByTestId('glyph-view').waitFor();
}

/** Colours one glyph in the glyph view of the formula editor. */
export async function colourGlyph(page, kit, name, glyph, swatch) {
  await editFormula(page, kit, name);
  await kit.click(`glyph-${glyph}`);
  await kit.click(`palette-${swatch}`);
  await kit.pause(kit.recording ? 700 : 0);
  await closeEditor(page, kit);
}

/** The End of the clip of formula `name`, typed in the Timing tab of the Animations panel. */
export async function setClipEnd(page, kit, name, end) {
  await kit.click({ clip: name });
  await kit.click('animations-tab-timing');
  await kit.click('clip-end');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(String(end));
  await page.keyboard.press('Enter');
  await kit.pause(kit.recording ? 300 : 0);
}

/** The outro of the clip of formula `name`, chosen in the Timing tab of the Animations panel. */
export async function setOutro(page, kit, name, kind) {
  await kit.click({ clip: name });
  await kit.click('animations-tab-timing');
  await kit.hover('outro-kind');
  await page.getByTestId('outro-kind').selectOption(kind);
  await kit.pause(kit.recording ? 300 : 0);
}

/** Names the project (the scene and its file take the name). */
export async function renameProject(page, kit, name) {
  await kit.click('project-rename');
  await page.keyboard.press('ControlOrMeta+a');
  await kit.type(name);
  await page.keyboard.press('Enter');
}

/** The glyph of the relation editor's `side` with this canonical index. */
const glyph = (page, side, index) => page.getByTestId(`rel-${side}-glyph-${index}`);

/** Links `sources` (indices of the source formula) onto one target glyph: the first with a click,
 * the others with Shift, then a click on the target; the pair then fades the sources into it. */
export async function linkManyToOne(page, kit, sources, target) {
  await kit.click(glyph(page, 'from', sources[0]));
  for (const index of sources.slice(1)) {
    await kit.click(glyph(page, 'from', index), { hold: ['Shift'] });
  }
  await kit.pause(kit.recording ? 600 : 0);
  await kit.click(glyph(page, 'to', target));
  await kit.pause(kit.recording ? 600 : 0);
}

/** The style of the pair number `pair` of the relation editor, from its list. */
export async function setPairStyle(page, kit, pair, style) {
  await kit.hover(`rel-pair-${pair}-style`);
  await page.getByTestId(`rel-pair-${pair}-style`).selectOption(style);
  await kit.pause(kit.recording ? 400 : 0);
}

/** The whole tutorial, from the empty app; `after(stage, project)` is called when the clips are
 * placed (stage 'clips') and when the four relations are saved (stage 'done'). */
export async function buildLinearEquation(page, kit, after = async () => {}) {
  await addIntroAndOutro(kit);
  for (const formula of EQUATION) await writeNamedFormula(page, kit, formula);
  for (const { name, glyph: index, swatch } of COLOURS) {
    await colourGlyph(page, kit, name, index, swatch);
  }
  for (const [i, { name }] of EQUATION.entries()) {
    await dropFormula(kit, name, TRACKS[i], START(i) + 0.05);
  }
  for (const [i, { name }] of EQUATION.entries()) await setClipEnd(page, kit, name, END(i));
  // Nothing follows the answer: it stays on screen to the end.
  await setOutro(page, kit, 'answer', 'none');
  await renameProject(page, kit, 'Solving a linear equation');
  await after('clips', await currentProject(kit));

  // 2x + 3 = 11 → 2x = 11 − 3: every glyph with a partner by its label.
  await relateClips(page, kit, 'equation', 'subtract');
  await suggestLinks(page, kit);
  await saveRelation(page, kit);
  // → 2x = 8: 2, x and = by label; 1 1 − 3 onto the 8 by hand.
  await relateClips(page, kit, 'subtract', 'simplify');
  await suggestLinks(page, kit);
  await linkManyToOne(page, kit, [3, 4, 5, 6], 3);
  await setPairStyle(page, kit, 3, 'fade');
  await saveRelation(page, kit);
  // → x = 8/2: the 2 goes under the 8.
  await relateClips(page, kit, 'simplify', 'divide');
  await suggestLinks(page, kit);
  await saveRelation(page, kit);
  // → x = 4: the 8, the 2 and the bar onto the 4.
  await relateClips(page, kit, 'divide', 'answer');
  await suggestLinks(page, kit);
  await linkManyToOne(page, kit, [2, 3, 4], 2);
  await setPairStyle(page, kit, 2, 'fade');
  await saveRelation(page, kit);
  await after('done', await currentProject(kit));
}

// ---- the items ------------------------------------------------------------------------------

/** The whole timeline: every track and every second of it. */
const TIMELINE_ALL = { x: 8, y: 643, width: 1424, height: 245 };

/** The Edit menu and the bar over it. */
const menuAndBar = async (page, kit) => {
  const menu = await kit.box('.menu-popup');
  return { x: menu.x - 16, y: 0, width: menu.width + 32, height: menu.y + menu.height + 12 };
};

/** Selects the clip of formula `name` and opens the Timing tab of the Animations panel. */
async function openTimingOf(page, kit, name) {
  await kit.selectClip(name);
  await kit.click('animations-tab-timing');
  await page.getByTestId('timing-section').waitFor();
}

export default {
  page: 'tutorials/linear-equation',
  items: [
    {
      // The two Edit-menu preferences, ticked: every new clip gets an intro and an outro.
      kind: 'shot',
      name: 'edit-menu',
      setup: async (page, kit) => {
        await addIntroAndOutro(kit);
        await kit.openMenu('Edit');
      },
      target: menuAndBar,
      highlight: [
        { target: 'menu-item-edit-auto-intro', label: 1, markerAt: 'right', pad: { left: 0, right: 0, top: -2, bottom: -2 } },
        { target: 'menu-item-edit-auto-outro', label: 2, markerAt: 'right', pad: { left: 0, right: 0, top: -2, bottom: -2 } },
      ],
    },
    {
      // The five formulas in the Creator: a taller window, so that all five cards are in view, and
      // the bar between the Creator and the Preview dragged to the right, so that the names fit.
      kind: 'shot',
      name: 'formulas',
      project: EXAMPLES.clips,
      viewport: { width: 1440, height: 1240 },
      setup: async (page, kit) => {
        await kit.clearSelection();
        const bar = await kit.point({ css: '.separator-vertical' });
        await kit.drag(bar, { x: bar.x + 130, y: bar.y });
        await kit.settle({ renders: false });
      },
      target: 'panel-creator',
    },
    {
      // The glyph view of the formula editor: the 3 picked, the gold swatch chosen.
      kind: 'shot',
      name: 'colour',
      project: EXAMPLES.clips,
      setup: async (page, kit) => {
        // The project as it is when the tutorial gets here: nothing coloured yet.
        await kit.mfe((mfe) =>
          mfe.useProjectStore.getState().update((draft) => {
            for (const formula of draft.formulas) formula.glyphColors = {};
          }),
        );
        await editFormula(page, kit, 'equation');
        await kit.click('glyph-3');
        await kit.click('palette-GOLD');
      },
      target: 'formula-editor',
      padding: 6,
      highlight: [
        { target: 'glyph-3', label: 1, markerAt: 'top-right', pad: 4 },
        { target: 'palette-GOLD', label: 2, markerAt: 'top' },
      ],
    },
    {
      // The five clips on the two tracks, the whole timeline in view.
      kind: 'shot',
      name: 'clips',
      project: EXAMPLES.clips,
      setup: async (page, kit) => {
        await kit.clearSelection();
        await kit.click('timeline-fit');
      },
      target: TIMELINE_ALL,
    },
    {
      // The Timing tab: the End of a clip, typed.
      kind: 'shot',
      name: 'end-field',
      project: EXAMPLES.clips,
      setup: async (page, kit) => {
        await openTimingOf(page, kit, 'subtract');
      },
      target: 'panel-animations',
      highlight: [
        { target: { union: ['clip-start', 'clip-end'] }, label: 1, markerAt: 'top-right' },
        { target: 'intro-kind', label: 2, markerAt: 'top-right' },
      ],
    },
    {
      // The first relation: every glyph has a partner by its label but the + and the −.
      kind: 'shot',
      name: 'relation-1',
      project: EXAMPLES.clips,
      setup: async (page, kit) => {
        await relateClips(page, kit, 'equation', 'subtract');
        await suggestLinks(page, kit);
      },
      target: 'relation-editor',
      padding: 8,
      highlight: [
        { target: 'rel-summary', label: 1, markerAt: 'top-right', pad: { left: 4, right: 14, top: 2, bottom: 2 } },
        { target: 'rel-pairs', label: 2, markerAt: 'top-right' },
        { target: 'rel-save', label: 3, markerAt: 'top-right' },
      ],
    },
    {
      // The second relation: 11 − 3 onto the 8, by hand. The four glyphs of the top formula are
      // picked (the first with a click, the others with Shift); a click on the 8 makes the pair.
      kind: 'shot',
      name: 'link-many',
      project: EXAMPLES.clips,
      setup: async (page, kit) => {
        await relateClips(page, kit, 'subtract', 'simplify');
        await suggestLinks(page, kit);
        await kit.click(glyph(page, 'from', 3));
        for (const index of [4, 5, 6]) {
          await kit.click(glyph(page, 'from', index), { hold: ['Shift'] });
        }
        // Off the drawing: the circle of the selector would sit on the rings.
        await kit.move({ x: 4, y: 4 });
      },
      // The left column of the editor, where the glyphs are: the pair's style is set in the list
      // on the right, which this crop leaves out (the page's text says it).
      target: { css: '.rel-main' },
      padding: 8,
      highlight: [
        {
          target: (page) => ({ union: [3, 4, 5, 6].map((index) => glyph(page, 'from', index)) }),
          label: 1,
          markerAt: 'top-right',
          pad: 4,
        },
        { target: (page) => glyph(page, 'to', 3), label: 2, markerAt: 'bottom-right', pad: 4 },
      ],
    },
    {
      // The last relation: the 8, the 2 and the fraction bar onto the 4.
      kind: 'shot',
      name: 'relation-4',
      project: EXAMPLES.clips,
      setup: async (page, kit) => {
        await relateClips(page, kit, 'divide', 'answer');
        await suggestLinks(page, kit);
        await linkManyToOne(page, kit, [2, 3, 4], 2);
        await setPairStyle(page, kit, 2, 'fade');
      },
      target: 'relation-editor',
      padding: 8,
      highlight: [
        { target: 'rel-pair-2', label: 1, markerAt: 'top-right' },
        { target: 'rel-save', label: 2, markerAt: 'top-right' },
      ],
    },
  ],
};
