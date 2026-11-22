/* Captures of layout/align-symbol: Align by symbol on lines on screen together (by the pointer),
 * the compass and the halo, then across time — the symbol to move kept with G while the playhead
 * goes where the reference is — and the form with a locked formula as the reference
 * (Shift+Alt+G).
 *
 * Scenes: `layout-align-symbol-start` (four lines, `l1` … `l4`, each centred on its own, all on
 * screen from 4.6 s) and `layout-align-symbol-time-start` (`step1` → `step2` → `step3`, one line
 * turning into the next: step1 is alone before 2.2 s, step2 from 3.2 to 4.4 s, step3 after 5.4 s).
 *
 * A clip is one gesture, in about 5 s: it does not loop back (`loop: false`) and rests a little. */

const QUICK = { loop: false, holdStart: 300, holdEnd: 600 };

/** The page point of the equals sign of the formula `name`. */
async function onEquals(kit, name) {
  const labels = await kit.mfe(
    (mfe, wanted) =>
      mfe.useProjectStore
        .getState()
        .project.formulas.find((f) => f.name === wanted)
        .snapshot.glyphs.map((g) => g.label),
    name,
  );
  return kit.glyphPoint(name, labels.indexOf('='));
}

async function frameArea(page, kit) {
  const frame = await kit.box('preview-frame');
  return { x: frame.x - 3, y: frame.y - 3, width: frame.width + 6, height: frame.height + 6 };
}

/** Locks the formula's clip in the preview, from its menu on the timeline, as a hand does. */
async function lockInPreview(kit, name) {
  await kit.contextMenu({ clip: name });
  await kit.click({ role: 'menuitem', name: 'Lock in the preview' });
  await kit.settle({ renders: false });
}

/** The playhead at 4 s with the `=` of the second line kept by G, then at 1.6 s, where only the
 * first line is on screen: the state the three shots of "across time" are taken in. */
async function keptAt(page, kit) {
  await kit.seek(4);
  await kit.press('Alt+G');
  await kit.click(await onEquals(kit, 'step2'));
  await kit.press('g');
  await kit.seek(1.6);
}

export default {
  page: 'layout/align-symbol',
  project: 'docs/web/examples/layout-align-symbol-start.mfe.json',
  items: [
    {
      // Alt+G, the symbol to move (the = of the second line), the reference symbol (the = of the
      // first), a side of the compass: the second line moves so that its = is under the first's.
      kind: 'clip',
      name: 'by-pointer',
      ...QUICK,
      target: frameArea,
      setup: async (page, kit) => {
        await kit.seek(6);
      },
      act: async (page, kit) => {
        const mine = await onEquals(kit, 'l2');
        const reference = await onEquals(kit, 'l1');
        await kit.press('Alt+G', { after: 300 });
        await kit.click(mine, { after: 400 });
        await kit.click(reference, { after: 700 });
        await kit.click('compass-LEFT', { after: 900 });
      },
    },
    {
      // The compass on the reference symbol: nine places, Manim's UL … DR.
      kind: 'shot',
      name: 'compass',
      target: 'preview-frame',
      padding: 3,
      cursor: true,
      setup: async (page, kit) => {
        await kit.seek(6);
      },
      steps: async (page, kit) => {
        await kit.press('Alt+G');
        await kit.click(await onEquals(kit, 'l3'));
        await kit.click(await onEquals(kit, 'l1'));
        await kit.hover('compass-LEFT', { pause: 200 });
      },
    },
    {
      // The halo: the pointer is a circle, and the symbol nearest to it within its reach — not
      // only the one under it — is outlined and is what a click takes.
      kind: 'shot',
      name: 'halo',
      target: 'preview-frame',
      padding: 3,
      cursor: true,
      setup: async (page, kit) => {
        await kit.seek(6);
      },
      steps: async (page, kit) => {
        await kit.press('Alt+G');
        const equals = await onEquals(kit, 'l3');
        await kit.move({ x: equals.x, y: equals.y - 14 });
        await kit.pause(300);
      },
    },
    {
      // Shift+Alt+G: the reference is on a formula locked in the preview — drawn faint, out of
      // the pointer's reach otherwise — and it stays: the line of the first click moves to it.
      kind: 'shot',
      name: 'locked',
      target: 'preview-frame',
      padding: 3,
      cursor: true,
      setup: async (page, kit) => {
        await kit.seek(6);
        await lockInPreview(kit, 'l1');
      },
      steps: async (page, kit) => {
        await kit.press('Shift+Alt+G');
        await kit.click(await onEquals(kit, 'l3'));
        await kit.click(await onEquals(kit, 'l1'));
        await kit.hover('compass-LEFT', { pause: 200 });
      },
    },
    {
      // The playhead at 1.6 s with the symbol kept: the second line, faint, where it is at 4 s.
      kind: 'shot',
      name: 'kept',
      project: 'docs/web/examples/layout-align-symbol-time-start.mfe.json',
      target: 'preview-frame',
      padding: 3,
      cursor: true,
      setup: keptAt,
    },
    {
      // The ruler of the timeline marks the instant the symbol is kept at.
      kind: 'shot',
      name: 'ruler-mark',
      project: 'docs/web/examples/layout-align-symbol-time-start.mfe.json',
      target: async (page, kit) => {
        const ruler = await kit.box('timeline-ruler');
        return { x: ruler.x, y: ruler.y - 4, width: 520, height: ruler.height + 10 };
      },
      setup: keptAt,
    },
    {
      // What the alignment between two instants says it did.
      kind: 'shot',
      name: 'notice',
      project: 'docs/web/examples/layout-align-symbol-time-start.mfe.json',
      target: 'notice-host',
      padding: 6,
      setup: async (page, kit) => {
        await keptAt(page, kit);
        await kit.click(await onEquals(kit, 'step1'));
        await kit.click('compass-LEFT');
        await kit.waitFor('notice');
      },
    },
  ],
};
