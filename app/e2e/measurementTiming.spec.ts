import { expect, test, type Page } from './test';
import { createAttach, validateProject, type Project } from '../src/model';
import {
  appearJson,
  blockLocator,
  blockOf,
  disappearJson,
  dragBlock,
  emphasisJson,
  morphJson,
  openBlockScene,
  pickAnimation,
} from './blockHelpers';
import { getProject, setTime, type MfeWindow } from './helpers';
import { openRelationScene, plain, relations } from './relationsHelpers';
import { box, clipOf, timeToX, type ClipJson } from './timelineHelpers';

async function errors(page: Page) {
  return validateProject((await getProject(page)) as unknown as Project).filter(
    (issue) => issue.severity === 'error',
  );
}

async function field(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).fill(value);
  await page.getByTestId(testId).press('Enter');
}

function attached(id: string, formulaId: string, trackId: string, targetId: string) {
  return {
    ...plain(id, formulaId, trackId, 5, 9),
    attach: createAttach(targetId, [0]),
  };
}

/** A relation scene whose clips carry what they hang on. */
async function openAttachedScene(
  page: Page,
  clips: ClipJson[],
  extra: Record<string, unknown> = {},
) {
  await openRelationScene(page, clips, extra);
}

for (const theme of ['dark', 'light'] as const) {
  test(`an attached label stops block timing at its measurement instant (${theme})`, async ({
    page,
  }, testInfo) => {
    await openAttachedScene(page, [
      plain('a', 'fa', 't1', 0, 10, { actions: [disappearJson('fade', 6, 1, 'fade_out', [0])] }),
      attached('b', 'fb', 't2', 'a'),
    ]);
    if (theme === 'light') await page.getByTestId('theme-toggle').click();
    expect(await errors(page)).toEqual([]);
    await blockLocator(page, 'fade').click();
    await field(page, 'block-start', '4.5');
    expect(await blockOf(page, 'a', 'fade')).toMatchObject({ start: 5, duration: 1 });
    await blockLocator(page, 'fade').click();
    await page.keyboard.press('Alt+ArrowLeft');
    expect((await blockOf(page, 'a', 'fade')).start).toBe(5);
    await dragBlock(page, 'fade', -2, { shift: true });
    expect((await blockOf(page, 'a', 'fade')).start).toBe(5);
    expect(await errors(page)).toEqual([]);
    await setTime(page, 5);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.screenshot({ path: testInfo.outputPath(`attachment-boundary-${theme}.png`) });
  });

  test(`measuring effects keep their full duration across a later Morph (${theme})`, async ({
    page,
  }, testInfo) => {
    await openBlockScene(page, [
      emphasisJson('measure', 4, 1, 'circumscribe', [0]),
      morphJson('morph', 5, 1, [{ from: [0], to: [1], style: 'copy' }]),
    ]);
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        (draft as unknown as Project).clips.find((clip) => clip.id === 'b')!.initial.position = [
          0, -1.5,
        ];
      });
    });
    if (theme === 'light') await page.getByTestId('theme-toggle').click();
    await blockLocator(page, 'measure').click();
    await page.keyboard.press('Alt+ArrowRight');
    expect((await blockOf(page, 'a', 'measure')).start).toBeGreaterThan(4);
    await field(page, 'block-start', '4.5');
    await field(page, 'block-duration', '3');
    expect(await blockOf(page, 'a', 'measure')).toMatchObject({ start: 4.5, duration: 3 });
    await expect(page.getByTestId('block-issues')).toHaveCount(0);
    expect(await errors(page)).toEqual([]);
    await setTime(page, 5.2);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.screenshot({ path: testInfo.outputPath(`measuring-overlap-${theme}.png`) });

    // The actual Add animation menu also keeps the requested one-second block.
    await setTime(page, 4.5);
    const clip = await box(page.getByTestId('clip-a'));
    await page.mouse.click(await timeToX(page, 4.5), clip.y + clip.height * 0.85, {
      button: 'right',
    });
    await pickAnimation(page, 'flash');
    expect(
      (await clipOf(page, 'a')).actions.find((a) => a.id !== 'measure' && a.id !== 'morph'),
    ).toMatchObject({ kind: 'emphasis', start: 4.5, duration: 1 });
    expect(await errors(page)).toEqual([]);
  });
}

test('Appear duration and Add FadeOut preserve an attachment through the actual fields and menu', async ({
  page,
}) => {
  await openAttachedScene(page, [
    plain('a', 'fa', 't1', 0, 10, { actions: [appearJson('write', 2, 1, 'write', [0])] }),
    attached('b', 'fb', 't2', 'a'),
  ]);
  await blockLocator(page, 'write').click();
  await field(page, 'block-duration', '4');
  expect(await blockOf(page, 'a', 'write')).toMatchObject({ start: 2, duration: 3 });
  await setTime(page, 4.5);
  const clip = await box(page.getByTestId('clip-a'));
  await page.mouse.click(await timeToX(page, 4.5), clip.y + clip.height * 0.85, {
    button: 'right',
  });
  await pickAnimation(page, 'fade_out');
  const added = (await clipOf(page, 'a')).actions.find((a) => a.kind === 'disappear');
  expect(added).toMatchObject({ start: 5, duration: 1 });
  expect(await errors(page)).toEqual([]);
});

for (const side of ['a', 'b']) {
  test(`relation Offset respects the attachment on ${side === 'a' ? 'its source' : 'its target'}`, async ({
    page,
  }) => {
    await openAttachedScene(
      page,
      [
        plain('a', 'fa', 't1', 0, 10),
        plain('b', 'fb', 't2', 0, 10),
        attached('label', 'fa', 't3', side),
      ],
      {
        relations: [
          {
            id: 'r',
            fromClipId: 'a',
            toClipId: 'b',
            offset: 6,
            duration: 1,
            easing: 'smooth',
            style: 'transform',
            pathArc: 0,
            pairs: [{ from: [0], to: [0], style: null }],
          },
        ],
      },
    );
    await page.getByTestId('relation-window-r').click();
    await field(page, 'relation-offset', '4.5');
    expect((await relations(page))[0]).toMatchObject({ offset: 5, duration: 1 });
    expect(await errors(page)).toEqual([]);
  });
}
