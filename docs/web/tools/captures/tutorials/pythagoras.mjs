/* Captures of tutorials/pythagoras: the steps of the tutorial, performed in the app — a formula
 * written and applied, its terms coloured with a box dragged over the glyph view, the three
 * formulas on the timeline, the glyphs of one linked to the glyphs of the next, the Preview in
 * the middle of a transformation and the Python export dialog.
 *
 * Project: the finished `pythagoras` example. The setups take away what the step has not made
 * yet (its clips, its relations, the colours of the glyphs), so each capture starts where the
 * reader is at that step. */

const FINAL = 'docs/web/examples/pythagoras.mfe.json';

/** Takes the clips and the relations off the project: what steps 1 to 3 leave. */
const formulasOnly = (page, kit) =>
  kit.mfe((mfe) => {
    mfe.useProjectStore.getState().update((draft) => {
      draft.clips = [];
      draft.relations = [];
    });
  });

/** Takes the glyph colours off the formulas called `names` (an undo step of its own). */
const plain =
  (...names) =>
  (page, kit) =>
    kit.mfe((mfe, wanted) => {
      mfe.useProjectStore.getState().update((draft) => {
        for (const formula of draft.formulas) {
          if (wanted.includes(formula.name)) formula.glyphColors = {};
        }
      });
    }, names);

/** Opens the editor of the formula called `name`, as a double click on its card does. */
const openEditor = (name) => async (page, kit) => {
  const { id } = await kit.formula(name);
  await kit.doubleClick({ css: `[data-testid="formula-list"] [data-formula-id="${id}"]` });
  await page.getByTestId('formula-editor').waitFor();
  await kit.settle();
  await page.evaluate(() => document.activeElement?.blur());
};

/** A box dragged over the glyph view from just before glyph `first` to just after glyph `last`:
 * it selects them, and no other. The pointer goes to the start of the box in `ms` ms. */
const sweep = async (kit, first, last, ms = 280) => {
  const a = await kit.box(`glyph-${first}-frame`);
  const b = await kit.box(`glyph-${last}-frame`);
  const from = { x: a.x - 6, y: Math.min(a.y, b.y) - 10 };
  await kit.move(from, { duration: ms });
  await kit.drag(from, { x: b.x + b.width + 3, y: Math.max(a.y + a.height, b.y + b.height) + 10 }, { duration: ms });
};

/** Clicks a swatch of the glyph view, the pointer arriving in `ms` ms. */
const swatch = async (kit, name, after = 160, ms = 340) => {
  await kit.move(name, { duration: ms });
  await kit.click(name, { after });
};

/** The left 1000 px of the timeline panel: the track headers and the first 10 seconds. */
async function timelineLeft(page, kit) {
  const panel = await kit.box('panel-timeline');
  return { x: panel.x, y: panel.y, width: 1000, height: panel.height };
}

/** The project with its clips but not its relations, and the playhead where it is not on top of
 * anything: what step 5 leaves for the relation editor. */
const clipsOnly = (page, kit) =>
  kit.mfe((mfe) => {
    mfe.useProjectStore.getState().update((draft) => {
      draft.relations = [];
    });
  });

/** Opens the relation editor from the clip called `from`, to the clip called `to`, as the
 * Animations panel does: Relate with, then Create relation…. */
const openRelationEditor = (from, to) => async (page, kit) => {
  await kit.selectClip(from);
  const other = page.getByTestId('create-relation-other');
  await other.waitFor();
  const options = await other.locator('option').allTextContents();
  await other.selectOption({ index: options.findIndex((text) => text.startsWith(`${to} `)) });
  await kit.click('create-relation-button');
  await page.getByTestId('relation-editor').waitFor();
  await kit.settle();
  await page.evaluate(() => document.activeElement?.blur());
};

export default {
  page: 'tutorials/pythagoras',
  project: FINAL,
  items: [
    {
      // Step 1: the editor of a new formula with its LaTeX applied, its name typed and its size
      // set to 2: the name (1), the size (2), the Raw LaTeX field (3) and Apply (4).
      kind: 'shot',
      name: 'new-formula',
      project: null,
      steps: async (page, kit) => {
        await kit.click('creator-new');
        await page.getByTestId('formula-editor').waitFor();
        // The new formula is blank and renders nothing: do not wait for its render yet.
        await kit.settle({ renders: false });
        await page.getByTestId('raw-latex').fill('a^2 + b^2 = c^2');
        await kit.click('editor-apply');
        await page.getByTestId('editor-status').filter({ hasText: '8 glyphs' }).waitFor();
        await kit.click('editor-name');
        await kit.page.keyboard.press('ControlOrMeta+A');
        await kit.type('theorem');
        await kit.press('Enter');
        await kit.click('editor-scale');
        await kit.page.keyboard.press('ControlOrMeta+A');
        await kit.type('2');
        await kit.press('Enter');
        await page.evaluate(() => document.activeElement?.blur());
        await kit.move({ x: 4, y: 4 });
        await kit.settle();
      },
      target: 'formula-editor',
      highlight: [
        { target: 'editor-name', label: 1, markerAt: 'right' },
        { target: { union: ['editor-scale', 'editor-font-size'] }, label: 2, markerAt: 'bottom' },
        { target: 'raw-latex', label: 3, markerAt: 'top-right' },
        { target: 'editor-apply', label: 4, markerAt: 'right' },
      ],
    },
    {
      // Step 2: a box over the a and its exponent, the blue swatch; a box over the b and its
      // exponent, gold. Two terms show the gesture; the page says the third.
      kind: 'clip',
      name: 'colour-terms',
      setup: [formulasOnly, plain('theorem'), openEditor('theorem')],
      // The drawing, the line under it and the swatches with their hex field: what the step is
      // about. The clip's buttons are a bar under the picture, so nothing is left blank for them.
      target: { union: ['.glyph-svg', 'palette-WHITE', 'palette-PURPLE', 'glyph-custom-color-hex'] },
      padding: { top: 8, right: 8, bottom: 0, left: 8 },
      holdStart: 150,
      holdEnd: 150,
      loop: false,
      act: async (page, kit) => {
        await sweep(kit, 0, 1);
        await swatch(kit, 'palette-BLUE');
        await sweep(kit, 3, 4);
        await swatch(kit, 'palette-GOLD', 200);
      },
    },
    {
      // Step 3: the three formulas in the Creator, each term in its colour.
      kind: 'shot',
      name: 'three-formulas',
      setup: [formulasOnly],
      steps: async (page, kit) => {
        await kit.move({ x: 4, y: 4 });
      },
      target: 'panel-creator',
    },
    {
      // Step 5: the right-click menu of the first clip, Intro ▸ Write.
      kind: 'shot',
      name: 'intro-menu',
      setup: [
        (page, kit) =>
          kit.mfe((mfe) => {
            mfe.useProjectStore.getState().update((draft) => {
              for (const clip of draft.clips) clip.intro = { ...clip.intro, kind: 'none', duration: 0 };
            });
          }),
      ],
      steps: async (page, kit) => {
        await kit.contextMenu({ clip: 'theorem' });
        // The pointer stays on the entry: moving off it would close the submenu, or open another.
        await kit.openSubmenu('Intro');
      },
      target: async (page, kit) => {
        const clip = await kit.box({ clip: 'theorem' });
        const menus = await page.locator('.ctx-menu').evaluateAll((items) =>
          items.map((item) => {
            const box = item.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, height: box.height };
          }),
        );
        const boxes = [clip, ...menus];
        const left = Math.min(...boxes.map((b) => b.x));
        const top = Math.min(...boxes.map((b) => b.y));
        const right = Math.max(...boxes.map((b) => b.x + b.width));
        const bottom = Math.max(...boxes.map((b) => b.y + b.height));
        return { x: left, y: top, width: right - left, height: bottom - top };
      },
      padding: 8,
    },
    {
      // Step 6: the relation editor from theorem to numbers, after Suggest links by label: the
      // exponents, the plus and the equals sign are proposed as dashed links (1), and Accept all
      // (2) takes them.
      kind: 'shot',
      name: 'relation-suggest',
      setup: [clipsOnly, openRelationEditor('theorem', 'numbers')],
      steps: async (page, kit) => {
        await kit.click('rel-auto-link');
        await page.getByTestId('rel-suggestion').waitFor();
        await kit.move({ x: 4, y: 4 });
        await kit.settle();
      },
      target: 'relation-editor',
      scale: 1,
      highlight: [
        { target: 'rel-auto-link', label: 1, markerAt: 'top-left' },
        { target: 'rel-suggestion', label: 2, markerAt: 'top-right' },
      ],
    },
    {
      // The editor with the eight pairs of the first relation linked.
      kind: 'shot',
      name: 'relation-linked',
      setup: [clipsOnly, openRelationEditor('theorem', 'numbers')],
      steps: async (page, kit) => {
        await kit.click('rel-auto-link');
        await kit.click('rel-suggestion-accept');
        for (const glyph of [0, 3, 6]) {
          await kit.click(`rel-from-glyph-${glyph}`);
          await kit.click(`rel-to-glyph-${glyph}`);
        }
        await kit.move({ x: 4, y: 4 });
        await kit.settle();
      },
      target: 'relation-editor',
      scale: 1,
    },
    {
      // The second relation as the finished project has it: several glyphs of one formula
      // onto one or two of the next, the 3 and its exponent onto the 9, and so on.
      kind: 'shot',
      name: 'numbers-to-squares',
      setup: [
        async (page, kit) => {
          await kit.selectClip('numbers');
          const id = await kit.mfe((mfe) => {
            const { project } = mfe.useProjectStore.getState();
            return project.relations[1].id;
          });
          await kit.click(`relation-edit-${id}`);
          await page.getByTestId('relation-editor').waitFor();
          await kit.settle();
          await page.evaluate(() => document.activeElement?.blur());
        },
      ],
      steps: async (page, kit) => {
        await kit.move({ x: 4, y: 4 });
      },
      target: 'relation-editor',
      scale: 1,
    },
    {
      // The three clips and the two relations between them, as the finished project has them,
      // with the playhead in the middle of the first relation's window (2 s to 3 s).
      kind: 'shot',
      name: 'timeline',
      setup: [(page, kit) => kit.seek(2.5)],
      target: timelineLeft,
    },
    {
      // Step 8: the Preview in the middle of the first transformation (2.5 s, the window is 2 s
      // to 3 s): the exponents, the plus and the equals sign stay, the letters turn into
      // numbers, each in its colour.
      kind: 'shot',
      name: 'play',
      setup: [(page, kit) => kit.seek(2.5)],
      target: 'preview-frame',
      padding: 4,
    },
    {
      // Step 8: Export ▸ Python — ManimCE…, and its Download button.
      kind: 'shot',
      name: 'export',
      steps: async (page, kit) => {
        await kit.choose('Export ▸ Python — ManimCE…');
        await page.getByTestId('export-python').waitFor();
        await page.getByTestId('export-python-code').waitFor();
        await kit.settle();
        await kit.move({ x: 4, y: 4 });
      },
      target: 'export-python',
      scale: 1,
      highlight: [{ target: 'export-python-download', label: 1, markerAt: 'top-left' }],
    },
  ],
};
