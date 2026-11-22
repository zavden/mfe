/* Captures of objects/texts: the "+ New" menu, a LaTeX text typed in the composition editor, the
 * editor in a tour, the Glyphs view and the position of a text in tours of their own, what a
 * broken text looks like, a font text drawn as placeholder boxes (the tools never start the
 * companion), a text opened from its clip, and the Creator with both kinds, the menu of a text's
 * card and the panel that adds it to the timeline. The first items start from the new, empty
 * project; the last ones from `texts-title`: a LaTeX text with maths inside, writing in over a
 * formula. */

const TITLE = 'docs/web/examples/texts-title.mfe.json';

/** The composition editor, with a little room around it. */
const DIALOG = { target: 'text-composition', padding: 12 };

/** The same without the foot of the dialog, for the shots and the clip that need no footer: the
 * form's first fields, the stage, its controls and what is said under it. */
const TOP = { target: { x: 118, y: 33, width: 1204, height: 724 } };

/** The right column of the dialog: what the stage side shows, from the switch over the stage to
 * the hint under its controls. */
const STAGE_SIDE = { target: { x: 496, y: 100, width: 818, height: 640 } };

/** What `+ New ▸ Text (LaTeX)` opens, with the text typed and rendered. */
const SOURCE = 'Pythagoras said $a^2 + b^2 = c^2$ about right triangles';

async function newText(page, kit, kind) {
  await kit.click('creator-new-menu');
  await kit.click(`creator-new-${kind}`);
  await kit.locate('text-composition').then((dialog) => dialog.waitFor());
  await kit.settle();
}

/** Put into the field of a LaTeX text in one input event, as a paste does, and waited for until it
 * is drawn. Typing it key by key into an editor that has just opened sometimes dropped a key
 * (and raised a React error): the text came out as "trianges". */
async function typeText(page, kit, text) {
  await page.getByTestId('tex-source').fill(text);
  await kit.waitFor('text-render-status', { has: { 'data-state': 'ok' }, timeout: 15_000 });
  await kit.settle();
}

export default {
  page: 'objects/texts',
  items: [
    {
      // The menu of the arrow of + New: a formula, a LaTeX text and a font text.
      kind: 'shot',
      name: 'new-menu',
      steps: async (page, kit) => {
        await kit.click('creator-new-menu');
      },
      target: { x: 8, y: 52, width: 440, height: 250 },
      highlight: [{ target: 'creator-new-tex', label: 1, markerAt: 'right' }],
    },
    {
      // A LaTeX text typed, with a piece of maths and a line break: the stage draws it while it
      // is typed, and the dot beside the line over the stage tells what the render is doing. The
      // text is then dragged up and to the left.
      kind: 'clip',
      name: 'typing',
      ...TOP,
      holdStart: 300,
      holdEnd: 300,
      // The text ends up where it was dragged: the clip does not loop back to an empty editor, so
      // the pointer does not glide back either.
      loop: false,
      setup: async (page, kit) => {
        await newText(page, kit, 'tex');
      },
      act: async (page, kit) => {
        await kit.type('Sum: $a^2 + b^2 = c^2$', { delay: 40 });
        await kit.pause(700);
        const stage = await kit.box('text-stage-canvas');
        const from = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
        await kit.drag(
          from,
          { x: stage.x + stage.width * 0.3, y: stage.y + stage.height * 0.28 },
          { duration: 800 },
        );
        await kit.pause(300);
      },
    },
    {
      // The editor, step by step.
      kind: 'tour',
      name: 'workspace',
      ...DIALOG,
      setup: async (page, kit) => {
        await newText(page, kit, 'tex');
        await typeText(page, kit, SOURCE);
      },
      steps: [
        {
          caption:
            'The <b>form</b> is on the left: the text itself, its size and colour, its layout ' +
            'and what it is as an object. Nothing reaches the project until <span class="ui">Apply</span>.',
          focus: ['.text-composition-source'],
        },
        {
          caption:
            'The <b>stage</b> is the video frame, with the grid and the scene’s coordinates. ' +
            'Drag the text to place it.',
          focus: ['text-stage-canvas'],
        },
        {
          caption:
            'Over the stage, the <span class="ui">Placement</span> and <span class="ui">Glyphs</span> ' +
            'switch, and the line that says how many glyphs the text has and who drew them. The ' +
            'dot is amber while the text is rendered again, green when what is drawn is current.',
          focus: ['.text-preview-head'],
        },
        {
          caption:
            'Under the stage, the position in numbers, two buttons that centre the text, and ' +
            '<span class="ui">New clips start here</span>.',
          focus: ['.text-position-controls'],
        },
        {
          caption:
            '<span class="ui">Apply</span> makes the text an object of the Creator, in one undo step. ' +
            '<span class="ui">Cancel</span> leaves nothing behind. The line beside them says what ' +
            'Apply will do.',
          focus: ['text-apply', 'text-cancel'],
          focusPadding: 6,
        },
      ],
    },
    {
      // The Glyphs view: the glyphs of the draft, a box over the maths, a colour, and back to
      // the stage.
      kind: 'tour',
      name: 'glyphs',
      ...STAGE_SIDE,
      scale: 1.5,
      setup: async (page, kit) => {
        await newText(page, kit, 'tex');
        await typeText(page, kit, SOURCE);
      },
      steps: [
        {
          caption:
            'The switch over the stage shows <span class="ui">Glyphs</span> in place of ' +
            '<span class="ui">Placement</span>: the glyphs of the text, each in a box of its own.',
          act: async (page, kit) => {
            await kit.click('text-view-glyphs');
            await kit.pause(400);
          },
          focus: ['text-glyphs'],
        },
        {
          caption:
            'Drag a box over the glyphs to colour or hide. Here it takes in <i>a² + b² = c²</i>, ' +
            'glyphs 14 to 21. A click picks one glyph, <kbd data-keys="Shift">Shift</kbd>+click a ' +
            'range, <kbd data-keys="Mod">Ctrl</kbd>+click adds or removes one.',
          act: async (page, kit) => {
            // The glyphs of a² + b² = c² are 14 to 21, counted from the first letter of the text.
            const first = await kit.box('glyph-14');
            const last = await kit.box('glyph-21');
            await kit.drag(
              { x: first.x - 6, y: first.y - 14 },
              { x: last.x + last.width + 6, y: last.y + last.height + 10 },
              { duration: 300 },
            );
          },
          focus: ['glyph-selection'],
        },
        {
          caption:
            'Press a colour, then go back to <span class="ui">Placement</span>: the colours are ' +
            'on the stage, and stay with their glyphs as you go on typing.',
          act: async (page, kit) => {
            await kit.click('palette-YELLOW');
            await kit.click('text-view-placement');
          },
          focus: ['text-stage-canvas'],
        },
      ],
    },
    {
      // The stage: the text at the centre, then dragged to the upper left, with its position in
      // the fields and the box that keeps it for the new clips of the text.
      kind: 'tour',
      name: 'start-position',
      ...STAGE_SIDE,
      scale: 1.5,
      setup: async (page, kit) => {
        await newText(page, kit, 'tex');
        await typeText(page, kit, 'Title');
      },
      steps: [
        {
          caption:
            'A new text stands at the centre of the frame: <span class="ui">X</span> and ' +
            '<span class="ui">Y</span> are 0.',
          focus: ['.text-position-controls'],
        },
        {
          caption:
            'Drag it where its clips should start. <span class="ui">X</span> and ' +
            '<span class="ui">Y</span> follow. With <span class="ui">New clips start here</span> ' +
            'ticked, <span class="ui">Apply</span> keeps this position for the text’s new clips.',
          act: async (page, kit) => {
            const stage = await kit.box('text-stage-canvas');
            const from = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
            await kit.drag(from, { x: stage.x + 130, y: stage.y + 80 }, { duration: 300 });
          },
          focus: ['.text-position-controls'],
        },
      ],
    },
    {
      // A text that does not compile: the dot is red, what the renderer said is under the stage,
      // the stage keeps the last appearance that rendered and the centring waits.
      kind: 'shot',
      name: 'latex-error',
      ...STAGE_SIDE,
      scale: 1.5,
      setup: async (page, kit) => {
        await newText(page, kit, 'tex');
        await typeText(page, kit, 'Fine: $x^2$');
      },
      steps: async (page, kit) => {
        await kit.type(' and \\textbf{ broken', { delay: 0 });
        await kit.waitFor('text-render-status', { has: { 'data-state': 'error' }, timeout: 15_000 });
        await kit.settle();
      },
    },
    {
      // A font text without the companion: one placeholder box for each character, in the
      // font the browser has under that name, and the badge that says what is missing.
      kind: 'shot',
      name: 'font-boxes',
      ...TOP,
      setup: async (page, kit) => {
        await newText(page, kit, 'text');
      },
      steps: async (page, kit) => {
        await kit.type('Any font on your machine', { delay: 0 });
        await kit.waitFor('text-needs-companion', { timeout: 15_000 });
        await kit.settle();
      },
    },
    {
      // The Creator with both kinds: T and P on the left, the badge on the font text.
      kind: 'shot',
      name: 'creator-list',
      project: TITLE,
      setup: async (page, kit) => {
        await page.evaluate(async () => {
          const model = await import('/src/model/index.ts');
          window.__mfe.useProjectStore.getState().update((draft) => {
            draft.formulas.push(
              model.createTextFormula({ name: 'caption', source: 'Any font on your machine', fontSize: 56 }),
            );
          });
        });
        await kit.waitForRenders();
      },
      target: 'panel-creator',
    },
    {
      // A text opened from its clip: the stage places that clip, and the box is not there.
      kind: 'shot',
      name: 'from-clip',
      project: TITLE,
      setup: async (page, kit) => {
        await kit.seek(3);
      },
      steps: async (page, kit) => {
        await kit.doubleClick({ clip: 'title' });
        await kit.locate('text-composition').then((dialog) => dialog.waitFor());
        // The centre buttons wait for the text to be drawn: a picture taken before shows them off.
        await kit.waitFor('text-render-status', { has: { 'data-state': 'ok' }, timeout: 15_000 });
        await kit.settle();
      },
      target: { union: ['text-position-x', 'text-apply'] },
      padding: { top: 12, right: 12, bottom: 12, left: 18 },
    },
    {
      // The menu of a text's card in the Creator: Edit…, and Add to the timeline.
      kind: 'shot',
      name: 'card-menu',
      project: TITLE,
      steps: async (page, kit) => {
        await kit.contextMenu({ css: '[data-testid="formula-list"] [data-formula-id]' });
      },
      target: { union: ['panel-creator', 'formula-menu'] },
    },
    {
      // A text of the Creator that no clip uses yet, selected: the Animations panel offers to add
      // it to the timeline, at the playhead.
      kind: 'shot',
      name: 'add-to-timeline',
      project: TITLE,
      setup: async (page, kit) => {
        await page.evaluate(async () => {
          const model = await import('/src/model/index.ts');
          window.__mfe.useProjectStore.getState().update((draft) => {
            draft.formulas.push(
              model.createTexFormula({ name: 'caption', source: 'Not on the timeline yet' }),
            );
          });
        });
        await kit.waitForRenders();
        await kit.selectFormula('caption');
      },
      target: { x: 1122, y: 52, width: 310, height: 250 },
      highlight: [{ target: 'formula-add-to-timeline', label: 1, markerAt: 'top-right' }],
    },
  ],
};
