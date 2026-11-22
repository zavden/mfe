import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizePalette, PALETTE_ROLES } from '../palette';
import { DEFAULT_PALETTE_COLORS, newPaletteSource } from '../paletteEdit';
import { PaletteSample } from '../PaletteSample';
import { createPaletteStore, type PaletteState } from '../paletteStore';
import { PaletteLibraryDialog } from '../PaletteLibraryDialog';

const fixture = vi.hoisted(() => ({
  store: undefined as ReturnType<typeof createPaletteStore> | undefined,
  downloads: [] as { name: string; text: string }[],
}));

vi.mock('../../project/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/files')>()),
  downloadText: (name: string, text: string) => fixture.downloads.push({ name, text }),
}));

vi.mock('../paletteStore', async (importOriginal) => {
  const original = await importOriginal<typeof import('../paletteStore')>();
  return {
    ...original,
    usePaletteStore(selector?: (state: PaletteState) => unknown) {
      if (!fixture.store) throw new Error('Missing test palette store.');
      return selector ? fixture.store(selector) : fixture.store();
    },
  };
});

const source = (name = 'Original theme') =>
  normalizePalette({
    format: 'manim-palette',
    version: 1,
    name,
    colors: Object.fromEntries(PALETTE_ROLES.map((role) => [role, '#123456'])),
  }).palette;

function environment() {
  let raw: string | null = null;
  let writable = true;
  let nextId = 0;
  const deps = {
    storage: {
      readItem: () => ({ ok: true as const, value: raw }),
      setItem: (_key: string, value: string) => {
        if (!writable) return false;
        raw = value;
        return true;
      },
    },
    newId: () => `palette_${++nextId}`,
    withLock: async (run: () => Promise<void>) => run(),
  };
  return {
    deps,
    raw: () => raw,
    setRaw: (value: string) => {
      raw = value;
    },
    writable: (value: boolean) => {
      writable = value;
    },
  };
}

function delayedFile(name: string) {
  let resolve!: (value: string) => void;
  const result = new Promise<string>((done) => {
    resolve = done;
  });
  const file = new File(['pending theme'], `${name}.json`, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => result });
  return { file, resolve: () => resolve(JSON.stringify(source(name))) };
}

let env: ReturnType<typeof environment>;
beforeEach(() => {
  env = environment();
  fixture.store = createPaletteStore(env.deps);
  fixture.downloads = [];
});

describe('palette library selection and pending reads', () => {
  it('keeps the selected source visible when retry deduplicates its ID against another tab', async () => {
    const store = fixture.store!;
    env.writable(false);
    const localId = await store.getState().importPalette(source());
    await store.getState().activate(localId);
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    expect(screen.getByTestId(`palette-entry-${localId}`)).toHaveAttribute('aria-selected', 'true');
    env.writable(true);
    const otherTab = createPaletteStore(env.deps);
    const durableId = await otherTab.getState().importPalette(source());
    expect(durableId).not.toBe(localId);
    fireEvent.click(screen.getByTestId('palette-retry-save'));
    await waitFor(() => expect(store.getState().unsaved).toBe(false));
    expect(store.getState().library.activePaletteId).toBe(durableId);
    expect(screen.getByTestId(`palette-entry-${durableId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('palette-name')).toHaveValue('Original theme');
    expect(screen.getByTestId('palette-role-preview')).toBeVisible();
    expect(screen.getByTestId('palette-defaults')).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps a recolored palette selected when retry gives it the id another tab stored', async () => {
    const store = fixture.store!;
    env.writable(false);
    const localId = await store.getState().importPalette(source());
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    const recolor = async (role: string, color: string) => {
      const hex = screen.getByTestId(`palette-color-${role}-hex`);
      fireEvent.change(hex, { target: { value: color } });
      fireEvent.keyDown(hex, { key: 'Enter' });
      await waitFor(() =>
        expect(screen.getByTestId(`palette-color-${role}-hex`)).toHaveValue(color),
      );
    };
    await recolor('result', '#00FF7F');
    env.writable(true);
    const durableId = await createPaletteStore(env.deps).getState().importPalette(source());
    expect(durableId).not.toBe(localId);
    fireEvent.click(screen.getByTestId('palette-retry-save'));
    await waitFor(() => expect(store.getState().unsaved).toBe(false));
    // The import became the other tab's entry, and the color went with it.
    expect(store.getState().library.palettes.map((entry) => entry.id)).toEqual([durableId]);
    expect(screen.queryByTestId('palette-selection-missing')).toBeNull();
    expect(screen.getByTestId(`palette-entry-${durableId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('palette-color-result-hex')).toHaveValue('#00FF7F');
    // And it stays the selection through the next change.
    await recolor('text', '#ABCDEF');
    expect(screen.queryByTestId('palette-selection-missing')).toBeNull();
    expect(store.getState().library.palettes[0]!.source.colors).toMatchObject({
      result: '#00FF7F',
      text: '#ABCDEF',
    });
  });

  it('explains an externally removed selection instead of silently displaying Manim defaults', async () => {
    const store = fixture.store!;
    const id = await store.getState().importPalette(source());
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    const otherTab = createPaletteStore(env.deps);
    await otherTab.getState().remove(id);
    act(() => store.getState().refresh());
    expect(screen.getByTestId('palette-selection-missing')).toHaveTextContent('removed');
    expect(screen.queryByTestId('palette-activate-defaults')).toBeNull();
    fireEvent.click(screen.getByTestId('palette-defaults'));
    expect(screen.getByTestId('palette-activate-defaults')).toBeVisible();
  });

  it('opens on the palette imported just before, with what its import warned about', async () => {
    const store = fixture.store!;
    const active = await store.getState().importPalette(source('Active theme'));
    await store.getState().activate(active);
    const id = await store.getState().importPalette(source('From Chroma'));
    render(
      <PaletteLibraryDialog
        onClose={vi.fn()}
        imported={{
          id,
          sourceSignature: JSON.stringify(source('From Chroma')),
          warnings: ['A warning of the import.'],
        }}
      />,
    );
    expect(screen.getByTestId(`palette-entry-${id}`)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('palette-name')).toHaveValue('From Chroma');
    expect(screen.getByTestId('palette-activate')).toBeEnabled();
    expect(screen.getByTestId('palette-import-warnings')).toHaveTextContent(
      'A warning of the import.',
    );
  });

  it('offers Reset library for stored data that cannot be read, and saves again after it', async () => {
    env.setRaw('{"version":1,"palettes":[');
    fixture.store = createPaletteStore(env.deps);
    await fixture.store.getState().importPalette(source('Kept in the tab'));
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    const status = screen.getByTestId('palette-storage-status');
    expect(status).toHaveTextContent('Not saved to this browser.');
    expect(status).toHaveTextContent('cannot be read: its data is damaged');
    expect(screen.getByTestId('palette-retry-save')).toBeVisible();
    fireEvent.click(screen.getByTestId('palette-reset-library'));
    await waitFor(() => expect(screen.queryByTestId('palette-storage-status')).toBeNull());
    expect(JSON.parse(env.raw()!).palettes).toHaveLength(1);
    expect(screen.getByTestId('palette-name')).toHaveValue('Kept in the tab');
  });

  it('has no Reset library for the library of another version', () => {
    env.setRaw(JSON.stringify({ version: 2, palettes: [] }));
    fixture.store = createPaletteStore(env.deps);
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    expect(screen.getByTestId('palette-storage-status')).toHaveTextContent(
      'written by another version of the editor',
    );
    expect(screen.getByTestId('palette-retry-save')).toBeVisible();
    expect(screen.queryByTestId('palette-reset-library')).toBeNull();
  });

  it('shows the notice of a dropped change on a library that is saved', async () => {
    const store = fixture.store!;
    const id = await store.getState().importPalette(source('Removed elsewhere'));
    env.writable(false);
    await store.getState().activate(id);
    env.writable(true);
    await createPaletteStore(env.deps).getState().remove(id);
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('palette-retry-save'));
    await waitFor(() => expect(store.getState().unsaved).toBe(false));
    const status = screen.getByTestId('palette-storage-status');
    expect(status).toHaveTextContent('Activating a palette could not be kept');
    expect(status).not.toHaveTextContent('Not saved');
    expect(screen.queryByTestId('palette-retry-save')).toBeNull();
    expect(screen.getByTestId('palette-selection-missing')).toBeVisible();
  });

  it('opens the file picker from its Import button', () => {
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('palette-import'));
    expect(picker.mock.contexts).toEqual([screen.getByTestId('palette-import-input')]);
    picker.mockRestore();
  });

  it('imports a theme dropped on the dialog and selects it', async () => {
    const dropped = delayedFile('Dropped theme');
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    const data = { types: ['Files'], items: [{ kind: 'file', type: 'application/json' }] };
    expect(screen.queryByTestId('palette-drop')).toBeNull();
    fireEvent.dragEnter(screen.getByTestId('palette-defaults'), { dataTransfer: data });
    expect(screen.getByTestId('palette-drop')).toHaveTextContent('Drop the theme JSON');
    fireEvent.drop(screen.getByTestId('palette-drop'), {
      dataTransfer: { ...data, files: [dropped.file] },
    });
    expect(screen.queryByTestId('palette-drop')).toBeNull();
    await act(async () => dropped.resolve());
    await waitFor(() => expect(screen.getByTestId('palette-name')).toHaveValue('Dropped theme'));
    expect(fixture.store!.getState().library.palettes).toHaveLength(1);
  });

  it('does not import a file whose text resolves after its dialog was closed', async () => {
    const pending = delayedFile('Closed import');
    const { unmount } = render(<PaletteLibraryDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('palette-import-input'), {
      target: { files: [pending.file] },
    });
    unmount();
    await act(async () => pending.resolve());
    expect(fixture.store!.getState().library.palettes).toEqual([]);
    expect(env.raw()).toBeNull();
  });

  it('lets a newer file selection cancel an older unresolved read', async () => {
    const first = delayedFile('Old selection');
    const second = delayedFile('New selection');
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('palette-import-input'), {
      target: { files: [first.file] },
    });
    fireEvent.change(screen.getByTestId('palette-import-input'), {
      target: { files: [second.file] },
    });
    await act(async () => second.resolve());
    await waitFor(() => expect(screen.getByTestId('palette-name')).toHaveValue('New selection'));
    await act(async () => first.resolve());
    expect(fixture.store!.getState().library.palettes.map((entry) => entry.source.name)).toEqual([
      'New selection',
    ]);
    expect(screen.getByTestId('palette-name')).toHaveValue('New selection');
  });
});

describe('palettes made in the dialog', () => {
  it('New palette adds one of the editor’s own colors and shows it, without activating it', async () => {
    const store = fixture.store!;
    const imported = await store.getState().importPalette(source());
    await store.getState().activate(imported);
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('palette-new'));
    await waitFor(() => expect(screen.getByTestId('palette-name')).toHaveValue('New palette'));
    const [, made] = store.getState().library.palettes;
    expect(made!.source.colors).toEqual(DEFAULT_PALETTE_COLORS);
    expect(screen.getByTestId(`palette-entry-${made!.id}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(store.getState().library.activePaletteId).toBe(imported);
    expect(screen.getByTestId('palette-activate')).toBeEnabled();
    // It has no file it came from.
    expect(screen.getByTestId('palette-library')).not.toHaveTextContent('Source name');
    fireEvent.click(screen.getByTestId('palette-new'));
    await waitFor(() => expect(screen.getByTestId('palette-name')).toHaveValue('New palette (2)'));
  });

  it('Duplicate adds a copy of the selected palette and shows it', async () => {
    const store = fixture.store!;
    const original = await store.getState().importPalette(source('Lesson'));
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    expect(screen.getByTestId('palette-library')).toHaveTextContent('Source name: Lesson');
    fireEvent.click(screen.getByTestId('palette-duplicate'));
    await waitFor(() => expect(screen.getByTestId('palette-name')).toHaveValue('Lesson copy'));
    const [first, copy] = store.getState().library.palettes;
    expect(first).toEqual({ id: original, displayName: 'Lesson', source: source('Lesson') });
    expect(copy!.source).toEqual(source('Lesson copy'));
    expect(screen.getByTestId(`palette-entry-${copy!.id}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('exports a palette made here under the name it has here, an imported one as its file', async () => {
    const store = fixture.store!;
    const imported = await store.getState().importPalette(source('File name'));
    await store.getState().rename(imported, 'Shown name');
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('palette-export'));
    expect(fixture.downloads).toHaveLength(1);
    expect(fixture.downloads[0]!.name).toBe('Shown-name.manim-palette.json');
    expect(JSON.parse(fixture.downloads[0]!.text)).toEqual(source('File name'));
    fireEvent.click(screen.getByTestId('palette-duplicate'));
    await waitFor(() => expect(screen.getByTestId('palette-name')).toHaveValue('Shown name copy'));
    fireEvent.change(screen.getByTestId('palette-name'), { target: { value: 'Lesson 3' } });
    fireEvent.click(screen.getByTestId('palette-rename'));
    await waitFor(() => expect(store.getState().library.palettes[1]!.displayName).toBe('Lesson 3'));
    fireEvent.click(screen.getByTestId('palette-export'));
    expect(fixture.downloads[1]!.name).toBe('Lesson-3.manim-palette.json');
    expect(JSON.parse(fixture.downloads[1]!.text)).toEqual(source('Lesson 3'));
  });

  it('offers neither when the library is full, and says why', async () => {
    const store = fixture.store!;
    for (let n = 0; n < 23; n++) await store.getState().importPalette(source(String(n)));
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    expect(screen.queryByTestId('palette-full')).toBeNull();
    fireEvent.click(screen.getByTestId('palette-new'));
    await waitFor(() => expect(screen.getByTestId('palette-full')).toHaveTextContent('full'));
    expect(screen.getByTestId('palette-new')).toBeDisabled();
    expect(screen.getByTestId('palette-duplicate')).toBeDisabled();
    expect(screen.getByTestId('palette-library')).toHaveTextContent('24 / 24 palettes');
    fireEvent.click(screen.getByTestId('palette-delete'));
    await waitFor(() => expect(screen.getByTestId('palette-new')).toBeEnabled());
  });
});

describe('the colors of a palette, edited in the dialog', () => {
  it('shows a color field for each role, without the active palette’s role choices', async () => {
    const store = fixture.store!;
    const id = await store.getState().importPalette(source());
    await store.getState().activate(id);
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    const roles = screen.getByTestId('palette-role-preview');
    expect(roles).toHaveAccessibleName('Colours by role');
    for (const role of PALETTE_ROLES) {
      expect(screen.getByTestId(`palette-color-${role}`)).toHaveAccessibleName(`${role} colour`);
      expect(screen.getByTestId(`palette-color-${role}-hex`)).toHaveValue('#123456');
      expect(screen.queryByTestId(`palette-color-${role}-roles`)).toBeNull();
    }
    expect(roles).toHaveTextContent('New formulas');
    expect(roles).toHaveTextContent('New braces');
  });

  it('saves a typed color at once, for that role of that palette alone', async () => {
    const store = fixture.store!;
    const other = await store.getState().importPalette(source('Other'));
    const id = await store.getState().importPalette(source('Lesson'));
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId(`palette-entry-${id}`));
    expect(screen.getByTestId('palette-library')).toHaveTextContent('Source name: Lesson');
    const hex = screen.getByTestId('palette-color-variable-hex');
    fireEvent.change(hex, { target: { value: '0af' } });
    fireEvent.keyDown(hex, { key: 'Enter' });
    await waitFor(() =>
      expect(store.getState().library.palettes[1]!.source.colors.variable).toBe('#00AAFF'),
    );
    expect(hex).toHaveValue('#00AAFF');
    expect(store.getState().library.palettes[1]!.source.colors).toEqual({
      ...source().colors,
      variable: '#00AAFF',
    });
    expect(store.getState().library.palettes[0]).toEqual({
      id: other,
      displayName: 'Other',
      source: source('Other'),
    });
    // It is the editor's palette now: the line about its file is gone, the selection stays.
    expect(screen.getByTestId('palette-library')).not.toHaveTextContent('Source name');
    expect(screen.getByTestId(`palette-entry-${id}`)).toHaveAttribute('aria-selected', 'true');
    expect(JSON.parse(env.raw()!).palettes[1].source.colors.variable).toBe('#00AAFF');
  });

  it('saves the color the native picker closes on, and nothing for what is not a color', async () => {
    const store = fixture.store!;
    await store.getState().importPalette(source());
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('palette-color-background'), {
      target: { value: '#102030' },
    });
    await waitFor(() =>
      expect(store.getState().library.palettes[0]!.source.colors.background).toBe('#102030'),
    );
    expect(screen.getByTestId('palette-color-background-hex')).toHaveValue('#102030');
    const revision = store.getState().revision;
    const hex = screen.getByTestId('palette-color-text-hex');
    fireEvent.change(hex, { target: { value: 'navy' } });
    fireEvent.blur(hex);
    expect(hex).toHaveValue('#123456');
    expect(store.getState().revision).toBe(revision);
    expect(screen.queryByTestId('palette-library-error')).toBeNull();
  });

  it('says what follows the active palette, and only for that one', async () => {
    const store = fixture.store!;
    const active = await store.getState().importPalette(source('Active'));
    const idle = await store.getState().importPalette(source('Idle'));
    await store.getState().activate(active);
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    const dialog = screen.getByTestId('palette-library');
    expect(dialog).toHaveTextContent('This palette is active');
    fireEvent.click(screen.getByTestId(`palette-entry-${idle}`));
    expect(dialog).not.toHaveTextContent('This palette is active');
    expect(dialog).toHaveTextContent('saved at once');
  });
});

describe('the sample of a palette', () => {
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

  it('shows every role in its color on the background of the palette', () => {
    const colors = newPaletteSource('Sample').colors;
    render(<PaletteSample colors={colors} />);
    const sample = screen.getByTestId('palette-sample');
    expect(sample).toHaveAccessibleName('Sample of the palette on its background');
    expect(sample.style.background).toBe(rgb(colors.background));
    for (const role of PALETTE_ROLES.filter((item) => item !== 'background')) {
      const parts = [...sample.querySelectorAll<HTMLElement>(`[data-role="${role}"]`)];
      expect(parts.length, role).toBeGreaterThan(0);
      for (const part of parts) {
        const drawn = role === 'rectangle' || role === 'circle' ? 'borderColor' : 'color';
        expect(part.style[drawn], role).toBe(rgb(colors[role]));
      }
    }
    expect(sample).toHaveTextContent('f(x) = 2x + 1 = 7');
  });

  it('follows a color as it is edited', async () => {
    const store = fixture.store!;
    await store.getState().importPalette(source());
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    const part = () =>
      screen.getByTestId('palette-sample').querySelector<HTMLElement>('[data-role="result"]')!;
    expect(part().style.color).toBe(rgb('#123456'));
    const hex = screen.getByTestId('palette-color-result-hex');
    fireEvent.change(hex, { target: { value: '#00FF7F' } });
    fireEvent.keyDown(hex, { key: 'Enter' });
    await waitFor(() => expect(part().style.color).toBe(rgb('#00FF7F')));
  });
});

describe('the roles the user adds to a palette, in the dialog', () => {
  const type = (testId: string, value: string) =>
    fireEvent.change(screen.getByTestId(testId), { target: { value } });
  const roles = (id: string) =>
    fixture.store!.getState().library.palettes.find((entry) => entry.id === id)!.source.customRoles;

  it('adds a role with its name and color, saved at once, and lists it with the others', async () => {
    const store = fixture.store!;
    const id = await store.getState().importPalette(source('Lesson'));
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    expect(screen.getByTestId('palette-custom-roles')).toHaveAccessibleName('Your roles');
    expect(screen.getByTestId('palette-custom-add')).toBeDisabled();
    type('palette-custom-new-name', ' highlight ');
    type('palette-custom-new-color-hex', 'ffd400');
    fireEvent.blur(screen.getByTestId('palette-custom-new-color-hex'));
    fireEvent.click(screen.getByTestId('palette-custom-add'));
    await waitFor(() => expect(roles(id)).toEqual([{ name: 'highlight', color: '#FFD400' }]));
    expect(screen.getByTestId('palette-custom-name-0')).toHaveValue('highlight');
    expect(screen.getByTestId('palette-custom-color-0-hex')).toHaveValue('#FFD400');
    expect(screen.queryByTestId('palette-custom-color-0-roles')).toBeNull();
    expect(screen.getByTestId('palette-custom-new-name')).toHaveValue('');
    // The palette is the editor's from then on, and what the browser holds has the role.
    expect(store.getState().library.palettes[0]).toMatchObject({ authored: true });
    expect(env.raw()).toContain('"customRoles":[{"name":"highlight","color":"#FFD400"}]');
    // Enter in the name adds too.
    type('palette-custom-new-name', 'accent 2');
    fireEvent.keyDown(screen.getByTestId('palette-custom-new-name'), { key: 'Enter' });
    await waitFor(() => expect(roles(id)).toHaveLength(2));
    expect(screen.getByTestId('palette-custom-name-1')).toHaveValue('accent 2');
  });

  it('renames, recolors and deletes a role', async () => {
    const store = fixture.store!;
    const id = await store.getState().importPalette(source('Lesson'));
    await store.getState().changeCustomRole(id, { do: 'add', name: 'highlight', color: '#FFD400' });
    await store.getState().changeCustomRole(id, { do: 'add', name: 'glow', color: '#00B3FF' });
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    type('palette-custom-name-1', 'Accent 2');
    fireEvent.blur(screen.getByTestId('palette-custom-name-1'));
    await waitFor(() => expect(roles(id)![1]).toEqual({ name: 'Accent 2', color: '#00B3FF' }));
    type('palette-custom-color-0-hex', '#ff0000');
    fireEvent.blur(screen.getByTestId('palette-custom-color-0-hex'));
    await waitFor(() => expect(roles(id)![0]).toEqual({ name: 'highlight', color: '#FF0000' }));
    expect(screen.getByTestId('palette-custom-delete-0')).toHaveAccessibleName(
      'Delete the role highlight',
    );
    fireEvent.click(screen.getByTestId('palette-custom-delete-0'));
    await waitFor(() => expect(roles(id)).toEqual([{ name: 'Accent 2', color: '#00B3FF' }]));
    expect(screen.getByTestId('palette-custom-name-0')).toHaveValue('Accent 2');
    expect(screen.queryByTestId('palette-custom-name-1')).toBeNull();
  });

  it('says beside the field why a name cannot be had, and sends nothing', async () => {
    const store = fixture.store!;
    const id = await store.getState().importPalette(source('Lesson'));
    await store.getState().changeCustomRole(id, { do: 'add', name: 'highlight', color: '#FFD400' });
    await store.getState().changeCustomRole(id, { do: 'add', name: 'glow', color: '#00B3FF' });
    const revision = store.getState().revision;
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    type('palette-custom-new-name', 'Formula');
    expect(screen.getByTestId('palette-custom-new-error')).toHaveTextContent(
      'one of the roles every palette has',
    );
    expect(screen.getByTestId('palette-custom-add')).toBeDisabled();
    fireEvent.keyDown(screen.getByTestId('palette-custom-new-name'), { key: 'Enter' });
    type('palette-custom-new-name', 'GLOW');
    expect(screen.getByTestId('palette-custom-new-error')).toHaveTextContent(
      'already has a role named “GLOW”',
    );
    // A role is not renamed into another's name; its own name in another case is its own.
    type('palette-custom-name-0', 'glow');
    expect(screen.getByTestId('palette-custom-name-0-error')).toHaveTextContent(
      'already has a role named',
    );
    fireEvent.blur(screen.getByTestId('palette-custom-name-0'));
    expect(screen.getByTestId('palette-custom-name-0')).toHaveValue('highlight');
    expect(store.getState().revision).toBe(revision);
    type('palette-custom-name-0', 'HIGHLIGHT');
    expect(screen.queryByTestId('palette-custom-name-0-error')).toBeNull();
    fireEvent.blur(screen.getByTestId('palette-custom-name-0'));
    await waitFor(() => expect(roles(id)![0]!.name).toBe('HIGHLIGHT'));
  });

  it('exports the roles with the palette, and shows their colors on its card', async () => {
    const store = fixture.store!;
    const id = await store.getState().importPalette(source('Lesson'));
    await store.getState().changeCustomRole(id, { do: 'add', name: 'highlight', color: '#FFD400' });
    render(<PaletteLibraryDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('palette-export'));
    expect(JSON.parse(fixture.downloads[0]!.text)).toMatchObject({
      format: 'manim-palette',
      version: 1,
      name: 'Lesson',
      customRoles: [{ name: 'highlight', color: '#FFD400' }],
    });
    expect(
      screen.getByTestId(`palette-entry-${id}`).querySelectorAll('.palette-strip > *'),
    ).toHaveLength(PALETTE_ROLES.length + 1);
  });
});
