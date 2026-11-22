/* Captures of basics/slides: the Slides mode in the editor and the page Export ▸ HTML writes, on
 * the example `slides-talk` — First transform with the mode on: x + 3 = 5 is written in (0–1 s),
 * turns into x = 5 − 3 (2.2–3.2 s) and into x = 2 (4.4–5.4 s), and the scene ends at 6.6 s. It
 * carries a pause at 1.00 s and one at 3.20 s, each with a note, and a comment at 5.40 s. The first
 * pause skips its wait (format 36): going on from it, the scene jumps over its rest, 1.00–2.20 s,
 * to where the first transformation starts; the second keeps its wait. A long
 * scene for «Add a pause after every animation»: `linear-equation` (four transformations, 16 s).
 *
 * The exported page is shown as its reader sees it: the app's own Export ▸ HTML of the project it
 * holds (`exportedSingle`, the page of one file, with the runtime the app carries) in a frame laid
 * over the app — the page is the scene's own page, so it is the same in both themes.
 *
 * The items use a window 1100 px wide, as basics/timeline does: the timeline is fitted to the
 * scene's 6.6 s, so that every zone of the ruler has room. */

const PROJECT = 'docs/web/examples/slides-talk.mfe.json';
const LONG = 'docs/web/examples/linear-equation.mfe.json';
const WIDE = { width: 1100, height: 900 };

/** The timeline fitted to the scene, nothing selected. */
async function fitted(page, kit) {
  await kit.clearSelection();
  await kit.click('timeline-fit');
  await kit.settle();
}

/** A point of the ruler at `t` seconds, in its lower part (the marks stand in the upper part). */
async function rulerAt(kit, t) {
  const ruler = await kit.box('timeline-ruler');
  return { x: await kit.timeToX(t), y: ruler.y + ruler.height * 0.78 };
}

/** The toolbar, the ruler and the two tracks of the timeline, from its left edge to a little after
 * `to` seconds. */
const timelineArea = (to) => async (page, kit) => {
  const bar = await kit.box('.tl-toolbar');
  const panel = await kit.box('panel-timeline');
  const lane = await kit.box({ track: 'Track 1' });
  const right = (await kit.timeToX(to)) + 16;
  return { x: panel.x, y: bar.y, width: right - panel.x, height: lane.y + lane.height + 10 - bar.y };
};

/** A right-click menu (`testId`) with the ruler beside it, from 0 s to the scene's end. */
const menuAreaOf = (testId) => async (page, kit) => {
  const ruler = await kit.box('timeline-ruler');
  const menu = await kit.box(testId);
  const left = Math.min(ruler.x, menu.x) - 8;
  const right = Math.max(await kit.timeToX(6.6), menu.x + menu.width) + 12;
  const top = Math.min(ruler.y, menu.y);
  const bottom = Math.max(ruler.y + ruler.height, menu.y + menu.height) + 8;
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** The ruler's right-click menu with the ruler under it. */
const menuArea = menuAreaOf('slide-ruler-menu');

/** The ruler from 0 s to the scene's end, with the tip of the mark the pointer rests on. */
const tipArea = async (page, kit) => {
  const ruler = await kit.box('timeline-ruler');
  const tip = await kit.box('slide-mark-tip');
  const left = Math.min(ruler.x, tip.x) - 8;
  const right = Math.max(await kit.timeToX(6.6), tip.x + tip.width) + 12;
  const top = ruler.y - 8;
  const bottom = Math.max(ruler.y + ruler.height, tip.y + tip.height) + 10;
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** The page Export ▸ HTML writes of the project the app holds, as one file, in a frame over the
 * app: `width` × `height` CSS px at the top left of the window. Waits until its deck is drawn. */
async function exportedPage(page, kit, { width = 880, height = 560 } = {}) {
  await kit.until((mfe) => {
    const { project } = mfe.useProjectStore.getState();
    const { resolved } = mfe.useRenderStore.getState();
    return project.formulas.every((f) => f.source.trim() === '' || resolved.has(f.id));
  });
  await kit.evaluate(
    async ({ width, height }) => {
      const mfe = window.__mfe;
      const modules = ['/src/export/html/exportHtml.ts', '/src/export/html/runtimeAssets.ts'];
      const { exportedSingle } = await import(/* @vite-ignore */ modules[0]);
      const { RUNTIME_ASSETS } = await import(/* @vite-ignore */ modules[1]);
      const file = exportedSingle({
        project: mfe.useProjectStore.getState().project,
        resolved: mfe.useRenderStore.getState().resolved,
        assets: RUNTIME_ASSETS,
      });
      const frame = document.createElement('iframe');
      frame.className = 'docs-exported-page';
      frame.setAttribute('allow', 'fullscreen');
      frame.style.cssText =
        `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:0;` +
        'z-index:100000;background:#000;';
      frame.srcdoc = new TextDecoder().decode(file.bytes);
      document.body.append(frame);
    },
    { width, height },
  );
  const deck = page.frameLocator('iframe.docs-exported-page').locator('.mfe-deck');
  await kit.waitFor(deck.locator('.mfe-bar'));
  await page.waitForFunction(() => {
    const frame = document.querySelector('iframe.docs-exported-page');
    return (frame?.contentWindow?.MFE?.decks?.length ?? 0) > 0;
  });
  return deck;
}

/** The exported page, standing at its first pause: Next plays to it, where the deck stops — 1.00
 * s, the end of slide 1. */
async function atFirstPause(page, kit) {
  await exportedPage(page, kit);
  await onDeck(page, 'deck.next();');
  await page.waitForFunction(
    () => {
      const deck = document.querySelector('iframe.docs-exported-page').contentWindow.MFE.decks[0];
      return !deck.playing && Math.abs(deck.time - 1) < 1e-6;
    },
    null,
    { timeout: 8000 },
  );
  await kit.settle();
}

/** Runs `fn(deck)` on the deck of the exported page's frame. */
function onDeck(page, fn, arg) {
  return page.evaluate(
    ({ source, arg }) => {
      const frame = document.querySelector('iframe.docs-exported-page');
      const deck = frame.contentWindow.MFE.decks[0];
      // eslint-disable-next-line no-new-func
      return new Function('deck', 'arg', source)(deck, arg);
    },
    { source: fn, arg },
  );
}

/** A part of the exported page's deck, for a ring. */
const inDeck = (selector) => (page) =>
  page.frameLocator('iframe.docs-exported-page').locator(`.mfe-deck ${selector}`).first();

export default {
  page: 'basics/slides',
  project: PROJECT,
  viewport: WIDE,
  items: [
    {
      // The ruler tinted by zone, with the two pauses and the comment of the example: the toggle
      // (1), the second pause, which keeps its wait (2), and the comment (3); the first pause,
      // violet, skips its wait.
      kind: 'shot',
      name: 'ruler',
      setup: fitted,
      target: timelineArea(6.6),
      highlight: [
        { target: 'timeline-slides', label: 1, markerAt: 'top-right' },
        { target: 'slide-mark-p_pause2', label: 2, markerAt: 'right', pad: 2 },
        { target: 'slide-mark-p_glow', label: 3, markerAt: 'right', pad: 2 },
      ],
    },
    {
      // A pause hovered: its words, at once, under the ruler.
      kind: 'shot',
      name: 'mark-tip',
      setup: fitted,
      steps: async (page, kit) => {
        await kit.hover('slide-mark-p_pause2', { pause: 300 });
        await kit.waitFor('slide-mark-tip');
      },
      cursor: true,
      target: tipArea,
    },
    {
      // A right click where the scene rests, between the first two animations.
      kind: 'shot',
      name: 'menu-rest',
      setup: fitted,
      steps: async (page, kit) => {
        await kit.contextMenu(await rulerAt(kit, 1.8));
      },
      cursor: true,
      target: menuArea,
    },
    {
      // A right click where the first relation runs: the two entries greyed out, and why.
      kind: 'shot',
      name: 'menu-busy',
      setup: fitted,
      steps: async (page, kit) => {
        await kit.contextMenu(await rulerAt(kit, 2.7));
      },
      cursor: true,
      target: menuArea,
    },
    {
      // Add comment here…: the dialog of several lines, words typed on two of them.
      kind: 'shot',
      name: 'comment-dialog',
      setup: fitted,
      steps: async (page, kit) => {
        await kit.contextMenu(await rulerAt(kit, 1.8));
        await kit.click('slide-menu-add-comment');
        await kit.waitFor('dialog-field');
        await kit.type('Flash the 3 in amber before it crosses');
        await kit.press('Enter');
        await kit.type('the equals sign.');
      },
      target: 'dialog',
      padding: 8,
    },
    {
      // A drag that covers a pause: the clip of step1 dragged half a second later, its write then
      // runs over the pause at 1.00 s, and the editor asks.
      kind: 'shot',
      name: 'guard',
      setup: fitted,
      steps: async (page, kit) => {
        const clip = await kit.box({ clip: 'step1' });
        const from = { x: clip.x + 40, y: clip.y + clip.height - 9 };
        const px = await kit.pxPerSecond();
        await kit.drag(from, { x: from.x + 0.5 * px, y: from.y }, { holdAfterPress: ['Shift'] });
        await kit.waitFor('dialog');
      },
      target: 'dialog',
      padding: 8,
    },
    {
      // The rehearsal: Stop at pauses on, Play stops at the pause at 1.00 s, and Play again jumps
      // over its wait to 2.20 s and goes on to the one at 3.20 s.
      kind: 'clip',
      name: 'rehearsal',
      setup: async (page, kit) => {
        await fitted(page, kit);
        await kit.click('transport-stop-at-pauses');
        await kit.settle();
      },
      target: 'panel-preview',
      keysAt: 'top-right',
      cursorStart: 'transport-play',
      act: async (page, kit) => {
        const playing = (mfe) => mfe.useUiStore.getState().playing;
        const stopped = (mfe) => !mfe.useUiStore.getState().playing;
        await kit.click('transport-play');
        await kit.until(playing, null, { timeout: 2000 });
        await kit.until(stopped, null, { timeout: 4000 });
        await kit.pause(600);
        await kit.click('transport-play');
        await kit.until(playing, null, { timeout: 2000 });
        await kit.until(stopped, null, { timeout: 5000 });
      },
    },
    {
      // A long scene: «Add a pause after every animation» from the ruler's menu gives four pauses
      // in one step.
      kind: 'clip',
      name: 'pauses-at-once',
      project: LONG,
      setup: async (page, kit) => {
        await fitted(page, kit);
        await kit.click('timeline-slides');
        await kit.settle();
      },
      target: async (page, kit) => {
        const bar = await kit.box('.tl-toolbar');
        const panel = await kit.box('panel-timeline');
        return { x: panel.x, y: bar.y, width: panel.width, height: panel.y + panel.height - bar.y };
      },
      keysAt: 'top-right',
      act: async (page, kit) => {
        await kit.contextMenu(await rulerAt(kit, 2));
        await kit.pause(300);
        await kit.click('slide-menu-add-pauses');
        await kit.pause(1200);
        await kit.press('ControlOrMeta+Z');
      },
    },
    {
      // «Skip the wait after it», ticked, in the menu of the first pause: the pause is violet,
      // its tag «‖▸», and a violet line with an arrow runs along the ruler to 2.20 s.
      kind: 'shot',
      name: 'skip-menu',
      setup: fitted,
      steps: async (page, kit) => {
        // Low on the tag, so that the pointer leaves its «‖▸» in sight.
        await kit.contextMenu(await kit.point('slide-mark-p_pause1', { position: { x: 6, y: 13 } }));
      },
      cursor: true,
      target: menuAreaOf('slide-mark-menu'),
    },
    {
      // The first pause hovered: its tip says how long a wait it skips and where the scene goes
      // on; beside it, the second pause keeps its wait.
      kind: 'shot',
      name: 'skip-ruler',
      setup: fitted,
      steps: async (page, kit) => {
        // Its tip shown as the pointer shows it, without the pointer, so that nothing hides its
        // «‖▸»: no arrow over it, and no focus ring round it.
        await kit.evaluate(() =>
          document
            .querySelector('[data-testid="slide-mark-p_pause1"]')
            .dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })),
        );
        await kit.waitFor('slide-mark-tip-skip');
      },
      target: tipArea,
    },
    {
      // The rehearsal from the first pause, Stop at pauses on: Play jumps over its wait — the
      // playhead and the time leap to 2.20 s — plays the first transformation and stops at the
      // second pause; a click on the first pause puts the playhead back, for the loop.
      kind: 'clip',
      name: 'skip-rehearsal',
      setup: [
        fitted,
        async (page, kit) => {
          await kit.click('transport-stop-at-pauses');
          await kit.seek(1);
          await kit.settle();
        },
      ],
      target: async (page, kit) => {
        const play = await kit.box('transport-play');
        const code = await kit.box('transport-timecode');
        const lane = await kit.box({ track: 'Track 1' });
        const left = (await kit.timeToX(0)) - 8;
        const right = Math.max(code.x + code.width, await kit.timeToX(6.6)) + 10;
        const top = play.y - 8;
        return { x: left, y: top, width: right - left, height: lane.y + lane.height + 6 - top };
      },
      keysAt: 'top-right',
      cursorStart: 'transport-play',
      act: async (page, kit) => {
        const playing = (mfe) => mfe.useUiStore.getState().playing;
        const stopped = (mfe) => !mfe.useUiStore.getState().playing;
        await kit.click('transport-play');
        await kit.until(playing, null, { timeout: 2000 });
        await kit.until(stopped, null, { timeout: 4000 });
        await kit.pause(700);
        await kit.click(await kit.point('slide-mark-p_pause1', { position: { x: 6, y: 13 } }));
        await kit.pause(300);
      },
    },
    {
      // Export ▸ HTML…: the form (1), what the page carries of the Slides mode (2), and the
      // buttons (3).
      kind: 'shot',
      name: 'export-dialog',
      setup: async (page, kit) => {
        await kit.clearSelection();
        await kit.choose('Export ▸ HTML…');
        await kit.waitFor('export-html-marks');
      },
      target: 'export-html',
      padding: 8,
      highlight: [
        { target: '.html-export [role="radiogroup"]', label: 1, markerAt: 'top-right', pad: 4 },
        { target: 'export-html-marks', label: 2, markerAt: 'right', pad: 4 },
        { target: { union: ['export-html-zip', 'export-html-folder'] }, label: 3, markerAt: 'top' },
      ],
    },
    {
      // The exported page at its first pause: the bar under the scene — previous, play and next
      // (1), the timeline with a notch at each pause (2), the slide and the time (3), and the
      // toggles: play through the pauses, the notes, full screen (4).
      kind: 'shot',
      name: 'page',
      setup: atFirstPause,
      target: { x: 0, y: 0, width: 880, height: 560 },
      highlight: [
        {
          target: { union: [inDeck('.mfe-previous'), inDeck('.mfe-next')] },
          label: 1,
          markerAt: 'top-left',
          pad: 1,
        },
        { target: inDeck('.mfe-timeline'), label: 2, markerAt: 'top', pad: 1 },
        {
          target: { union: [inDeck('.mfe-slide-count'), inDeck('.mfe-time')] },
          label: 3,
          markerAt: 'top',
          pad: 1,
        },
        {
          target: { union: [inDeck('.mfe-through'), inDeck('.mfe-fullscreen')] },
          label: 4,
          markerAt: 'top-right',
          pad: 1,
        },
      ],
    },
    {
      // The same page at its end, its notes open (S): the note of the second pause and the
      // comment of the last slide.
      kind: 'shot',
      name: 'page-notes',
      setup: async (page, kit) => {
        await exportedPage(page, kit);
        await onDeck(page, 'deck.seek(deck.duration);');
        await kit.click(inDeck('.mfe-notes-button'));
        await kit.waitFor(inDeck('.mfe-notes'));
        await kit.move({ x: 1000, y: 700 });
        await kit.settle();
      },
      target: { x: 0, y: 0, width: 880, height: 560 },
    },
    {
      // The bar of the exported page, just opened: the notch of the first pause, which skips its
      // wait, is violet, and the wait it jumps over, 1.00–2.20 s, is dashed on the timeline; the
      // second pause keeps its wait and its notch is amber.
      kind: 'shot',
      name: 'skip-bar',
      setup: (page, kit) => exportedPage(page, kit),
      target: inDeck('.mfe-bar'),
    },
  ],
};
