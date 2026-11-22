/* Captures of basics/first-transform: how a relation between two clips is made, and what it is on
 * the timeline. The scene is `first-transform-start` (the seed example `first-transform` before
 * its clips are related) and, for the finished relations, `first-transform` itself. The steps
 * that make a relation are the shared ones of `_shared/formula-steps.mjs`. */
import { relateClips, suggestLinks } from '../_shared/formula-steps.mjs';

const START = 'docs/web/examples/first-transform-start.mfe.json';
const DONE = 'docs/web/examples/first-transform.mfe.json';

/** The left of the timeline at its default zoom: the track headers and the first 6.6 seconds. */
const TIMELINE = { x: 8, y: 643, width: 742, height: 245 };

/** The id of the `n`-th relation of the project. */
const relationId = (kit, n = 0) =>
  kit.mfe((mfe, index) => mfe.useProjectStore.getState().project.relations[index].id, n);

/** The middle of the arrow of relation `id`, as a small box: the box of the arrow's own element is
 * the box of its whole curve, which a ring would draw as a large rectangle. */
const arrowMiddle = async (page, id) => {
  const point = await page.getByTestId(`relation-arrow-${id}`).evaluate((path) => {
    const at = path.getPointAtLength(path.getTotalLength() / 2);
    const mapped = new DOMPoint(at.x, at.y).matrixTransform(path.getScreenCTM());
    return { x: mapped.x, y: mapped.y };
  });
  return { x: point.x - 3, y: point.y - 3, width: 6, height: 6 };
};

/** The glyph of the relation editor's `side` ('from' or 'to') with that label. */
const glyph = (page, side, label) =>
  page.locator(`[data-testid^="rel-${side}-glyph-"][data-label="${label}"]`).first();

export default {
  page: 'basics/first-transform',
  items: [
    {
      // Shift held: the link port at the lower right of every clip.
      kind: 'shot',
      name: 'ports',
      project: START,
      setup: async (page, kit) => {
        await kit.clearSelection();
        await kit.down('Shift');
      },
      target: TIMELINE,
      // The port's element is a 4 px box (its 14 px circle is drawn around it): a ring needs a pad.
      highlight: [
        { target: async (page, kit) => `clip-${await kit.clipId('step1')}-link`, pad: 8 },
        { target: async (page, kit) => `clip-${await kit.clipId('step2')}-link`, pad: 8 },
        { target: async (page, kit) => `clip-${await kit.clipId('step3')}-link`, pad: 8 },
      ],
    },
    {
      // The other way in: the Relations tab of the Animations panel, and the rule it reads out.
      kind: 'shot',
      name: 'relate-blocked',
      project: START,
      setup: async (page, kit) => {
        await kit.selectClip('step1');
        const other = await kit.clipId('step3');
        await page.getByTestId('create-relation-other').selectOption(other);
        await page.getByTestId('create-relation-blocker').waitFor();
      },
      target: 'panel-animations',
      highlight: [
        { target: 'create-relation-other', label: 1, markerAt: 'top-right' },
        { target: 'create-relation-direction', label: 2, markerAt: 'top-right' },
        { target: 'create-relation-blocker', label: 3, markerAt: 'top-right' },
      ],
    },
    {
      // The pair no label can suggest, made by hand: 5, − and 3 onto the 2 of x = 2.
      kind: 'clip',
      name: 'link-by-hand',
      project: START,
      setup: async (page, kit) => {
        await relateClips(page, kit, 'step2', 'step3');
        await suggestLinks(page, kit);
      },
      // The left column of the editor, where the glyphs are: the drawing and its toolbar.
      target: { css: '.rel-main' },
      padding: 8,
      keysAt: 'top-right',
      cursorStart: (page) => glyph(page, 'from', '5'),
      loop: false,
      holdEnd: 300,
      act: async (page, kit) => {
        await kit.pause(200);
        await kit.click(glyph(page, 'from', '5'));
        await kit.click(glyph(page, 'from', '−'), { hold: ['Shift'] });
        await kit.click(glyph(page, 'from', '3'), { hold: ['Shift'] });
        await kit.pause(400);
        await kit.click(glyph(page, 'to', '2'));
        await kit.pause(700);
      },
    },
    {
      // The relation editor playing the transformation before it is saved: a still of its middle.
      kind: 'shot',
      name: 'editor-preview',
      project: START,
      setup: async (page, kit) => {
        await relateClips(page, kit, 'step1', 'step2');
        await suggestLinks(page, kit);
        await kit.click('rel-view-preview');
        await page.getByTestId('rel-preview').waitFor();
        await kit.click('rel-preview-play');
        await page.getByTestId('rel-preview-scrub').fill('2.7');
        await kit.settle({ renders: false });
      },
      target: 'relation-editor',
      padding: 8,
      highlight: [
        { target: 'rel-view', label: 1, markerAt: 'top-right' },
        { target: 'rel-preview-scrub', label: 2, markerAt: 'bottom' },
        {
          target: { union: ['rel-preview-time', 'rel-preview-progress'] },
          label: 3,
          markerAt: 'bottom-right',
          pad: { left: 2, right: 6, top: 2, bottom: 6 },
        },
      ],
    },
    {
      // The relation on the timeline: its arrow, its window on the target clip and the part of the
      // source clip it takes the glyphs from.
      kind: 'shot',
      name: 'band',
      project: DONE,
      setup: async (page, kit) => {
        const id = await relationId(kit);
        await kit.click(`relation-window-${id}`);
        await page.getByTestId('relation-properties').waitFor();
      },
      target: TIMELINE,
      highlight: [
        {
          target: async (page, kit) => arrowMiddle(page, await relationId(kit)),
          label: 1,
          markerAt: 'top-right',
          pad: 10,
          radius: 14,
        },
        { target: async (page, kit) => `relation-window-${await relationId(kit)}`, label: 2, markerAt: 'bottom-right' },
        { target: async (page, kit) => `relation-source-window-${await relationId(kit)}`, label: 3, markerAt: 'top-right' },
      ],
    },
    {
      // The Animations panel for a selected relation: its pairs, its offset and duration.
      kind: 'shot',
      name: 'relation-panel',
      project: DONE,
      setup: async (page, kit) => {
        const id = await relationId(kit);
        await kit.click(`relation-window-${id}`);
        await page.getByTestId('relation-properties').waitFor();
      },
      target: 'panel-animations',
      highlight: [
        { target: 'relation-pairs', label: 1, markerAt: 'top-right' },
        { target: { union: ['relation-offset', 'relation-duration'] }, label: 2, markerAt: 'top-right' },
        { target: 'relation-style', label: 3, markerAt: 'bottom-right' },
      ],
    },
  ],
};
