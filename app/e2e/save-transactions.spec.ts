import { expect, test, type Page } from './test';
import { projectFile, SAVE_AS_KEYS, type MfeWindow } from './helpers';

interface PrivateHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(text: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
  isSameEntry(other: PrivateHandle): Promise<boolean>;
}

interface SaveHarness {
  opened: number;
  committed: string[];
  paused: boolean;
  reading: boolean;
  pickerCalls: number;
  suggestedName: string | undefined;
  releaseWriter(): void;
  releaseRead(): void;
  releasePicker(): void;
  original: PrivateHandle;
  incoming: PrivateHandle;
  selected: PrivateHandle;
  initialCopy: string;
}

type SaveWindow = MfeWindow & {
  __saveTest: SaveHarness;
  showOpenFilePicker(): Promise<PrivateHandle[]>;
  showSaveFilePicker(options: { suggestedName?: string }): Promise<PrivateHandle>;
};

/** Native OPFS bytes/streams; only picker results and the selected asynchronous boundary wait. */
async function prepare(
  page: Page,
  options: { pause?: 'write' | 'close'; alias?: boolean; picker?: boolean; read?: boolean } = {},
) {
  await page.goto('/');
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await page.evaluate(
    async ({ originalText, incomingText, copyText, options }) => {
      const w = window as unknown as SaveWindow;
      const dir = await navigator.storage.getDirectory();
      const original = await dir.getFileHandle('original.mfe.json', { create: true });
      const incoming = await dir.getFileHandle('b.mfe.json', { create: true });
      const copy = await dir.getFileHandle('a-copy.mfe.json', { create: true });
      for (const [handle, text] of [
        [original, originalText],
        [incoming, incomingText],
        [copy, copyText],
      ] as const) {
        const stream = await handle.createWritable();
        await stream.write(text);
        await stream.close();
      }
      let releaseWriter!: () => void;
      let releaseRead!: () => void;
      let releasePicker!: () => void;
      const writerWait = new Promise<void>((resolve) => {
        releaseWriter = resolve;
      });
      const readWait = new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
      const pickerWait = new Promise<void>((resolve) => {
        releasePicker = resolve;
      });
      const nativeHandles = new WeakMap<PrivateHandle, FileSystemFileHandle>();
      function wrap(handle: FileSystemFileHandle, slowRead = false): PrivateHandle {
        const value: PrivateHandle = {
          name: handle.name,
          getFile: async () => {
            if (slowRead) {
              w.__saveTest.reading = true;
              await readWait;
            }
            return handle.getFile();
          },
          isSameEntry: (other) => handle.isSameEntry(nativeHandles.get(other)!),
          createWritable: async () => {
            const index = ++w.__saveTest.opened;
            const stream = await handle.createWritable();
            let name = '';
            const pause = async (stage: 'write' | 'close') => {
              if (index !== 1 || options.pause !== stage) return;
              w.__saveTest.paused = true;
              await writerWait;
            };
            return {
              write: async (text) => {
                await pause('write');
                name = JSON.parse(text).meta.name;
                await stream.write(text);
              },
              close: async () => {
                await pause('close');
                await stream.close();
                w.__saveTest.committed.push(name);
              },
              abort: () => stream.abort(),
            };
          },
        };
        nativeHandles.set(value, handle);
        return value;
      }
      w.__saveTest = {
        opened: 0,
        committed: [],
        paused: false,
        reading: false,
        pickerCalls: 0,
        suggestedName: undefined,
        releaseWriter,
        releaseRead,
        releasePicker,
        original: wrap(original),
        incoming: wrap(incoming, options.read),
        selected: wrap(options.alias ? await dir.getFileHandle(original.name) : copy),
        initialCopy: copyText,
      };
      let opens = 0;
      w.showOpenFilePicker = async () => [
        ++opens === 1 ? w.__saveTest.original : w.__saveTest.incoming,
      ];
      w.showSaveFilePicker = async (pickerOptions) => {
        w.__saveTest.pickerCalls++;
        w.__saveTest.suggestedName = pickerOptions.suggestedName;
        if (options.picker) await pickerWait;
        return w.__saveTest.selected;
      };
    },
    {
      originalText: projectFile('Project A', [], []),
      incomingText: projectFile('Project B', [], []),
      copyText: projectFile('Existing copy', [], []),
      options,
    },
  );
  await openFile(page);
  await expect(page.getByTestId('project-rename')).toHaveText('Project A');
  await expect(page.getByTestId('doc-file')).toHaveText('original.mfe.json');
}

async function openFile(page: Page) {
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Open…', exact: true }).click();
  await page.getByTestId('projects-other').click();
}

async function rename(page: Page, name: string) {
  await page.getByTestId('project-rename').click();
  await page.getByTestId('project-rename-input').fill(name);
  await page.getByTestId('project-rename-input').press('Enter');
}

async function bytes(page: Page, name: string) {
  return page.evaluate(async (name) => {
    const dir = await navigator.storage.getDirectory();
    return (await (await dir.getFileHandle(name)).getFile()).text();
  }, name);
}

async function documentState(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as SaveWindow;
    const doc = w.__mfe!.useDocumentStore.getState() as unknown as {
      session: number;
      documentId: string;
      baseline: { meta: { name: string } } | null;
      fileName: string | null;
      dirty: boolean;
      handle: unknown;
    };
    return {
      session: doc.session,
      documentId: doc.documentId,
      baseline: doc.baseline?.meta.name,
      fileName: doc.fileName,
      dirty: doc.dirty,
      originalHandle: doc.handle === w.__saveTest.original,
      incomingHandle: doc.handle === w.__saveTest.incoming,
      selectedHandle: doc.handle === w.__saveTest.selected,
    };
  });
}

for (const pause of ['write', 'close'] as const) {
  for (const alias of [false, true]) {
    test(`native saves keep the newest bytes after delayed ${pause} (alias: ${alias})`, async ({
      page,
    }) => {
      await prepare(page, { pause, alias });
      await rename(page, 'First save');
      await page.keyboard.press('ControlOrMeta+s');
      await page.waitForFunction(() => (window as unknown as SaveWindow).__saveTest.paused);
      await rename(page, 'Second save');
      await page.keyboard.press(alias ? SAVE_AS_KEYS : 'ControlOrMeta+s');
      // Give the second command a browser turn to attempt opening its writer.
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
      const openedWhileFirstPending = await page.evaluate(
        () => (window as unknown as SaveWindow).__saveTest.opened,
      );
      await page.evaluate(() => (window as unknown as SaveWindow).__saveTest.releaseWriter());
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as SaveWindow).__saveTest.committed.length),
        )
        .toBe(2);
      expect(openedWhileFirstPending).toBe(1);
      expect(
        await page.evaluate(() => (window as unknown as SaveWindow).__saveTest.committed),
      ).toEqual(['First save', 'Second save']);
      expect(JSON.parse(await bytes(page, 'original.mfe.json')).meta.name).toBe('Second save');
      await expect(page.getByTestId('doc-status')).toHaveText('Saved');
      expect(await documentState(page)).toMatchObject({ baseline: 'Second save', dirty: false });
    });
  }
}

for (const theme of ['dark', 'light'] as const) {
  test(`Save As writes a copy to the chosen file when a pending Open replaced the project (${theme})`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript((theme) => localStorage.setItem('mfe.theme', theme), theme);
    await prepare(page, { read: true, picker: true });
    await openFile(page);
    await page.waitForFunction(() => (window as unknown as SaveWindow).__saveTest.reading);
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'Save As…', exact: true }).click();
    await page.waitForFunction(
      () => (window as unknown as SaveWindow).__saveTest.pickerCalls === 1,
    );
    expect(
      await page.evaluate(() => (window as unknown as SaveWindow).__saveTest.suggestedName),
    ).toBe('project-a.mfe.json');
    // What a project file is: the project the command captured, serialized.
    const captured = await page.evaluate(
      () =>
        JSON.stringify((window as MfeWindow).__mfe!.useProjectStore.getState().project, null, 2) +
        '\n',
    );
    await page.evaluate(() => (window as unknown as SaveWindow).__saveTest.releaseRead());
    await expect(page.getByTestId('project-rename')).toHaveText('Project B');
    const replacement = await documentState(page);
    await page.evaluate(() => (window as unknown as SaveWindow).__saveTest.releasePicker());
    // The user chose a destination for Project A: it gets Project A, and a notice says so.
    const notice = page
      .getByTestId('notice')
      .filter({ hasText: 'Saved a copy as a-copy.mfe.json' });
    await expect(notice).toContainText(
      'a-copy.mfe.json holds “Project A”, not the project that is open now.',
    );
    // The real file, not a mocked saved-state flag: exactly the captured project.
    expect(JSON.parse(captured).meta.name).toBe('Project A');
    expect(await bytes(page, 'a-copy.mfe.json')).toBe(captured);
    expect(
      await page.evaluate(() => (window as unknown as SaveWindow).__saveTest.committed),
    ).toEqual(['Project A']);
    // Project B is as it was: its own file and handle, nothing unsaved.
    expect(await documentState(page)).toEqual(replacement);
    expect(replacement).toMatchObject({
      baseline: 'Project B',
      incomingHandle: true,
      fileName: 'b.mfe.json',
      dirty: false,
    });
    await expect(page.getByTestId('doc-status')).toHaveText('Saved');
    await page.screenshot({ path: testInfo.outputPath(`save-as-copy-${theme}.png`) });
  });
}

test('an edit during the picker saves the original snapshot and keeps the later edit unsaved', async ({
  page,
}) => {
  await prepare(page, { picker: true });
  const original = await documentState(page);
  await page.keyboard.press(SAVE_AS_KEYS);
  await page.waitForFunction(() => (window as unknown as SaveWindow).__saveTest.pickerCalls === 1);
  // This models an in-session asynchronous edit while the native picker owns the screen.
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      draft.meta.name = 'Later edit';
    }),
  );
  await page.evaluate(() => (window as unknown as SaveWindow).__saveTest.releasePicker());
  await expect
    .poll(() => page.evaluate(() => (window as unknown as SaveWindow).__saveTest.committed.length))
    .toBe(1);
  expect(JSON.parse(await bytes(page, 'a-copy.mfe.json')).meta.name).toBe('Project A');
  await expect(page.getByTestId('project-rename')).toHaveText('Later edit');
  await expect(page.getByTestId('doc-status')).toHaveText('Unsaved changes');
  expect(await documentState(page)).toMatchObject({
    session: original.session,
    documentId: original.documentId,
    baseline: 'Project A',
    selectedHandle: true,
    fileName: 'a-copy.mfe.json',
    dirty: true,
  });
});
