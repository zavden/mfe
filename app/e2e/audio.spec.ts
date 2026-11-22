/* Dedicated audio rows: real source import, nondestructive edits, shared timeline behavior,
 * portable originals and recovery. Playback/mixer codec fixtures also run in audio/ tests. */
import { expect, test, type Page } from './test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  addAudioInterval,
  audioClip,
  AUDIO_MP3_PATH,
  autosaveRecord,
  clearAudioHistory,
  dropAudio,
  editVolumeLine,
  importMp3,
  mediaOwners,
  openAudioPackage,
  pcmWave,
  saveAudioPackage,
  selectAudio,
  startAudioApp,
  storedOriginalBytes,
  writePackage,
} from './audioHelpers';
import {
  canUndo,
  desktopDrag,
  getProject,
  holdToConfirm,
  openWithProject,
  readExample,
  selectionOf,
  setTime,
  undo,
  type MfeWindow,
} from './helpers';
import { forceFallbackFilePaths, pinMathJax, waitForDrawables } from './creatorHelpers';
import { box, dragTo } from './timelineHelpers';

test('imports a real MP3 as a reusable original and places independent source intervals', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const original = readFileSync(AUDIO_MP3_PATH);
  expect(asset).toMatchObject({
    name: 'audio-pulses',
    originalName: 'audio-pulses.mp3',
    mimeType: 'audio/mpeg',
    byteLength: original.byteLength,
    contentHash: createHash('sha256').update(original).digest('hex'),
    sampleRate: 44100,
  });
  expect(asset.duration).toBeGreaterThan(3.9);
  expect(asset.duration).toBeLessThan(4.2);
  expect(asset.channels).toBeGreaterThanOrEqual(1);
  expect(await storedOriginalBytes(page, asset.contentHash)).toBe(original.byteLength);
  const first = await addAudioInterval(page, asset.id, 0.5, 3.5);
  const second = await addAudioInterval(page, asset.id, 1, 2);
  const project = await getProject(page);
  expect(first).toMatchObject({
    start: 0,
    end: 3,
    sourceStart: 0.5,
    assetId: asset.id,
    volume: [],
  });
  expect(second.assetId).toBe(first.assetId);
  expect(second.trackId).not.toBe(first.trackId); // simultaneous clips use distinct dedicated rows
  expect(project.audioAssets).toHaveLength(1);
  expect(project.clips).toEqual([]);
  expect(project.tracks.filter((track) => track.kind === 'audio')).toHaveLength(2);
  expect(project.tracks.filter((track) => track.kind === 'visual')).toHaveLength(2);
  await expect(page.getByTestId(`audio-asset-${asset.id}`)).toContainText('2 uses');
  await expect(page.getByTestId(`audio-clip-${first.id}`)).toBeVisible();
  await expect(page.getByTestId(`audio-clip-${second.id}`)).toBeVisible();
});

test('audio files dropped on the Audio tab are imported, in the order they arrive', async ({
  page,
}) => {
  await startAudioApp(page);
  const names = async () => (await getProject(page)).audioAssets.map((asset) => asset.name);
  const original = readFileSync(AUDIO_MP3_PATH);
  // A real drag from the desktop: while the file is over the tab an overlay says where it goes,
  // and the drop, which lands on that overlay, imports it.
  const tab = page.getByTestId('creator-audio');
  const drag = await desktopDrag(page, [AUDIO_MP3_PATH]);
  await drag.enter(tab);
  await expect(page.getByTestId('audio-drop')).toBeVisible();
  await drag.move(tab);
  await drag.drop(tab);
  await expect(page.getByTestId('audio-drop')).toHaveCount(0);
  await expect.poll(names).toEqual(['audio-pulses']);
  const asset = (await getProject(page)).audioAssets[0]!;
  expect(asset).toMatchObject({
    originalName: 'audio-pulses.mp3',
    mimeType: 'audio/mpeg',
    byteLength: original.byteLength,
    contentHash: createHash('sha256').update(original).digest('hex'),
  });
  expect(await storedOriginalBytes(page, asset.contentHash)).toBe(original.byteLength);
  await expect(page.getByTestId(`audio-add-${asset.id}`)).toBeEnabled();

  // Several files in one drag, and a drag dropped while those are still being read: every file
  // is imported, none twice, in the order given. Each one is its own undo step.
  await dropAudio(
    page,
    [
      { name: 'first.wav', type: 'audio/wav', bytes: pcmWave(0.25) },
      { name: 'second.wav', type: 'audio/wav', bytes: pcmWave(0.3) },
    ],
    [{ name: 'third.wav', type: 'audio/wav', bytes: pcmWave(0.35) }],
  );
  await expect.poll(names).toEqual(['audio-pulses', 'first', 'second', 'third']);
  await expect(page.getByTestId('audio-import')).toBeEnabled();
  await undo(page);
  expect(await names()).toEqual(['audio-pulses', 'first', 'second']);

  // What is not audio is refused by name, and the files after it still come in.
  await dropAudio(page, [
    { name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('not a recording') },
    { name: 'fourth.wav', type: 'audio/wav', bytes: pcmWave(0.4) },
  ]);
  await expect(page.locator('[data-testid="notice"][data-kind="error"]')).toContainText(
    'Could not import notes.txt',
  );
  await expect.poll(names).toEqual(['audio-pulses', 'first', 'second', 'fourth']);
});

test('a file the project already has is not imported twice: a notice names its recording', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  await page.getByTestId(`audio-name-${asset.id}`).fill('pulses');
  await page.getByTestId(`audio-name-${asset.id}`).press('Enter');
  await clearAudioHistory(page);
  const before = await getProject(page);
  await dropAudio(page, [
    { name: 'copy of pulses.mp3', type: 'audio/mpeg', bytes: readFileSync(AUDIO_MP3_PATH) },
  ]);
  const notice = page.locator('[data-testid="notice"][data-kind="info"]');
  await expect(notice).toContainText('copy of pulses.mp3 is already in this project');
  await expect(notice).toContainText('It is the recording “pulses”.');
  await expect(page.getByTestId('audio-import')).toBeEnabled();
  await expect(page.getByTestId('dialog')).toHaveCount(0);
  expect(await getProject(page)).toEqual(before);
  expect(await canUndo(page)).toBe(false);
  expect(await storedOriginalBytes(page, asset.contentHash)).toBe(asset.byteLength);
});

test('a recording that comes in under a name in use is given another name, or left out', async ({
  page,
}) => {
  await startAudioApp(page);
  const names = async () => (await getProject(page)).audioAssets.map((item) => item.name);
  const voice = (seconds: number) => ({
    name: 'voice.wav',
    type: 'audio/wav',
    bytes: pcmWave(seconds),
  });
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  await dropAudio(page, [voice(0.25)]);
  await expect.poll(names).toEqual(['voice']);

  // Another file called the same: the dialog proposes the first free name and takes only a
  // free one.
  await dropAudio(page, [voice(0.3)]);
  const dialog = page.getByTestId('dialog');
  await expect(dialog).toContainText('already has a recording named “voice”');
  await expect(dialog).toContainText('voice.wav');
  const field = page.getByTestId('dialog-field');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('voice 2');
  expect(await names()).toEqual(['voice']); // nothing comes in before the answer
  await page.keyboard.type('voice'); // the proposal is selected: typing replaces it
  await expect(field).toHaveValue('voice');
  await expect(page.getByTestId('dialog-field-error')).toHaveText(
    'Another recording has this name.',
  );
  await expect(page.getByTestId('dialog-confirm')).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await field.fill('narration');
  await page.getByTestId('dialog-confirm').click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(names).toEqual(['voice', 'narration']);
  const second = (await getProject(page)).audioAssets[1]!;
  expect(second).toMatchObject({ originalName: 'voice.wav', contentHash: hash(pcmWave(0.3)) });
  await undo(page); // the import and its name are one step
  expect(await names()).toEqual(['voice']);

  // Declined: the file stays out and nothing of it is kept. The files after it go on.
  await dropAudio(page, [voice(0.35), { ...voice(0.4), name: 'other.wav' }]);
  await expect(field).toHaveValue('voice 2');
  await page.getByTestId('dialog-cancel').click();
  await expect.poll(names).toEqual(['voice', 'other']);
  await expect(page.getByTestId('audio-import')).toBeEnabled();
  expect(await storedOriginalBytes(page, hash(pcmWave(0.35)))).toBeNull();

  // The file picker asks the same, and Enter takes the proposal.
  await page.getByTestId('audio-file-input').setInputFiles({
    name: 'voice.wav',
    mimeType: 'audio/wav',
    buffer: pcmWave(0.45),
  });
  await expect(field).toHaveValue('voice 2');
  await page.keyboard.press('Enter');
  await expect.poll(names).toEqual(['voice', 'other', 'voice 2']);
  // Escape declines too.
  await dropAudio(page, [voice(0.5)]);
  await expect(field).toHaveValue('voice 3');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('audio-import')).toBeEnabled();
  expect(await names()).toEqual(['voice', 'other', 'voice 2']);
});

test('reimport restores one missing original while another stays missing, and recovery goes on', async ({
  page,
}) => {
  await startAudioApp(page);
  const original = readFileSync(AUDIO_MP3_PATH);
  const restored = {
    id: 'repair_mp3',
    name: 'Restored recording',
    originalName: 'audio-pulses.mp3',
    mimeType: 'audio/mpeg',
    byteLength: original.byteLength,
    contentHash: createHash('sha256').update(original).digest('hex'),
    duration: 4,
    sampleRate: 44100,
    channels: 2,
  };
  const missing = {
    id: 'repair_missing',
    name: 'Missing unused recording',
    originalName: 'missing.wav',
    mimeType: 'audio/wav',
    byteLength: 44 + 48000 * 4,
    contentHash: 'b'.repeat(64),
    duration: 1,
    sampleRate: 48000,
    channels: 2,
  };
  await page.evaluate(
    (audioAssets) => {
      const mfe = (window as MfeWindow).__mfe!;
      const current = mfe.useProjectStore.getState().project;
      const project = {
        ...current,
        meta: { ...current.meta, name: 'Repair recordings' },
        audioAssets,
        audioClips: [],
      };
      const document = mfe.useDocumentStore.getState() as unknown as {
        beginDocument(project: unknown, info: { fileName: null; handle: null }): void;
      };
      document.beginDocument(project, { fileName: null, handle: null });
      mfe.loadProject(project);
    },
    [restored, missing],
  );
  const restoredRow = page.getByTestId(`audio-asset-${restored.id}`);
  const missingRow = page.getByTestId(`audio-asset-${missing.id}`);
  await expect(page.getByTestId(`audio-add-${restored.id}`)).toBeDisabled();
  await expect(page.getByTestId(`audio-add-${missing.id}`)).toBeDisabled();
  await expect(restoredRow).toContainText('Original unavailable');
  await expect(missingRow).toContainText('Original unavailable');
  expect(await storedOriginalBytes(page, restored.contentHash)).toBeNull();
  expect(await storedOriginalBytes(page, missing.contentHash)).toBeNull();
  // The autosave goes on with what there is: its record names both recordings, and its owner
  // holds neither.
  const lacking = await autosaveRecord(page, missing.contentHash);
  const recoveryHashes = async () =>
    (await mediaOwners(page)).find((owner) => owner.id === lacking.mediaOwner)?.hashes;
  expect(await recoveryHashes()).toEqual([]);

  await page.getByTestId('audio-file-input').setInputFiles(AUDIO_MP3_PATH);
  await expect
    .poll(() => storedOriginalBytes(page, restored.contentHash))
    .toBe(original.byteLength);
  await expect(page.getByTestId(`audio-add-${restored.id}`)).toBeEnabled();
  await expect(page.getByTestId('audio-import')).toBeEnabled();
  await expect(restoredRow).not.toContainText('Original unavailable');
  await expect(missingRow).toContainText('Original unavailable');
  await expect(page.getByTestId(`audio-add-${missing.id}`)).toBeDisabled();
  await expect(page.getByTestId('notice-host')).not.toContainText(
    'Could not import audio-pulses.mp3',
  );

  const clip = await addAudioInterval(page, restored.id, 0.5, 1.5);
  expect(clip).toMatchObject({ assetId: restored.id, sourceStart: 0.5, start: 0, end: 1 });
  const repaired = await getProject(page);
  expect(repaired.audioAssets).toEqual([restored, missing]);
  expect(repaired.audioClips).toHaveLength(1);
  expect(await storedOriginalBytes(page, missing.contentHash)).toBeNull();
  await expect(page.getByTestId('notice-host')).not.toContainText(
    'Could not import audio-pulses.mp3',
  );
  // The recording that came back is the record's too, so a recovery will have it.
  expect((await autosaveRecord(page, clip.id)).mediaOwner).toBe(lacking.mediaOwner);
  await expect.poll(recoveryHashes).toEqual([restored.contentHash]);
  await expect(page.getByTestId('notice-host')).not.toContainText('recovery could not be saved');
});

test('a recording is renamed by clearing its name and typing another, as one undo step', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id);
  await clearAudioHistory(page);
  const name = page.getByTestId(`audio-name-${asset.id}`);
  const stored = async () => (await getProject(page)).audioAssets[0]!.name;
  // The field can be emptied while it is retyped: the old name does not come back under the keys.
  await name.fill('');
  await expect(name).toHaveValue('');
  await name.pressSequentially('Narration');
  await expect(name).toHaveValue('Narration');
  expect(await stored()).toBe('audio-pulses');
  await name.press('Enter');
  expect(await stored()).toBe('Narration');
  await expect(page.getByTestId(`audio-clip-${clip.id}`)).toContainText('Narration');
  await undo(page);
  expect(await stored()).toBe('audio-pulses');
  expect(await canUndo(page)).toBe(false);

  // A recording keeps a name: an empty one is said to be missing, and leaving the field puts
  // the name back. Escape takes an edit back too.
  await name.fill('   ');
  await expect(page.getByTestId(`audio-name-${asset.id}-error`)).toHaveText(
    'A recording needs a name.',
  );
  await name.blur();
  await expect(name).toHaveValue('audio-pulses');
  await name.fill('Something else');
  await name.press('Escape');
  await expect(name).toHaveValue('audio-pulses');
  // Spaces around the name are not part of it: the field shows the name, and nothing changed.
  await name.fill('  audio-pulses ');
  await name.press('Enter');
  await expect(name).toHaveValue('audio-pulses');
  await name.blur();
  expect(await stored()).toBe('audio-pulses');
  expect(await canUndo(page)).toBe(false);
});

test('trims and restores source points, then makes one undo step for a volume point drag', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id);
  await page.getByTestId(`audio-edit-${clip.id}`).click();
  await expect(page.getByTestId('audio-editor')).toBeVisible();
  await page.getByTestId('audio-fade-duration').fill('1');
  await page.getByTestId('audio-fade-in').click();
  const curve = (await audioClip(page, clip.id)).volume;
  expect(curve.map(({ time, gain }) => ({ time, gain }))).toEqual([
    { time: 0.5, gain: 0 },
    { time: 1.5, gain: 1 },
  ]);
  await page.getByTestId('audio-source-start').fill('1.25');
  expect(await audioClip(page, clip.id)).toMatchObject({
    start: 0.75,
    end: 3,
    sourceStart: 1.25,
    volume: curve,
  });
  await page.getByTestId('audio-source-end').fill('3');
  expect((await audioClip(page, clip.id)).end).toBeCloseTo(2.5, 5);
  await page.getByTestId('audio-source-start').fill('0.5');
  await page.getByTestId('audio-source-end').fill('3.5');
  expect(await audioClip(page, clip.id)).toMatchObject({
    start: 0,
    end: 3,
    sourceStart: 0.5,
    volume: curve,
  });
  await page.getByTestId('audio-editor-done').click();

  await editVolumeLine(page, clip.id);
  const graph = page.getByTestId(`audio-curve-${clip.id}`);
  const graphBox = await box(graph);
  await graph.dblclick({ position: { x: graphBox.width / 2, y: 48 } });
  const added = (await audioClip(page, clip.id)).volume.find(
    (point) => !curve.some((old) => old.id === point.id),
  )!;
  expect(added.gain).toBe(1);
  const beforeDrag = (await audioClip(page, clip.id)).volume;
  await clearAudioHistory(page);
  const pointBox = await box(page.getByTestId(`audio-point-${added.id}`));
  const from = { x: pointBox.x + pointBox.width / 2, y: pointBox.y + pointBox.height / 2 };
  await dragTo(page, from, { x: from.x + 8, y: from.y - 12 });
  await expect
    .poll(
      async () =>
        (await audioClip(page, clip.id)).volume.find((point) => point.id === added.id)!.gain,
    )
    .toBeGreaterThan(1.5);
  await undo(page);
  expect((await audioClip(page, clip.id)).volume).toEqual(beforeDrag);
  expect(await canUndo(page)).toBe(false);
  await page.getByTestId(`audio-point-${added.id}`).focus();
  await page.keyboard.press('ArrowDown');
  expect(
    (await audioClip(page, clip.id)).volume.find((point) => point.id === added.id)!.gain,
  ).toBeCloseTo(0.99);
});

test('splits through a fade, duplicates independently and respects mute and track locks', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const original = await addAudioInterval(page, asset.id);
  await page.getByTestId(`audio-edit-${original.id}`).click();
  await page.getByTestId('audio-fade-duration').fill('2');
  await page.getByTestId('audio-fade-in').click();
  await page.getByTestId('audio-editor-done').click();
  const originalCurve = (await audioClip(page, original.id)).volume;
  await setTime(page, 1);
  await selectAudio(page, original.id);
  await page.keyboard.press('s');
  await expect.poll(async () => (await getProject(page)).audioClips.length).toBe(2);
  // With an audio clip selected the key is the split's alone: the preview's selector, which S
  // switches otherwise, stays as it was.
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-selector', 'pointer');
  const [left, right] = (await getProject(page)).audioClips;
  expect(left).toMatchObject({
    id: original.id,
    start: 0,
    end: 1,
    sourceStart: 0.5,
    volume: originalCurve,
  });
  expect(right).toMatchObject({ start: 1, end: 3, sourceStart: 1.5, assetId: asset.id });
  expect(right!.volume.map(({ time, gain }) => ({ time, gain }))).toEqual(
    originalCurve.map(({ time, gain }) => ({ time, gain })),
  );
  expect(right!.volume[0]!.id).not.toBe(left!.volume[0]!.id);

  await selectAudio(page, right!.id);
  await page.keyboard.press('ControlOrMeta+d');
  await expect.poll(async () => (await getProject(page)).audioClips.length).toBe(3);
  const copy = (await getProject(page)).audioClips.at(-1)!;
  expect(copy).toMatchObject({ start: 3, end: 5, sourceStart: 1.5, assetId: asset.id });
  await page.getByTestId(`audio-edit-${copy.id}`).click();
  await page.getByTestId('audio-constant-gain').fill('50');
  expect((await audioClip(page, copy.id)).volume).toMatchObject([{ gain: 0.5 }]);
  expect((await audioClip(page, right!.id)).volume).toEqual(right!.volume);
  await page.getByTestId('audio-editor-done').click();
  // Mute is drawn with the icon set, as the eye of a visual track: no letters.
  const mute = page.getByTestId(`track-mute-${copy.trackId}`);
  await expect(mute.locator('svg')).toBeVisible();
  await expect(mute).toHaveText('');
  const sounding = await mute.locator('svg').innerHTML();
  await mute.click();
  await expect(mute).toHaveText('');
  expect(await mute.locator('svg').innerHTML()).not.toBe(sounding);
  expect((await getProject(page)).tracks.find((track) => track.id === copy.trackId)).toMatchObject({
    kind: 'audio',
    muted: true,
    hidden: false,
  });
  await undo(page);
  await expect(page.getByTestId(`track-mute-${copy.trackId}`)).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByTestId(`track-lock-${copy.trackId}`).click();
  await page.getByTestId(`audio-edit-${copy.id}`).click();
  await expect(page.getByTestId('audio-source-start')).toBeDisabled();
  await expect(page.getByTestId('audio-fade-in')).toBeDisabled();
  await page.getByTestId('audio-editor-done').click();
  await selectAudio(page, copy.id);
  await page.keyboard.press('Delete');
  expect((await getProject(page)).audioClips).toHaveLength(3);

  // The lock keeps the clips from being edited; the track itself goes like a locked visual one,
  // after the same question, and Undo brings it back as it was.
  await page.getByTestId(`track-delete-${copy.trackId}`).click();
  await expect(page.getByTestId('dialog')).toContainText('3 audio clips on the timeline.');
  await holdToConfirm(page);
  const after = await getProject(page);
  expect(after.tracks.some((track) => track.id === copy.trackId)).toBe(false);
  expect(after.audioClips).toEqual([]);
  expect(after.audioAssets).toHaveLength(1);
  await undo(page);
  const restored = await getProject(page);
  expect(restored.tracks.find((track) => track.id === copy.trackId)).toMatchObject({
    kind: 'audio',
    locked: true,
  });
  expect(restored.audioClips).toHaveLength(3);
});

test('a pending track deletion cannot remove a same-ID audio row from a replacement document', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id);
  await page.getByTestId(`track-delete-${clip.trackId}`).click();
  await expect(page.getByTestId('dialog')).toContainText('Delete track?');
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const current = mfe.useProjectStore.getState().project;
    const replacement = JSON.parse(JSON.stringify(current)) as typeof current;
    replacement.meta.name = 'Replacement document';
    const document = mfe.useDocumentStore.getState() as unknown as {
      beginDocument(project: unknown, info: { fileName: null; handle: null }): void;
    };
    document.beginDocument(replacement, { fileName: null, handle: null });
    mfe.loadProject(replacement);
  });
  await holdToConfirm(page);
  const replacement = await getProject(page);
  expect(replacement.meta.name).toBe('Replacement document');
  expect(replacement.audioClips.map((item) => item.id)).toEqual([clip.id]);
  expect(replacement.tracks.some((track) => track.id === clip.trackId)).toBe(true);
});

test('an audio clip moves from anywhere on it until its volume line is turned on', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id, 0.5, 3.5, 1);
  await page.getByTestId(`audio-edit-${clip.id}`).click();
  await page.getByTestId('audio-fade-duration').fill('1');
  await page.getByTestId('audio-fade-in').click();
  await page.getByTestId('audio-editor-done').click();
  const curve = (await audioClip(page, clip.id)).volume;
  await clearAudioHistory(page);
  const graph = page.getByTestId(`audio-curve-${clip.id}`);
  const toggle = page.getByTestId(`audio-line-${clip.id}`);
  const line = page.getByTestId(`audio-volume-line-${clip.id}`);
  const handles = page.getByTestId(`audio-clip-${clip.id}`).getByRole('slider');
  const scale = page.getByTestId(`audio-volume-scale-${clip.id}`);
  const start = async () => (await audioClip(page, clip.id)).start;
  /** Drag from a place of the graph, by its fractions, 80 px to the right (a second). */
  const dragGraph = async (fx: number, fy: number) => {
    const frame = await box(graph);
    const from = { x: frame.x + frame.width * fx, y: frame.y + frame.height * fy };
    await dragTo(page, from, { x: from.x + 80, y: from.y + 4 });
  };

  // The line is a drawing at first: no handle on it, no scale beside it.
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(line).toHaveCount(0);
  await expect(handles).toHaveCount(0);
  await expect(scale).toHaveCount(0);
  await expect(graph.locator('polyline.tl-audio-envelope')).toHaveCount(1);
  await expect(graph.locator('circle')).toHaveCount(curve.length);
  // Pressed at mid-height, where the 100% line runs, and on a point of the fade: the clip
  // moves, selected, and its volume stays.
  await dragGraph(0.6, 0.5);
  expect(await start()).toBeCloseTo(2, 6);
  expect((await audioClip(page, clip.id)).volume).toEqual(curve);
  expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: [clip.id] });
  await undo(page);
  expect(await start()).toBe(1);
  const point = await box(graph.locator('circle').last());
  await dragTo(
    page,
    { x: point.x + point.width / 2, y: point.y + point.height / 2 },
    { x: point.x + point.width / 2 + 80, y: point.y + point.height / 2 + 4 },
  );
  expect(await start()).toBeCloseTo(2, 6);
  expect((await audioClip(page, clip.id)).volume).toEqual(curve);
  await undo(page);
  // A double-click there opens the clip's editor, as on its name, and adds no point.
  await graph.dblclick({ position: { x: 150, y: 20 } });
  await expect(page.getByTestId('audio-editor')).toBeVisible();
  await page.getByTestId('audio-editor-done').click();
  expect((await audioClip(page, clip.id)).volume).toEqual(curve);
  expect(await canUndo(page)).toBe(false);

  // Turned on: the line and its points are handles again, the scale shows, and a press on the
  // graph that misses them moves nothing. The name still moves the clip.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(line).toHaveCount(1);
  await expect(handles).toHaveCount(curve.length);
  await expect(scale).toBeVisible();
  await dragGraph(0.6, 0.12);
  expect(await start()).toBe(1);
  expect(await canUndo(page)).toBe(false);
  // On the line, which runs at mid-height (100%) after the fade: 15 px down are 50% less.
  const frame = await box(graph);
  const onLine = { x: frame.x + frame.width * 0.8, y: frame.y + frame.height / 2 };
  await dragTo(page, onLine, { x: onLine.x, y: onLine.y + 15 });
  expect(await start()).toBe(1);
  expect((await audioClip(page, clip.id)).volume.at(-1)!.gain).toBeCloseTo(0.5, 6);
  await undo(page);
  await graph.dblclick({ position: { x: 150, y: 20 } });
  await expect(page.getByTestId('audio-editor')).toHaveCount(0);
  expect((await audioClip(page, clip.id)).volume).toHaveLength(curve.length + 1);
  await undo(page);
  const name = await box(
    page.getByTestId(`audio-clip-${clip.id}`).locator('.tl-audio-caption span'),
  );
  await dragTo(
    page,
    { x: name.x + 10, y: name.y + name.height / 2 },
    { x: name.x + 90, y: name.y + name.height / 2 },
  );
  expect(await start()).toBeCloseTo(2, 6);
  await undo(page);

  // Turned off again, the whole clip moves it again. Another clip was never turned on.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(line).toHaveCount(0);
  await dragGraph(0.6, 0.5);
  expect(await start()).toBeCloseTo(2, 6);
  expect((await audioClip(page, clip.id)).volume).toEqual(curve);
  await toggle.click();
  const other = await addAudioInterval(page, asset.id, 0.5, 1.5, 6);
  await expect(page.getByTestId(`audio-line-${other.id}`)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId(`audio-volume-line-${other.id}`)).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('drags the constant volume line and cancels line or point gestures with Escape', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id);
  await clearAudioHistory(page);
  await editVolumeLine(page, clip.id);
  const line = page.getByTestId(`audio-volume-line-${clip.id}`);
  const lineBox = await box(line);
  const from = { x: lineBox.x + lineBox.width * 0.6, y: lineBox.y };
  // 100% sits at mid-height. Below it, half the graph goes down to silence: 15 px are 50%.
  await dragTo(page, from, { x: from.x, y: from.y + 15 });
  expect((await audioClip(page, clip.id)).volume).toHaveLength(1);
  expect((await audioClip(page, clip.id)).volume[0]!.gain).toBeCloseTo(0.5, 6);
  await undo(page);
  expect((await audioClip(page, clip.id)).volume).toEqual([]);
  // Above it, the other half goes up to 400%: 10 px are another 100%.
  await dragTo(page, from, { x: from.x, y: from.y - 10 });
  expect((await audioClip(page, clip.id)).volume[0]!.gain).toBeCloseTo(2, 6);
  await undo(page);
  expect((await audioClip(page, clip.id)).volume).toEqual([]);
  expect(await canUndo(page)).toBe(false);

  await dragTo(page, from, { x: from.x, y: from.y - 10 }, { release: false });
  expect((await audioClip(page, clip.id)).volume[0]!.gain).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await audioClip(page, clip.id)).volume).toEqual([]);
  expect(await canUndo(page)).toBe(false);

  const graph = page.getByTestId(`audio-curve-${clip.id}`);
  const graphBox = await box(graph);
  await graph.dblclick({ position: { x: graphBox.width / 2, y: 48 } });
  const before = (await audioClip(page, clip.id)).volume;
  await clearAudioHistory(page);
  const pointBox = await box(page.getByTestId(`audio-point-${before[0]!.id}`));
  const point = { x: pointBox.x + pointBox.width / 2, y: pointBox.y + pointBox.height / 2 };
  await dragTo(page, point, { x: point.x + 12, y: point.y - 12 }, { release: false });
  expect((await audioClip(page, clip.id)).volume).not.toEqual(before);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await audioClip(page, clip.id)).volume).toEqual(before);
  expect(await canUndo(page)).toBe(false);
});

test('an arrow on a volume point during its drag steps from where the point was', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id);
  await editVolumeLine(page, clip.id);
  const graph = page.getByTestId(`audio-curve-${clip.id}`);
  const graphBox = await box(graph);
  await graph.dblclick({ position: { x: graphBox.width / 2, y: 48 } });
  const before = (await audioClip(page, clip.id)).volume;
  expect(before).toHaveLength(1);
  await clearAudioHistory(page);
  const pointBox = await box(page.getByTestId(`audio-point-${before[0]!.id}`));
  const point = { x: pointBox.x + pointBox.width / 2, y: pointBox.y + pointBox.height / 2 };
  // The point keeps the focus while it is dragged: the key comes with the button still down.
  await dragTo(page, point, { x: point.x, y: point.y - 12 }, { release: false });
  expect((await audioClip(page, clip.id)).volume[0]!.gain).toBeGreaterThan(before[0]!.gain + 0.5);
  await page.keyboard.press('ArrowUp');
  await page.mouse.up();
  // The drag is given up; the step is a hundredth above the volume the point had, not above the
  // one the drag showed.
  const after = (await audioClip(page, clip.id)).volume;
  expect(after).toHaveLength(1);
  expect(after[0]!.time).toBe(before[0]!.time);
  expect(after[0]!.gain).toBeCloseTo(before[0]!.gain + 0.01, 9);
  await undo(page);
  expect((await audioClip(page, clip.id)).volume).toEqual(before);
  expect(await canUndo(page)).toBe(false);
});

test('short default fades keep an audible midpoint and follow trims until a duration is typed', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id, 0.5, 0.7);
  const block = page.getByTestId(`audio-clip-${clip.id}`);
  for (const side of ['in', 'out']) {
    await block.focus();
    await page.keyboard.press('Shift+F10');
    await page.getByTestId(`audio-menu-fade-${side}`).click();
  }
  const curve = (await audioClip(page, clip.id)).volume;
  expect(curve[0]!.gain).toBe(0);
  expect(curve.at(-1)!.gain).toBe(0);
  expect(curve.find((point) => Math.abs(point.time - 0.6) < 1e-6)!.gain).toBeCloseTo(1, 10);

  await block.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('audio-fade-duration')).toHaveValue('0.1');
  await page.getByTestId('audio-reset-volume').click();
  await page.getByTestId('audio-source-end').fill('0.6');
  await expect(page.getByTestId('audio-fade-duration')).toHaveValue('0.05');
  await page.getByTestId('audio-fade-in').click();
  await page.getByTestId('audio-fade-out').click();
  const trimmed = (await audioClip(page, clip.id)).volume;
  expect(trimmed[0]!.gain).toBe(0);
  expect(trimmed.at(-1)!.gain).toBe(0);
  expect(trimmed.find((point) => Math.abs(point.time - 0.55) < 1e-6)!.gain).toBeCloseTo(1, 10);

  await page.getByTestId('audio-fade-duration').fill('0.08');
  await page.getByTestId('audio-source-end').fill('0.55');
  await expect(page.getByTestId('audio-fade-duration')).toHaveValue('0.08');
  await page.getByTestId('audio-reset-volume').click();
  await page.getByTestId('audio-fade-in').click();
  await page.getByTestId('audio-fade-out').click();
  // The explicit overlapping commands retain sequential replacement; only defaults changed.
  expect((await audioClip(page, clip.id)).volume.every((point) => point.gain === 0)).toBe(true);
});

test('adds interpolated volume points from the keyboard without changing the curve', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id);
  await page.getByTestId(`audio-clip-${clip.id}`).focus();
  await page.keyboard.press('Enter');
  const pointTime = page.getByTestId('audio-add-point-time');
  await pointTime.fill('1.25');
  await pointTime.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('audio-add-point')).toBeFocused();
  await page.keyboard.press('Enter');
  expect((await audioClip(page, clip.id)).volume).toMatchObject([{ time: 1.25, gain: 1 }]);

  await page.getByTestId('audio-reset-volume').click();
  await page.getByTestId('audio-fade-duration').fill('2');
  await page.getByTestId('audio-fade-in').click();
  const before = (await audioClip(page, clip.id)).volume;
  await clearAudioHistory(page);
  await pointTime.fill('1.5');
  await pointTime.press('Enter');
  const after = (await audioClip(page, clip.id)).volume;
  expect(after).toHaveLength(3);
  expect(after.find((point) => point.time === 1.5)?.gain).toBe(0.5);
  expect(after.filter((point) => before.some((old) => old.id === point.id))).toEqual(before);
  await undo(page);
  expect((await audioClip(page, clip.id)).volume).toEqual(before);
  expect(await canUndo(page)).toBe(false);
});

test('moves both bounding gains of an automated segment with one undo and Escape cancellation', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id);
  await page.getByTestId(`audio-edit-${clip.id}`).click();
  await page.getByTestId('audio-fade-duration').fill('1');
  await page.getByTestId('audio-fade-in').click();
  await page.getByTestId('audio-fade-out').click();
  await page.getByTestId('audio-editor-done').click();
  await editVolumeLine(page, clip.id);
  const before = (await audioClip(page, clip.id)).volume;
  const first = await box(page.getByTestId(`audio-point-${before[0]!.id}`));
  const second = await box(page.getByTestId(`audio-point-${before[1]!.id}`));
  const from = {
    x: (first.x + first.width / 2 + second.x + second.width / 2) / 2,
    y: (first.y + first.height / 2 + second.y + second.height / 2) / 2,
  };
  await clearAudioHistory(page);
  // Grabbed at 50%, where 9 px are 30% (the lower half of the graph is 0 to 100%).
  await dragTo(page, from, { x: from.x, y: from.y - 9 });
  const shifted = (await audioClip(page, clip.id)).volume;
  expect(shifted.map((point) => point.time)).toEqual(before.map((point) => point.time));
  expect(shifted[0]!.gain).toBeCloseTo(before[0]!.gain + 0.3, 6);
  expect(shifted[1]!.gain).toBeCloseTo(before[1]!.gain + 0.3, 6);
  expect(shifted.slice(2)).toEqual(before.slice(2));
  await undo(page);
  expect((await audioClip(page, clip.id)).volume).toEqual(before);
  expect(await canUndo(page)).toBe(false);
  await expect(page.getByTestId(`audio-point-${before[0]!.id}`)).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  await dragTo(page, from, { x: from.x, y: from.y - 10 }, { release: false });
  expect((await audioClip(page, clip.id)).volume[0]!.gain).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await audioClip(page, clip.id)).volume).toEqual(before);
  expect(await canUndo(page)).toBe(false);
});

test('requires an explicit source interval at the hour boundary and fits that timeline', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  await setTime(page, 3598);
  await page.getByTestId(`audio-add-${asset.id}`).click();
  await expect(page.getByTestId('notice-host')).toContainText('Audio does not fit here');
  expect((await getProject(page)).audioClips).toEqual([]);
  const clip = await addAudioInterval(page, asset.id, 1, 3, 3598);
  expect(clip).toMatchObject({ start: 3598, end: 3600, sourceStart: 1 });
  await page.getByTestId('timeline-fit').click();
  const zoom = await page.getByTestId('timeline-zoom').textContent();
  expect(Number.parseFloat(zoom!)).toBeLessThan(1);
  const scroll = await page
    .getByTestId('timeline-scroll')
    .evaluate((element) => ({ width: element.clientWidth, total: element.scrollWidth }));
  expect(scroll.total).toBeLessThan(scroll.width * 1.1);
  await expect(page.getByTestId(`audio-clip-${clip.id}`)).toBeVisible();
});

test('keyboard navigation reveals an audio clip outside the rendered time window', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const first = await addAudioInterval(page, asset.id, 0, 2);
  const later = await addAudioInterval(page, asset.id, 0, 2, 120);
  expect(later.trackId).toBe(first.trackId);
  await page.evaluate((id) => {
    (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: [id] });
    const scroll = document.querySelector('[data-testid="timeline-scroll"]')!;
    scroll.scrollLeft = 0;
  }, first.id);
  await page.getByTestId(`audio-clip-${first.id}`).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId(`audio-clip-${later.id}`)).toBeFocused();
  const clipBox = await box(page.getByTestId(`audio-clip-${later.id}`));
  const viewport = await box(page.getByTestId('timeline-scroll'));
  expect(clipBox.x).toBeGreaterThanOrEqual(viewport.x);
  expect(clipBox.x).toBeLessThan(viewport.x + viewport.width);
});

test('real MP3 playback advances, accepts a live mute, pauses and seeks without stale frames', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id, 0, 3.5);
  await page.getByTestId('transport-play').click();
  await expect
    .poll(async () =>
      page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().playing),
    )
    .toBe(true);
  await expect
    .poll(async () => page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().time))
    .toBeGreaterThan(0.05);
  await page.getByTestId(`track-mute-${clip.trackId}`).click();
  expect(
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().playing),
  ).toBe(true);
  await page.getByTestId('transport-play').click();
  await expect(page.getByTestId('transport-play')).toHaveAttribute('aria-label', 'Play');
  await page.getByTestId('transport-start').click();
  await expect(page.getByTestId('transport-seconds')).toHaveText('0.000 s');
  await page.waitForTimeout(100); // allow any already-queued RAF callback to arrive after the seek
  await expect(page.getByTestId('transport-seconds')).toHaveText('0.000 s');
  expect(
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().playing),
  ).toBe(false);
});

test('a scene longer than an hour plays with its audio, from wherever the playhead is', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  await addAudioInterval(page, asset.id, 0, 3.5);
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      draft.meta.duration = 4000;
    }),
  );
  const state = () =>
    page.evaluate(() => {
      const { time, playing } = (window as MfeWindow).__mfe!.useUiStore.getState();
      return { time, playing };
    });
  // In the first seconds, where the recording sounds; then past the hour, in silence.
  for (const from of [0, 3700]) {
    await setTime(page, from);
    await page.getByTestId('transport-play').click();
    await expect.poll(async () => (await state()).playing).toBe(true);
    await expect.poll(async () => (await state()).time).toBeGreaterThan(from + 0.05);
    await page.getByTestId('transport-play').click();
    await expect(page.getByTestId('transport-play')).toHaveAttribute('aria-label', 'Play');
  }
  await expect(page.getByTestId('notice-host')).not.toContainText('audio');
});

test('audio track ordering and a later source leave the scene of the generated Manim Python unchanged', async ({
  page,
}) => {
  await forceFallbackFilePaths(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openWithProject(page, readExample('hello.mfe.json'));
  await pinMathJax(page);
  await setTime(page, 1);
  await waitForDrawables(page);
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText('from manim import *');
  const before = await page.getByTestId('export-python-code').textContent();
  await page.getByTestId('export-python-close').click();
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id, 0.5, 3.5, 20);
  await page.getByTestId(`track-up-${clip.trackId}`).click();
  await page.getByTestId(`track-up-${clip.trackId}`).click();
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  // The scene is the same, line for line. The sound goes on after it, to 23 s: the header says
  // that the editor's own video, which lasts until the sound ends, is longer.
  const fps = (await getProject(page)).meta.fps as number;
  const claim = /^# exactly (\d+) frames, like the editor's video export\.$/m.exec(before!)!;
  await expect(page.getByTestId('export-python-code')).toHaveText(
    before!.replace(
      claim[0],
      `# exactly ${claim[1]} frames. The editor's video export is longer (${23 * fps} frames): ` +
        "it lasts\n# until the project's audio ends, and this scene has no audio.",
    ),
  );
  await expect(page.getByTestId('export-python-download')).toBeEnabled();
});

test('portable Save brings used and unused originals into a fresh browser context', async ({
  page,
  browser,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id);
  await page.getByTestId(`audio-edit-${clip.id}`).click();
  await page.getByTestId('audio-fade-out').click();
  await page.getByTestId('audio-editor-done').click();
  await page
    .getByTestId('audio-file-input')
    .setInputFiles({ name: 'unused-effect.wav', mimeType: 'audio/wav', buffer: pcmWave() });
  await expect.poll(async () => (await getProject(page)).audioAssets.length).toBe(2);
  const captured = await getProject(page);
  const file = await saveAudioPackage(page);
  await expect(page.getByTestId('doc-status')).toHaveText('Saved');
  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const other = await otherContext.newPage();
    await startAudioApp(other);
    expect(await storedOriginalBytes(other, asset.contentHash)).toBeNull();
    await openAudioPackage(other, file);
    await expect.poll(async () => (await getProject(other)).audioAssets.length).toBe(2);
    const reopened = await getProject(other);
    expect(reopened.audioAssets).toEqual(captured.audioAssets);
    expect(reopened.audioClips).toEqual(captured.audioClips);
    for (const original of reopened.audioAssets)
      expect(await storedOriginalBytes(other, original.contentHash)).toBe(original.byteLength);
    await other.getByTestId('creator-tab-audio').click();
    await expect(other.getByTestId(`audio-add-${asset.id}`)).toBeEnabled();
    await expect(other.getByTestId(`audio-clip-${clip.id}`)).toBeVisible();
  } finally {
    await otherContext.close();
  }
});

/** The app reads an original a block of this size at a time (`MEDIA_CHUNK_BYTES`, media/hash.ts). */
const BLOCK_BYTES = 1024 * 1024;

/** Hold the page's read of the second block of an original until `release`: the first block has
 * been read and reported by then, and nothing more is until the test lets go. `release` also
 * gives the page its own reader back. */
async function holdSecondBlock(page: Page) {
  type Held = Window & { __heldRead?: { waiting: boolean; release(): void } };
  await page.evaluate((blockBytes) => {
    const read = Blob.prototype.arrayBuffer;
    let blocks = 0;
    let letGo = () => {};
    const released = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    const held = {
      waiting: false,
      release() {
        Blob.prototype.arrayBuffer = read;
        letGo();
      },
    };
    (window as Held).__heldRead = held;
    Blob.prototype.arrayBuffer = async function (this: Blob) {
      if (this.size === blockBytes && (blocks += 1) === 2) {
        held.waiting = true;
        await released;
      }
      return read.call(this);
    };
  }, BLOCK_BYTES);
  return {
    waiting: () => page.evaluate(() => (window as Held).__heldRead!.waiting),
    release: () => page.evaluate(() => (window as Held).__heldRead!.release()),
  };
}

test('opening a large .mfe shows how far it is and can be cancelled', async ({
  page,
}, testInfo) => {
  // The second opening may take a minute where the disk is slow: the test waits for that long.
  test.setTimeout(120_000);
  await startAudioApp(page);
  // Only the bytes of a recording matter to the opening: they are hashed and copied into the
  // browser's storage. This machine hashes 96 MiB in under half a second, so the first opening
  // is stopped at its second block: the dialog is there for as long as the test looks at it,
  // whatever the speed of the machine, as it is for seconds with a file of a gigabyte.
  const payload = Buffer.alloc(96 * 1024 * 1024, 7);
  const asset = {
    id: 'large_recording',
    name: 'Large recording',
    originalName: 'large.wav',
    mimeType: 'audio/wav',
    byteLength: payload.byteLength,
    contentHash: createHash('sha256').update(payload).digest('hex'),
    duration: 1,
    sampleRate: 48000,
    channels: 2,
  };
  const before = await getProject(page);
  const path = testInfo.outputPath('large.mfe');
  writePackage(
    path,
    { ...before, meta: { ...before.meta, name: 'Large package' } },
    asset,
    payload,
  );
  const open = async () => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'Open…', exact: true }).click();
    await page.getByTestId('projects-other').click();
    await (await chooser).setFiles(path);
  };
  const dialog = page.getByTestId('progress-dialog');
  const read = await holdSecondBlock(page);

  await open();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Opening large.mfe');
  // One block of the 96 is in: the dialog says so, and stays there.
  await expect.poll(read.waiting).toBe(true);
  await expect(page.getByTestId('progress-amount')).toHaveText(/^1% · 1\.0 of 96\.0 MB$/);
  await page.getByTestId('progress-cancel').click();
  await read.release();
  await expect(dialog).toBeHidden();
  // Nothing was opened, nothing is reported, and what was copied is let go.
  expect((await getProject(page)).meta.name).toBe(before.meta.name);
  await expect(page.getByTestId('notice-host')).not.toContainText('large.mfe');
  await expect.poll(() => storedOriginalBytes(page, asset.contentHash)).toBeNull();

  // Opened again with the page's own reader, at the speed of the machine: the dialog may be
  // gone before it is looked at, and what is checked is what was opened and copied.
  await open();
  await expect
    .poll(async () => (await getProject(page)).meta.name, { timeout: 60_000 })
    .toBe('Large package');
  await expect(dialog).toBeHidden();
  expect(await storedOriginalBytes(page, asset.contentHash)).toBe(payload.byteLength);
  expect((await getProject(page)).audioAssets).toEqual([asset]);
});

test('recovery publishes a durable source manifest and restores unsaved clip edits', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id);
  await page.getByTestId(`audio-edit-${clip.id}`).click();
  await page.getByTestId('audio-fade-in').click();
  await page.getByTestId('audio-editor-done').click();
  const before = await getProject(page);
  await page.waitForFunction(
    ({ hash, id }) => {
      const saved = localStorage.getItem(`mfe.autosave.${sessionStorage.getItem('mfe.session')}`);
      if (!saved) return false;
      const record = JSON.parse(saved) as { v?: number; text?: string; mediaOwner?: string };
      if (record.v !== 4 || !record.mediaOwner || !record.text?.includes(hash)) return false;
      const project = JSON.parse(record.text) as {
        audioClips?: { id: string; volume: unknown[] }[];
      };
      return (
        project.audioClips?.some((clip) => clip.id === id && clip.volume.length === 2) === true
      );
    },
    { hash: asset.contentHash, id: clip.id },
  );
  const manifest = await page.evaluate(() =>
    localStorage.getItem(`mfe.autosave.${sessionStorage.getItem('mfe.session')}`)!,
  );
  expect(manifest).not.toContain('base64');
  expect(manifest.length).toBeLessThan(10000);
  await page.reload();
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await expect.poll(async () => (await getProject(page)).audioClips.length).toBe(1);
  expect((await getProject(page)).audioClips).toEqual(before.audioClips);
  expect((await getProject(page)).audioAssets).toEqual(before.audioAssets);
  expect(await storedOriginalBytes(page, asset.contentHash)).toBe(asset.byteLength);
  await expect(page.getByTestId('doc-status')).toHaveText('Recovered, not saved');
  await page.getByTestId('creator-tab-audio').click();
  await expect(page.getByTestId(`audio-add-${asset.id}`)).toBeEnabled();
});
