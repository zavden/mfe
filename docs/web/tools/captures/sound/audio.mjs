/* Captures of sound/audio: a recording imported into the Creator's Audio tab, placed on an audio
 * track of the timeline, trimmed, split, given a volume line, and exported as sound.
 *
 * The recording is `examples/audio-narration.mp3`: eleven seconds of a synthetic hum shaped in
 * three phrases (0.6–3.3 s, 4.1–6.9 s and 7.6–10.6 s, with pauses between them), made for this
 * page so that every figure and the reader's own try-it use the same sound. Each item opens the
 * example `hero` (a scene of 11.2 s) and does by itself what the page teaches; the tall window
 * gives the timeline room for the visual tracks and two audio rows.
 *
 * The three clips are short on purpose (a gesture each, under 6 s): the pointer starts where the
 * act starts. The trim puts the app back by itself; the other two end on their result and start
 * again from the plain clip (no undo on screen: it would take seconds the gesture does not need). */
import { fileURLToPath } from 'node:url';

const NARRATION = fileURLToPath(new URL('../../../examples/audio-narration.mp3', import.meta.url));
const TALL = { width: 1440, height: 1100 };
/** The width of the column of track headers (app/src/ui/timeline/layout.ts). */
const HEADER = 188;

// ---- the app ----

const assetId = (kit) =>
  kit.mfe((mfe) => mfe.useProjectStore.getState().project.audioAssets[0]?.id ?? null);

const audioClipIds = (kit) =>
  kit.mfe((mfe) => mfe.useProjectStore.getState().project.audioClips.map((clip) => clip.id));

const firstClip = async (kit) => (await audioClipIds(kit))[0];

/** The Audio tab of the Creator. */
async function openAudioTab(page) {
  await page.getByTestId('creator-tab-audio').click();
  await page.getByTestId('creator-audio').waitFor();
}

/** Imports the sample recording as the Audio tab's own button does: through its file input. */
async function importNarration(page, kit) {
  await openAudioTab(page);
  await page.getByTestId('audio-file-input').setInputFiles(NARRATION);
  await page.waitForFunction(
    () => window.__mfe.useProjectStore.getState().project.audioAssets.length >= 1,
    null,
    { timeout: 30_000 },
  );
  const id = await assetId(kit);
  await page.waitForFunction(
    (id) => {
      const button = document.querySelector(`[data-testid="audio-add-${id}"]`);
      return Boolean(button) && !button.disabled;
    },
    id,
    { timeout: 30_000 },
  );
  await kit.settle({ renders: false });
}

/** Waits until the waveforms the timeline shows are drawn. */
async function waveformsReady(page) {
  await page.waitForFunction(
    () => {
      const graphs = document.querySelectorAll('.tl-audio-graph');
      return (
        graphs.length > 0 &&
        [...graphs].every((graph) => graph.querySelector('.tl-audio-waveform path'))
      );
    },
    null,
    { timeout: 30_000 },
  );
}

/** Presses Add to timeline: the clip goes to the playhead, on an audio row. */
async function addToTimeline(page, kit) {
  const before = (await audioClipIds(kit)).length;
  await kit.click(`audio-add-${await assetId(kit)}`);
  await page.waitForFunction(
    (before) => window.__mfe.useProjectStore.getState().project.audioClips.length > before,
    before,
    { timeout: 10_000 },
  );
  await waveformsReady(page);
  await kit.settle({ renders: false });
}

const selectClips = (kit, ids) =>
  kit.mfe((mfe, ids) => mfe.useUiStore.getState().select({ kind: 'clips', ids }), ids);

/** The recording imported, placed once at 0 s, and its clip selected. */
async function placed(page, kit) {
  await importNarration(page, kit);
  await addToTimeline(page, kit);
  await selectClips(kit, [await firstClip(kit)]);
}

const zoomOut = async (kit, times = 2) => {
  for (let i = 0; i < times; i += 1) await kit.click('timeline-zoom-out');
};

// ---- areas of the timeline ----

/** The rows of the audio tracks, top to bottom: `[{ id, y, height }]`. */
async function audioRows(page, kit) {
  const ids = await kit.mfe((mfe) =>
    mfe.useProjectStore
      .getState()
      .project.tracks.filter((track) => track.kind === 'audio')
      .map((track) => track.id),
  );
  const rows = [];
  for (const id of ids) {
    const box = await kit.box(`track-row-${id}`);
    rows.push({ id, y: box.y, height: box.height });
  }
  return rows;
}

/** The timeline from its ruler down to the last row, `seconds` of it wide after the headers. */
async function timelineBand(page, kit, seconds) {
  const panel = await kit.box('panel-timeline');
  const ruler = await kit.box('timeline-ruler');
  const px = await kit.pxPerSecond();
  const last = (await audioRows(page, kit)).at(-1);
  const bottom = last.y + last.height;
  return {
    x: panel.x,
    y: ruler.y - 4,
    width: HEADER + seconds * px + 24,
    height: bottom - ruler.y + 8,
  };
}

/** The audio rows alone (headers and lanes), `seconds` of them wide. */
async function audioBand(page, kit, seconds, { from = 0, above = 4 } = {}) {
  const panel = await kit.box('panel-timeline');
  const rows = await audioRows(page, kit);
  const px = await kit.pxPerSecond();
  const top = rows[from].y;
  const bottom = rows.at(-1).y + rows.at(-1).height;
  return {
    x: panel.x,
    y: top - above,
    width: HEADER + seconds * px + 24,
    height: bottom - top + above + 4,
  };
}

/** The handle at the end of the first audio clip (its top-right corner). */
async function endHandle(kit) {
  const clip = await kit.box(`audio-clip-${await firstClip(kit)}`);
  return { x: clip.x + clip.width - 3, y: clip.y + 12 };
}

/** The middle of the ruler at `seconds`. */
async function rulerAt(kit, seconds) {
  const ruler = await kit.box('timeline-ruler');
  return { x: await kit.timeToX(seconds), y: ruler.y + ruler.height / 2 };
}

export default {
  page: 'sound/audio',
  project: 'docs/web/examples/hero.mfe.json',
  viewport: TALL,
  items: [
    {
      // The whole window with a recording imported, placed at 0 s and selected: the Creator's
      // Audio tab, the Animations panel's "Audio clip", and the audio row under the visual tracks.
      kind: 'shot',
      name: 'window',
      setup: async (page, kit) => {
        await placed(page, kit);
        await kit.seek(11.2);
      },
    },
    {
      // The four things that bring a recording into the scene.
      kind: 'tour',
      name: 'workflow',
      steps: [
        {
          caption:
            'The <b>Audio</b> tab of the Creator holds the project’s recordings. ' +
            '<span class="ui">Import audio…</span> opens a file picker; dropping audio files on ' +
            'the tab does the same.',
          act: openAudioTab,
          focus: ['panel-creator'],
        },
        {
          caption:
            'The recording comes in as a row: its name, its length and sample rate, how many ' +
            'times the timeline uses it, and the part of it to place (<b>From</b>, <b>To</b>).',
          act: importNarration,
          focus: [async (page, kit) => `audio-asset-${await assetId(kit)}`],
        },
        {
          caption:
            '<span class="ui">Add to timeline</span> puts that part at the playhead, on the first ' +
            'audio track that has room there. With none, the timeline adds a track. The new clip ' +
            'is selected.',
          act: addToTimeline,
          focus: [async (page, kit) => `track-row-${(await audioRows(page, kit))[0].id}`],
        },
        {
          caption:
            'A selected clip is shown in the <b>Animations</b> panel, which is titled <b>Audio</b> ' +
            'while only sounds are selected: its times, its part of the recording, and the ' +
            'buttons for its volume and for splitting it.',
          focus: ['panel-animations'],
        },
      ],
    },
    {
      // The empty tab: what it says, and where the import is.
      kind: 'shot',
      name: 'creator-empty',
      viewport: { width: 1440, height: 900 },
      setup: openAudioTab,
      target: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        return { x: panel.x, y: panel.y, width: panel.width, height: 340 };
      },
      highlight: [
        { target: 'audio-import', label: 1, markerAt: 'top-right' },
        { target: 'audio-search', label: 2, markerAt: 'top-right' },
      ],
    },
    {
      // One recording's row: its name (a field), delete, its details, the part to place.
      kind: 'shot',
      name: 'asset-row',
      viewport: { width: 1440, height: 900 },
      setup: importNarration,
      target: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        const row = await kit.box(`audio-asset-${await assetId(kit)}`);
        return { x: panel.x, y: panel.y, width: panel.width, height: row.y + row.height - panel.y + 10 };
      },
      highlight: [
        {
          target: async (page, kit) => `audio-name-${await assetId(kit)}`,
          label: 1,
          markerAt: 'top-left',
        },
        {
          target: async (page, kit) => `audio-delete-${await assetId(kit)}`,
          label: 2,
          markerAt: 'top-right',
        },
        {
          target: async (page, kit) => ({
            css: `[data-testid="audio-asset-${await assetId(kit)}"] .audio-asset-meta`,
          }),
          label: 3,
          markerAt: 'right',
        },
        {
          target: async (page, kit) => ({
            css: `[data-testid="audio-asset-${await assetId(kit)}"] .audio-source-range`,
          }),
          label: 4,
          markerAt: 'right',
        },
        {
          target: async (page, kit) => `audio-add-${await assetId(kit)}`,
          label: 5,
          markerAt: 'bottom-right',
        },
      ],
    },
    {
      // The anatomy of an audio clip: its name, Volume…, the button that turns the volume line
      // on, the handle of its start, and the waveform with the line over it.
      kind: 'shot',
      name: 'clip-anatomy',
      setup: placed,
      target: async (page, kit) => audioBand(page, kit, 6, { above: 30 }),
      highlight: [
        {
          target: async (page, kit) => ({
            css: `[data-testid="audio-clip-${await firstClip(kit)}"] .tl-audio-caption span`,
          }),
          label: 1,
          markerAt: 'top',
          pad: 2,
        },
        {
          target: async (page, kit) => `audio-edit-${await firstClip(kit)}`,
          label: 2,
          markerAt: 'top',
        },
        {
          target: async (page, kit) => `audio-line-${await firstClip(kit)}`,
          label: 3,
          markerAt: 'top',
        },
        {
          target: async (page, kit) => `audio-trim-start-${await firstClip(kit)}`,
          label: 4,
          markerAt: 'bottom-left',
          pad: 1,
        },
        {
          target: async (page, kit) => `audio-curve-${await firstClip(kit)}`,
          label: 5,
          markerAt: 'bottom-right',
        },
      ],
    },
    {
      // Trimming: the end edge dragged left cuts the last phrase off; dragged back, it brings it
      // again, as the recording itself is never cut.
      kind: 'clip',
      name: 'trim',
      keysAt: 'top-right',
      holdStart: 200,
      holdEnd: 400,
      setup: async (page, kit) => {
        await placed(page, kit);
        await zoomOut(kit, 2);
        await kit.seek(0);
      },
      target: async (page, kit) => timelineBand(page, kit, 11.4),
      cursorStart: async (page, kit) => endHandle(kit),
      act: async (page, kit) => {
        const handle = await endHandle(kit);
        const px = await kit.pxPerSecond();
        await kit.drag(handle, { x: handle.x - 3.6 * px, y: handle.y }, { duration: 1000 });
        await kit.pause(600);
        // Where the edge stopped (it snaps to the ruler's ticks): its handle is there.
        const edge = await endHandle(kit);
        await kit.drag(edge, handle, { duration: 900 });
        await kit.pause(200);
      },
    },
    {
      // Splitting: the playhead in the pause between two phrases, S, a click on the second part
      // to select it alone, and that part moved later. The clip ends there and starts again from
      // the whole clip: undoing it on screen would take two seconds more.
      kind: 'clip',
      name: 'split',
      keysAt: 'top-right',
      loop: false,
      holdStart: 200,
      holdEnd: 800,
      setup: async (page, kit) => {
        await placed(page, kit);
        await zoomOut(kit, 2);
        await kit.seek(0);
      },
      target: async (page, kit) => timelineBand(page, kit, 11.4),
      // The playhead goes into the pause that follows the first phrase (3.3–4.1 s).
      cursorStart: async (page, kit) => rulerAt(kit, 3.7),
      act: async (page, kit) => {
        const px = await kit.pxPerSecond();
        // The clip is selected already.
        await kit.click(await rulerAt(kit, 3.7), { after: 500 });
        await kit.press('s');
        await kit.pause(500);
        // Both parts are selected, and a drag would move both: a click on the second part
        // narrows the selection to it, and then it moves later alone, to make room for the
        // animation.
        const [, second] = await audioClipIds(kit);
        const from = await kit.point({
          css: `[data-testid="audio-clip-${second}"] .tl-audio-caption span`,
        });
        await kit.click(from, { after: 300 });
        await kit.drag(from, { x: from.x + 0.9 * px, y: from.y }, { duration: 900 });
      },
    },
    {
      // The volume line: the button on the clip turns it on (its scale appears), a double-click
      // adds a point where it stays as loud as it was, and the last point dragged down makes a
      // fade out by hand. The clip ends on the fade and starts again from the plain clip.
      kind: 'clip',
      name: 'volume-line',
      keysAt: 'top-right',
      loop: false,
      holdStart: 200,
      holdEnd: 800,
      setup: async (page, kit) => {
        await placed(page, kit);
        await zoomOut(kit, 1);
        await kit.seek(0);
      },
      target: async (page, kit) => audioBand(page, kit, 11.2),
      cursorStart: async (page, kit) => `audio-line-${await firstClip(kit)}`,
      act: async (page, kit) => {
        const id = await firstClip(kit);
        await kit.click(`audio-line-${id}`, { after: 400 });
        const graph = await kit.box(`audio-curve-${id}`);
        const middle = graph.y + graph.height / 2;
        await kit.doubleClick({ x: await kit.timeToX(8.6), y: middle }, { after: 300 });
        await kit.doubleClick({ x: await kit.timeToX(10.6), y: middle }, { after: 300 });
        const last = await kit.point('[data-testid^="audio-point-"] >> nth=1');
        await kit.drag(last, { x: last.x, y: last.y + graph.height * 0.46 }, { duration: 700 });
      },
    },
    {
      // The numeric editor: source bounds, constant volume, the fades, and the points of the line
      // after Fade In and Fade Out.
      kind: 'shot',
      name: 'volume-dialog',
      viewport: { width: 1440, height: 900 },
      setup: async (page, kit) => {
        await placed(page, kit);
        await kit.click(`audio-edit-${await firstClip(kit)}`);
        await page.getByTestId('audio-editor').waitFor();
        await page.getByTestId('audio-fade-duration').fill('1');
        await page.getByTestId('audio-fade-in').click();
        await page.getByTestId('audio-fade-out').click();
        await kit.settle({ renders: false });
      },
      target: 'audio-editor',
      padding: 10,
    },
    {
      // Two audio tracks: one row each for sounds that overlap, with the track's own buttons.
      kind: 'shot',
      name: 'audio-tracks',
      viewport: { width: 1440, height: 1400 },
      setup: async (page, kit) => {
        await placed(page, kit);
        await addToTimeline(page, kit);
        const rows = await audioRows(page, kit);
        await kit.click(`track-mute-${rows[1].id}`);
        await kit.settle({ renders: false });
      },
      target: async (page, kit) => audioBand(page, kit, 3.2),
      highlight: [
        {
          // The keys of the second track, under its name, from mute to delete.
          target: async (page, kit) => ({
            css: `[data-testid="track-header-${(await audioRows(page, kit))[1].id}"] .tl-header-buttons`,
          }),
          label: 1,
          markerAt: 'right',
          pad: -2,
        },
        {
          // The two small keys beside the name: a step lower, a step taller. The rings are drawn
          // close (negative pad) so that they do not cross each other nor the name.
          target: async (page, kit) => ({
            css: `[data-testid="track-header-${(await audioRows(page, kit))[1].id}"] .tl-header-keys`,
          }),
          label: 2,
          markerAt: 'top',
          pad: -2,
        },
      ],
    },
    {
      // The Animations panel with an audio clip selected.
      kind: 'shot',
      name: 'properties',
      setup: async (page, kit) => {
        await placed(page, kit);
        await kit.seek(3.7);
      },
      target: async (page, kit) => {
        const panel = await kit.box('panel-animations');
        return { x: panel.x, y: panel.y, width: panel.width, height: 290 };
      },
      highlight: [
        { target: 'audio-properties-split', label: 1, markerAt: 'top-right' },
        {
          target: async (page, kit) => `audio-properties-edit-${await firstClip(kit)}`,
          label: 2,
          markerAt: 'top-right',
        },
      ],
    },
    {
      // The clip's own menu.
      kind: 'shot',
      name: 'clip-menu',
      setup: async (page, kit) => {
        await placed(page, kit);
        await kit.seek(3.7);
        const id = await firstClip(kit);
        await kit.contextMenu(`audio-clip-${id}`);
      },
      target: 'audio-clip-menu',
      padding: 12,
    },
    {
      // Export ▸ Audio…
      kind: 'shot',
      name: 'export-dialog',
      viewport: { width: 1440, height: 900 },
      setup: async (page, kit) => {
        await placed(page, kit);
        await kit.choose('Export ▸ Audio…');
        await kit.waitFor('audio-export');
        await kit.settle({ renders: false });
      },
      target: 'audio-export',
      padding: 10,
    },
    {
      // A recording the browser no longer holds: its clip stays where it was, hatched, and
      // says so; the Creator's row says what brings it back.
      kind: 'shot',
      name: 'missing-media',
      setup: async (page, kit) => {
        await placed(page, kit);
        await kit.mfe((mfe) => {
          const current = mfe.useProjectStore.getState().project;
          const project = JSON.parse(JSON.stringify(current));
          // The same project, whose recording this browser's storage does not have.
          project.audioAssets[0].contentHash = 'b'.repeat(64);
          mfe.useDocumentStore.getState().beginDocument(project, { fileName: null, handle: null });
          mfe.loadProject(project);
        });
        await page.getByTestId('creator-tab-audio').click();
        await page.waitForSelector('.tl-audio-clip.is-missing', { timeout: 15_000 });
        await kit.settle({ renders: false });
      },
      target: async (page, kit) => audioBand(page, kit, 6),
      highlight: [
        {
          target: async (page, kit) => `audio-missing-${await firstClip(kit)}`,
          label: 1,
          markerAt: 'bottom',
        },
      ],
    },
  ],
};
