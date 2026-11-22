import { expect, test } from './test';
import {
  createAttach,
  createClip,
  createEmptyProject,
  createFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  serializeProject,
  type Project,
} from '../src/model';
import { openWithProject, type MfeWindow } from './helpers';

test('a chain longer than eight attachments follows its root without another edit', async ({
  page,
}) => {
  const project = createEmptyProject();
  const formula = createFormula({ name: 'label', source: 'x' });
  project.formulas.push(formula);
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  let previous = createClip(formula.id, project.tracks[0]!.id, 0, 6, none);
  project.clips.push(previous);
  for (let i = 0; i < 20; i++) {
    const track = createTrack(`Link ${i}`);
    project.tracks.push(track);
    const clip = createClip(formula.id, track.id, 0, 6, {
      ...none,
      attach: createAttach(previous.id, 'all', { side: 'right', buff: 0.2 }),
    });
    project.clips.push(clip);
    previous = clip;
  }
  await openWithProject(page, serializeProject(project));
  await page.waitForFunction(() => {
    const p = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as Project;
    return p.formulas[0]!.snapshot !== null;
  });
  const points = () =>
    page.evaluate(() => {
      const p = (window as MfeWindow).__mfe!.useProjectStore.getState()
        .project as unknown as Project;
      return p.clips.map((clip) => clip.initial.position);
    });
  const before = await points();
  await page.evaluate(() => {
    const store = (window as MfeWindow).__mfe!.useProjectStore;
    store.getState().update((draft) => {
      (draft as unknown as Project).clips[0]!.initial.position = [3, 2];
    });
  });
  await expect
    .poll(async () =>
      (await points()).map(([x, y], i) => [
        Math.round((x - before[i]![0]) * 1e6),
        Math.round((y - before[i]![1]) * 1e6),
      ]),
    )
    .toEqual(before.map(() => [3000000, 2000000]));
});
