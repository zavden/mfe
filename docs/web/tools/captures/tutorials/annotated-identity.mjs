/* Captures of tutorials/annotated-identity: the steps that turn the identity
 * a² − b² = (a − b)(a + b) (docs/web/examples/annotated-identity-start.mfe.json: the formula on the
 * timeline, written in over 1.8 s) into the scene of docs/web/examples/annotated-identity.mfe.json:
 * a brace under each side with its label, and an arrow that arcs over the equals sign. Each item
 * performs its step in the real app (the helpers of ../_shared/annotated-identity.mjs, which also
 * derive the finished project); the steps the reader repeats for the second side (the right brace
 * and its label) are not captured again. Stills only. */
import {
  arrowFromLeft,
  bendArrow,
  braceUnder,
  drawArrow,
  growArrow,
  labelBrace,
  objectPoint,
  pickRange,
  sides,
} from '../_shared/annotated-identity.mjs';

const START = 'docs/web/examples/annotated-identity-start.mfe.json';

/** The Preview's panel with room under it for a menu that opens over the timeline: 700 px tall,
 * or down to the bottom of the open menus when they reach lower. */
const PREVIEW_AND_MENU = async (page, kit) => {
  const panel = await kit.box('panel-preview');
  const bottoms = await page
    .locator('.ctx-menu')
    .evaluateAll((menus) => menus.map((menu) => menu.getBoundingClientRect().bottom));
  const height = Math.max(700, ...bottoms.map((bottom) => Math.ceil(bottom - panel.y + 8)));
  return { x: panel.x, y: panel.y, width: panel.width, height };
};

export default {
  page: 'tutorials/annotated-identity',
  project: START,
  items: [
    {
      // The playhead at 2.6 s. Alt+click the first glyph of the left side and Alt+Shift+click its
      // last: five glyphs picked. Brace ▾ lists the four sides.
      kind: 'shot',
      name: 'brace-left',
      target: PREVIEW_AND_MENU,
      setup: async (page, kit) => {
        await kit.seek(2.6);
      },
      steps: async (page, kit) => {
        await pickRange(kit, (await sides(kit)).left);
        await kit.click('glyph-pick-brace');
        await kit.settle({ renders: false });
      },
      cursor: true,
    },
    {
      // The menu of the brace with Colour ▸ open: the Manim colours as swatches.
      kind: 'shot',
      name: 'brace-colour',
      target: async (page, kit) =>
        kit.box({ union: ['[role="menu"][aria-label="Clip actions"]', '[role="menu"][aria-label="Colour"]'] }, { pad: 4 }),
      setup: async (page, kit) => {
        await kit.seek(2.6);
        await braceUnder(kit, page, 'left');
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await objectPoint(kit, 'b1'));
        await kit.openSubmenu('Colour');
      },
      cursor: true,
    },
    {
      // Add label ▸ Formula on the brace; the label is typed in the editor as raw LaTeX and applied.
      kind: 'shot',
      name: 'label-left',
      target: 'formula-editor',
      padding: 8,
      setup: async (page, kit) => {
        await kit.seek(2.6);
        await braceUnder(kit, page, 'left');
        await labelBrace(kit, 'b1', String.raw`\text{difference of squares}`, { done: false });
      },
    },
    {
      // The menu of the brace with Intro ▸ open: GrowFromCenter is Manim's for a brace.
      kind: 'shot',
      name: 'brace-intro',
      target: async (page, kit) =>
        kit.box({ union: ['[role="menu"][aria-label="Clip actions"]', '[role="menu"][aria-label="Intro"]'] }, { pad: 4 }),
      setup: async (page, kit) => {
        await kit.seek(2.6);
        await braceUnder(kit, page, 'left');
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await objectPoint(kit, 'b1'));
        await kit.openSubmenu('Intro');
      },
      cursor: true,
    },
    {
      // The playhead at 6.4 s: pick the left side, right-click the equals sign (not picked): the
      // menu of the clip, with Add line ▸ open.
      kind: 'shot',
      name: 'arrow-start',
      target: PREVIEW_AND_MENU,
      setup: async (page, kit) => {
        await kit.seek(6.4);
      },
      steps: async (page, kit) => {
        const { eq, left } = await sides(kit);
        await pickRange(kit, left);
        await kit.contextMenu(await kit.glyphPoint('identity', eq));
        await kit.openSubmenu('Add line');
      },
      cursor: true,
    },
    {
      // After the compass for the start (the top edge): an Alt drag over the right side picks its
      // ten glyphs, and the compass asks where on them the arrow ends.
      kind: 'shot',
      name: 'arrow-end',
      target: PREVIEW_AND_MENU,
      setup: async (page, kit) => {
        await kit.seek(6.4);
      },
      steps: async (page, kit) => {
        await arrowFromLeft(kit);
        const { right } = await sides(kit);
        await kit.drag(await kit.glyphPoint('identity', right[0]), await kit.glyphPoint('identity', right[1]), {
          hold: ['Alt'],
        });
        await kit.clearSelection();
        await kit.waitFor('line-compass');
      },
      cursor: true,
    },
    {
      // Curve ▸ Arc on the arrow, then the Arc field of the Line section: −55 bulges it upwards.
      kind: 'shot',
      name: 'arrow-arc',
      target: async (page, kit) => {
        const preview = await kit.box('panel-preview');
        const panel = await kit.box('panel-animations');
        // Down to the Arc row: the rows of the two ends list every glyph they are on and run over
        // each other when there are many.
        const curve = await kit.box('line-curve-row');
        return {
          x: preview.x,
          y: preview.y,
          width: panel.x + panel.width - preview.x,
          height: curve.y + curve.height + 10 - preview.y,
        };
      },
      setup: async (page, kit) => {
        await kit.seek(6.4);
        await drawArrow(kit);
        await bendArrow(kit, page, -55);
        await kit.scrollTo('line-section');
      },
      highlight: [{ target: 'line-curve-row', label: 1, markerAt: 'top-right' }],
    },
    {
      // The Intro of the arrow: GrowArrow, 1.4 s.
      kind: 'shot',
      name: 'arrow-grow',
      target: 'panel-animations',
      setup: async (page, kit) => {
        await kit.seek(6.4);
        await drawArrow(kit);
        await growArrow(kit, page, 1.4);
      },
      highlight: [
        { target: 'intro-kind', label: 1, markerAt: 'top-right' },
        { target: 'intro-duration', label: 2, markerAt: 'top-right' },
      ],
    },
  ],
};
