/* Captures of start/overview: the window of the editor on the example the page plays, with its
 * five areas numbered. */

/** The project in the app is the one of a file of that name, saved: what File ▸ Open leaves. */
function savedAs(fileName) {
  return async (page, kit) => {
    await kit.mfe((mfe, name) => {
      const project = mfe.useProjectStore.getState().project;
      mfe.useDocumentStore.getState().beginDocument(project, { fileName: name, handle: null });
    }, fileName);
    await kit.settle({ renders: false });
  };
}

/** The gap between the Creator and the Preview dragged 100 px to the right, as a reader would
 * widen the Creator: at its first width (20 % of the window) it cuts the names of the formulas. */
async function widenCreator(page, kit) {
  const gap = await kit.point({ css: '.separator-vertical >> nth=0' });
  await kit.drag(gap, { x: gap.x + 100, y: gap.y }, { duration: 1 });
  await kit.move({ x: 720, y: 884 }, { duration: 1 });
}

export default {
  page: 'start/overview',
  project: 'docs/web/examples/hero.mfe.json',
  items: [
    {
      // 5.9 s into the square of a sum: the third line is on screen, still, and its clip is
      // selected, so the Animations panel shows its relations.
      kind: 'shot',
      name: 'window',
      setup: [
        savedAs('hero.mfe.json'),
        widenCreator,
        async (page, kit) => {
          await kit.seek(5.9);
          await kit.selectClip('step3');
          await kit.click('timeline-fit');
        },
      ],
      // A number in the free part of each title bar (a point, so that the marker is all there is
      // of its ring): the menu bar, the Creator, the Preview, the Animations panel, the Timeline.
      highlight: [
        {
          target: { x: 800, y: 22, width: 0, height: 0 },
          label: 1,
          markerAt: 'top',
        },
        {
          target: { x: 190, y: 72, width: 0, height: 0 },
          label: 2,
          markerAt: 'top',
        },
        {
          target: { x: 600, y: 72, width: 0, height: 0 },
          label: 3,
          markerAt: 'top',
        },
        {
          target: { x: 1320, y: 72, width: 0, height: 0 },
          label: 4,
          markerAt: 'top',
        },
        {
          target: { x: 700, y: 662, width: 0, height: 0 },
          label: 5,
          markerAt: 'top',
        },
      ],
    },
  ],
};
