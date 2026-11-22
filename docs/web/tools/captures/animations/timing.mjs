/* Captures of animations/timing.
 *
 * Most items open docs/web/examples/timing-clips: a formula, `energy`, on a clip over 1–5 s of
 * the track Equation (Write intro and FadeOut outro of 1 s each); a second formula, `note`, on
 * two clips — over 2–4.5 s of the track Notes (FadeIn intro of 0.5 s), and over 6–8 s of the
 * track Equation. The split items open docs/web/examples/timing-split-start, whose one Appear
 * block names both sides of an equation, and the result, timing-split, which the app made from it
 * (`examples.mjs derive`: the block's Split… with the glyphs 4, 5 and 6). Windows 1100 px wide, as
 * captures/basics/timeline.mjs. */

const CLIPS = 'docs/web/examples/timing-clips.mfe.json';
const SPLIT_START = 'docs/web/examples/timing-split-start.mfe.json';
const SPLIT = 'docs/web/examples/timing-split.mfe.json';
const WIDE = { width: 1100, height: 900 };

/** Right-click the clip of formula `name` at `seconds` from its start, in its lower half, and
 * open the submenu `submenu` of its menu. `index` picks one of several clips of the formula. */
async function clipMenu(kit, name, seconds, submenu, index = 0) {
  const px = await kit.pxPerSecond();
  await kit.contextMenu({ clip: name, index }, { position: { x: seconds * px, y: 30 } });
  if (submenu) await kit.openSubmenu(submenu);
}

/** The area of the menu on screen and its submenu, one box (both are open). */
const menus = (submenu) => async (page, kit) => {
  const menu = await kit.box('.ctx-menu >> nth=0');
  const sub = await kit.box(`[role="menu"][aria-label="${submenu}"]`);
  const left = Math.min(menu.x, sub.x);
  const top = Math.min(menu.y, sub.y);
  return {
    x: left,
    y: top,
    width: Math.max(menu.x + menu.width, sub.x + sub.width) - left,
    height: Math.max(menu.y + menu.height, sub.y + sub.height) - top,
  };
};

/** Copy the timing of `energy` from its own menu. */
async function copyEnergyTiming(kit) {
  await clipMenu(kit, 'energy', 1.6, 'Timing');
  await kit.choose('Copy timing');
}

export default {
  page: 'animations/timing',
  project: CLIPS,
  viewport: WIDE,
  items: [
    {
      // Timing › on a clip, once the timing of energy is copied: what each paste would write.
      kind: 'shot',
      name: 'timing-menu',
      target: menus('Timing'),
      padding: 6,
      steps: async (page, kit) => {
        await copyEnergyTiming(kit);
        await clipMenu(kit, 'note', 1.2, 'Timing');
      },
    },
    {
      // The timing of energy copied, then pasted onto the note under it: its start, then its
      // duration. Each step shows the timeline after what its caption says.
      kind: 'tour',
      name: 'timing-paste',
      target: 'panel-timeline',
      steps: [
        {
          caption:
            '<code>energy</code> runs from 1 s to 5 s, and the note under it from 2 s to 4.5 s. ' +
            '<span class="ui">Timing ▸ Copy timing</span> on <code>energy</code> takes its times.',
          act: async (page, kit) => {
            await copyEnergyTiming(kit);
          },
          focus: [{ clip: 'energy' }, { clip: 'note' }],
          focusPadding: 2,
        },
        {
          caption:
            '<span class="ui">Paste start</span> on the note: it keeps its length and starts ' +
            'where <code>energy</code> starts, at 1 s.',
          act: async (page, kit) => {
            await clipMenu(kit, 'note', 1.2, 'Timing');
            await kit.choose('Paste start');
            await kit.settle();
          },
          focus: [{ clip: 'note' }],
          focusPadding: 2,
        },
        {
          caption:
            '<span class="ui">Paste duration</span>: it lasts as long as <code>energy</code>, ' +
            '4 s, and ends at 5 s.',
          act: async (page, kit) => {
            await clipMenu(kit, 'note', 1.2, 'Timing');
            await kit.choose('Paste duration');
            await kit.settle();
          },
          focus: [{ clip: 'note' }],
          focusPadding: 2,
        },
      ],
    },
    {
      // The second note is on the track of energy: it cannot start where energy does, and says
      // who is in its way.
      kind: 'shot',
      name: 'timing-notice',
      target: 'notice',
      padding: 8,
      steps: async (page, kit) => {
        await copyEnergyTiming(kit);
        await clipMenu(kit, 'note', 0.8, 'Timing', 1);
        await kit.choose('Paste start');
        await page.getByTestId('notice').waitFor();
      },
    },
    {
      // The menu of one clip: its animations, its object's own entries, its timing.
      kind: 'shot',
      name: 'clip-menu',
      target: '.ctx-menu',
      padding: 6,
      steps: async (page, kit) => {
        await clipMenu(kit, 'note', 1.2);
      },
    },
    {
      // The menu of several selected clips, Timing › open: the pastes, and no Copy.
      kind: 'shot',
      name: 'clips-menu',
      target: menus('Timing'),
      padding: 6,
      steps: async (page, kit) => {
        await copyEnergyTiming(kit);
        await kit.selectClip(['energy', 'note']);
        await clipMenu(kit, 'note', 1.2, 'Timing');
      },
    },
    {
      // The first clip of note unlinked: its formula has a copy, note2, right after it in the
      // Creator, and the clip carries that name.
      kind: 'shot',
      name: 'unlink',
      target: 'panel-creator',
      padding: 4,
      steps: async (page, kit) => {
        await clipMenu(kit, 'note', 1.2);
        await kit.choose('Unlink formula');
        await kit.settle();
      },
    },
    {
      // The formula editor's fields: Appears with, with its duration.
      kind: 'shot',
      name: 'appears-with',
      target: '.editor-fields',
      padding: 8,
      steps: async (page, kit) => {
        // The second card of the Creator's list: the body of the card, not its name (a rename).
        await kit.doubleClick(page.getByTestId('formula-item').nth(1));
        await page.getByTestId('formula-editor').waitFor();
        await page.getByTestId('editor-intro').selectOption('write');
        await kit.settle();
      },
    },
    {
      // Appears with set to Write on note: its second clip, which had no intro, follows; the
      // first, which had its own, keeps it.
      kind: 'shot',
      name: 'appears-with-clips',
      target: 'panel-timeline',
      steps: async (page, kit) => {
        await kit.doubleClick(page.getByTestId('formula-item').nth(1));
        await page.getByTestId('formula-editor').waitFor();
        await page.getByTestId('editor-intro').selectOption('write');
        await kit.click('editor-close');
        await kit.settle();
      },
    },
    {
      // The menu of a block that names glyphs: Split into runs, Split…, Duplicate for the other
      // glyphs.
      kind: 'shot',
      name: 'block-menu',
      project: SPLIT_START,
      target: '.ctx-menu',
      padding: 6,
      steps: async (page, kit) => {
        await kit.contextMenu('.tl-block');
      },
    },
    {
      // The Split dialog, the glyphs 4, 5 and 6 chosen.
      kind: 'tour',
      name: 'split-dialog',
      project: SPLIT_START,
      target: 'split-dialog',
      padding: 4,
      setup: async (page, kit) => {
        await kit.contextMenu('.tl-block');
        await kit.choose('Split…');
        await page.getByTestId('split-dialog').waitFor();
        for (const glyph of [4, 5, 6]) await kit.click(`split-glyph-chip-${glyph}`);
      },
      steps: [
        {
          caption:
            'The <b>formula</b>, with the glyphs the block animates in full and the others faint. ' +
            'Here the block animates both sides of the equation, not the <b>=</b>. Click glyphs ' +
            'to choose the ones that go to a new block; Shift picks a range and a box drawn ' +
            'over the formula picks what it touches.',
          focus: ['.split-glyph-svg'],
          focusPadding: 3,
        },
        {
          caption: 'The <b>chips</b> are the same glyphs, by their index, for the keyboard.',
          focus: ['.split-glyphs .glyph-chips'],
          focusPadding: 3,
        },
        {
          caption:
            '<span class="ui">Another block</span> sets the chosen glyphs aside as a block of ' +
            'its own, so that you can choose those of the next one.',
          focus: ['split-add-part'],
          focusPadding: 3,
        },
        {
          caption: 'A line says what <span class="ui">Split</span> will make.',
          focus: ['split-summary'],
          focusPadding: 3,
        },
        {
          caption:
            '<span class="ui">Split</span> makes the blocks, as one undo step. The new blocks run at ' +
            'the same time as the first: they are a group.',
          focus: ['split-confirm'],
          focusPadding: 3,
        },
      ],
    },
    {
      // The result of a split, as the app made it (timing-split): the two blocks are one group
      // on the lane of the clip.
      kind: 'shot',
      name: 'split-result',
      project: SPLIT,
      target: 'panel-timeline',
      highlight: [{ target: '.tl-block >> nth=0', label: 1, markerAt: 'top-right' }],
    },
    {
      // Copy properties of energy, in the Preview's menu, and the Paste properties › entries,
      // each with what it would paste.
      kind: 'shot',
      name: 'paste-menu',
      target: menus('Paste properties'),
      padding: 6,
      setup: async (page, kit) => {
        await kit.seek(2.5);
        await kit.mfe((mfe) => {
          mfe.useProjectStore.getState().update((draft) => {
            const formula = draft.formulas.find((f) => f.name === 'energy');
            const clip = draft.clips.find((c) => c.formulaId === formula.id);
            clip.initial.scale = 1.25;
            clip.initial.rotation = 8;
            clip.initial.opacity = 0.8;
            clip.initial.color = '#F4C867';
          });
        });
        await kit.settle();
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await kit.glyphPoint('energy', 1));
        await kit.choose('Copy properties');
        await kit.contextMenu(await kit.glyphPoint('note', 0));
        await kit.openSubmenu('Paste properties');
      },
    },
    {
      // With two clips selected a bar in the Preview offers the same pastes.
      kind: 'shot',
      name: 'properties-bar',
      target: 'preview-actions',
      padding: 6,
      setup: async (page, kit) => {
        await kit.seek(2.5);
        // Something copied first, so that Paste properties is on.
        const copied = await kit.clipId('energy');
        await kit.app('/src/ui/preview/propertyClipboard.ts', (m, id) => m.copyProperties(id), copied);
        await kit.selectClip(['energy', 'note']);
      },
    },
  ],
};
