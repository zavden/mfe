import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import { createClip, createEmptyProject, createFormula } from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { safeStorage } from '../../storage';
import { openFormulaEditor, useFormulaEditor } from '../../creator/formulaEditorStore';
import { confirmDialog, useDialogStore } from '../dialogStore';
import { useDocumentStore } from '../documentStore';
import { useNoticeStore } from '../noticeStore';

vi.mock('../../../engine/instance', async () => {
  const { createEngine } = await import('../../../engine/engine');
  const engine = createEngine({
    companion: {
      fetch: (() => Promise.reject(new TypeError('offline'))) as typeof fetch,
      watchFocus: false,
    },
  });
  return { getEngine: () => engine };
});

const project = () => useProjectStore.getState().project;
const addFormula = (name: string, latex = 'x') =>
  useProjectStore.getState().update((d) => {
    d.formulas.push({ ...createFormula({ name, source: latex }), id: `f_${name}` });
  });

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  loadProject(createEmptyProject());
  useUiStore.setState({ selection: { kind: 'none' }, time: 0, playing: false });
  useRenderStore.setState({ prefer: 'auto', entries: {}, resolved: new Map() });
  useDocumentStore.getState().markClean(project(), { fileName: null, handle: null });
  useNoticeStore.getState().clear();
  useDialogStore.setState({ queue: [] });
  for (const key of safeStorage.keys()) {
    if (key.startsWith('mfe.autosave') || key.startsWith('mfe.alive')) safeStorage.removeItem(key);
  }
  useFormulaEditor.getState().close();
});

/** Confirm the open dialog as holding its button down does (HoldButton has its own tests). */
const confirmHeldDialog = async () => {
  const dialog = useDialogStore.getState().queue[0]!;
  expect(dialog.buttons.find((b) => b.id === 'confirm')!.holdMs).toBeGreaterThan(0);
  await act(async () => useDialogStore.getState().settle(dialog.key, 'confirm'));
};

const openMenu = async (user: ReturnType<typeof userEvent.setup>, id: string) =>
  user.click(screen.getByTestId(`menu-${id}`));
const item = (menu: string, id: string) => screen.getByTestId(`menu-item-${menu}-${id}`);

describe('Edit menu and history', () => {
  it('enables Undo/Redo from the history and applies them', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openMenu(user, 'edit');
    expect(item('edit', 'undo')).toBeDisabled();
    expect(item('edit', 'redo')).toBeDisabled();
    await user.keyboard('{Escape}');

    act(() => addFormula('a'));
    await openMenu(user, 'edit');
    expect(item('edit', 'undo')).toBeEnabled();
    expect(item('edit', 'redo')).toBeDisabled();
    await user.click(item('edit', 'undo'));
    expect(project().formulas).toHaveLength(0);

    await openMenu(user, 'edit');
    expect(item('edit', 'redo')).toBeEnabled();
    await user.click(item('edit', 'redo'));
    expect(project().formulas).toHaveLength(1);
  });

  it('shows shortcut hints without putting them in the item names', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openMenu(user, 'edit');
    expect(screen.getByRole('menuitem', { name: 'Undo' })).toHaveTextContent('Ctrl+Z');
    expect(screen.getByRole('menuitem', { name: 'Redo' })).toHaveTextContent('Ctrl+Shift+Z');
  });
});

describe('keyboard shortcuts', () => {
  it('undo with Ctrl+Z, redo with Ctrl+Shift+Z and Ctrl+Y', () => {
    render(<App />);
    act(() => addFormula('a'));
    act(() => addFormula('b'));
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(project().formulas.map((f) => f.name)).toEqual(['a']);
    fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(project().formulas.map((f) => f.name)).toEqual(['a', 'b']);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(project().formulas.map((f) => f.name)).toEqual(['a', 'b']);
    // The page's own handling (browser undo) is suppressed for the commands we take.
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each(['input', 'textarea', 'select', 'math-field'])('ignores keys typed in a %s', (tag) => {
    render(<App />);
    act(() => addFormula('a'));
    const field = document.createElement(tag);
    document.body.appendChild(field);
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    field.dispatchEvent(event);
    expect(project().formulas).toHaveLength(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it('is quiet while a modal is open', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => addFormula('a'));
    await openMenu(user, 'file');
    await user.click(item('file', 'settings'));
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(project().formulas).toHaveLength(1);
  });

  it('undoes and redoes under the formula editor, but not under a dialog on top of it', async () => {
    render(<App />);
    act(() => addFormula('a'));
    act(() => openFormulaEditor('f_a'));
    expect(screen.getByTestId('formula-editor')).toBeInTheDocument();
    act(() =>
      useProjectStore.getState().update((d) => {
        d.formulas[0]!.hiddenGlyphs = [0];
      }),
    );
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(project().formulas[0]!.hiddenGlyphs).toEqual([]);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(project().formulas[0]!.hiddenGlyphs).toEqual([0]);
    // Other shortcuts stay quiet, and so does undo while a confirmation sits on top.
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(project().formulas).toHaveLength(1);
    act(() => void confirmDialog({ title: 'Sure?' }));
    expect(await screen.findByTestId('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(project().formulas[0]!.hiddenGlyphs).toEqual([0]);
  });

  it('Delete removes the selected formula after a confirmation; clips go through the timeline', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => addFormula('a'));
    act(() => addFormula('b'));
    act(() => useUiStore.getState().select({ kind: 'formula', id: 'f_a' }));
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(await screen.findByTestId('dialog')).toHaveTextContent(/Delete "a"/);
    expect(project().formulas).toHaveLength(2);
    await confirmHeldDialog();
    expect(project().formulas.map((f) => f.name)).toEqual(['b']);

    const clip = createClip('f_b', project().tracks[0]!.id, 0, 3);
    act(() => {
      useProjectStore.getState().update((d) => {
        d.clips.push(clip);
      });
      useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
    });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    // The timeline deletes the selected clip; the formula stays.
    expect(project().clips).toHaveLength(0);
    expect(project().formulas).toHaveLength(1);
    act(() => history.undo());
    expect(project().clips).toHaveLength(1);

    act(() => useUiStore.getState().select({ kind: 'formula', id: 'f_b' }));
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    await user.click(await screen.findByTestId('dialog-cancel'));
    expect(project().formulas).toHaveLength(1);
    fireEvent.keyDown(document.body, { key: 'Delete' });
    await screen.findByTestId('dialog');
    await confirmHeldDialog();
    expect(project().formulas).toHaveLength(0);
    expect(project().clips).toHaveLength(0);
  });
});

describe('document state', () => {
  it('shows the project name and a dirty marker, and sets the window title', async () => {
    render(<App />);
    const name = screen.getByTestId('project-name');
    expect(name).toHaveTextContent('Untitled');
    expect(name).toHaveAttribute('data-dirty', 'false');
    expect(document.title).toBe('Untitled — Manim Formula Editor');
    act(() => addFormula('a'));
    expect(name).toHaveAttribute('data-dirty', 'true');
    expect(document.title).toBe('• Untitled — Manim Formula Editor');
    act(() => history.undo());
    expect(name).toHaveAttribute('data-dirty', 'false');
  });

  it('File → New asks before discarding unsaved work', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => addFormula('a'));
    await openMenu(user, 'file');
    await user.click(item('file', 'new'));
    const dialog = await screen.findByTestId('dialog');
    expect(dialog).toHaveTextContent('Unsaved changes');
    await user.click(within(dialog).getByTestId('dialog-cancel'));
    expect(project().formulas).toHaveLength(1);

    await openMenu(user, 'file');
    await user.click(item('file', 'new'));
    await user.click(await screen.findByTestId('dialog-discard'));
    expect(project().formulas).toHaveLength(0);
    expect(screen.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
  });

  it('restores the autosaved project when the app starts again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const first = render(<App />);
      act(() => addFormula('kept', 'a+b'));
      act(() => {
        useProjectStore.getState().update((d) => {
          d.meta.name = 'Saved scene';
        });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      first.unmount();

      // A page reload: the stores start empty, the app restores from storage.
      loadProject(createEmptyProject());
      useDocumentStore.getState().markClean(project(), { fileName: null, handle: null });
      render(<App />);
      expect(project().meta.name).toBe('Saved scene');
      expect(project().formulas.map((f) => f.name)).toEqual(['kept']);
      expect(screen.getByTestId('project-name')).toHaveTextContent('Saved scene');
      expect(screen.getByTestId('project-name')).toHaveAttribute('data-dirty', 'true');
      expect(screen.getByTestId('formula-item')).toHaveAttribute('data-name', 'kept');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('View → glyph source', () => {
  it('switches the preference with a radio-style check mark', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openMenu(user, 'view');
    expect(item('view', 'prefer-auto')).toHaveAttribute('aria-checked', 'true');
    await user.click(item('view', 'prefer-mathjax'));
    expect(useRenderStore.getState().prefer).toBe('mathjax');
    await openMenu(user, 'view');
    expect(item('view', 'prefer-mathjax')).toHaveAttribute('aria-checked', 'true');
    expect(item('view', 'prefer-auto')).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Project settings', () => {
  async function openSettings(user: ReturnType<typeof userEvent.setup>) {
    await openMenu(user, 'file');
    await user.click(item('file', 'settings'));
    return screen.getByTestId('settings-dialog');
  }

  it('applies every change as one undo step', async () => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openSettings(user);
    await user.selectOptions(within(dialog).getByTestId('settings-target'), 'gl');
    await user.selectOptions(within(dialog).getByTestId('settings-resolution'), '1280x720');
    await user.selectOptions(within(dialog).getByTestId('settings-fps'), '30');
    fireEvent.change(within(dialog).getByTestId('settings-name'), {
      target: { value: 'Lecture 1' },
    });
    fireEvent.change(within(dialog).getByTestId('settings-preamble'), {
      target: { value: '\\newcommand{\\R}{\\mathbb{R}}' },
    });
    await user.click(within(dialog).getByTestId('settings-duration-fixed'));
    fireEvent.change(within(dialog).getByTestId('settings-duration'), {
      target: { value: '12.5' },
    });
    fireEvent.change(within(dialog).getByTestId('settings-background-hex'), {
      target: { value: '112233' },
    });
    fireEvent.blur(within(dialog).getByTestId('settings-background-hex'));
    // Nothing happens to the project until Apply.
    expect(project().meta.target).toBe('ce');
    await user.click(within(dialog).getByTestId('settings-apply'));

    expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument();
    expect(project().meta).toEqual({
      name: 'Lecture 1',
      target: 'gl',
      width: 1280,
      height: 720,
      fps: 30,
      background: '#112233',
      preamble: '\\newcommand{\\R}{\\mathbb{R}}',
      duration: 12.5,
    });
    act(() => history.undo());
    expect(project().meta.name).toBe('Untitled');
    expect(project().meta.target).toBe('ce');
    expect(project().meta.width).toBe(1920);
    expect(history.canUndo()).toBe(false);
  });

  it('supports custom resolution and frame rate, and blocks invalid values', async () => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openSettings(user);
    await user.selectOptions(within(dialog).getByTestId('settings-resolution'), 'custom');
    fireEvent.change(within(dialog).getByTestId('settings-width'), { target: { value: '1000' } });
    fireEvent.change(within(dialog).getByTestId('settings-height'), { target: { value: '8' } });
    expect(within(dialog).getByTestId('settings-apply')).toBeDisabled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/Height/);
    fireEvent.change(within(dialog).getByTestId('settings-height'), { target: { value: '500' } });
    await user.selectOptions(within(dialog).getByTestId('settings-fps'), 'custom');
    fireEvent.change(within(dialog).getByTestId('settings-custom-fps'), {
      target: { value: '48' },
    });
    expect(within(dialog).getByTestId('settings-apply')).toBeEnabled();
    await user.click(within(dialog).getByTestId('settings-apply'));
    expect(project().meta).toMatchObject({ width: 1000, height: 500, fps: 48 });
  });

  it('Cancel and Escape leave the project alone', async () => {
    const user = userEvent.setup();
    render(<App />);
    let dialog = await openSettings(user);
    fireEvent.change(within(dialog).getByTestId('settings-name'), { target: { value: 'Nope' } });
    await user.click(within(dialog).getByTestId('settings-cancel'));
    expect(project().meta.name).toBe('Untitled');
    dialog = await openSettings(user);
    expect(within(dialog).getByTestId('settings-name')).toHaveValue('Untitled');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument();
  });
});

describe('Export button', () => {
  it('opens the Python dialog for each target and the video dialog', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('export-button-menu'));
    await user.click(screen.getByTestId('export-button-export-ce'));
    expect(screen.getByTestId('export-python')).toHaveTextContent('ManimCE');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('export-python')).toBeNull();

    await user.click(screen.getByTestId('export-button-menu'));
    await user.click(screen.getByTestId('export-button-export-gl'));
    expect(screen.getByTestId('export-python')).toHaveTextContent('ManimGL');
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('export-button-menu'));
    await user.click(screen.getByTestId('export-button-export-video'));
    expect(screen.getByTestId('export-video')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('export-video')).toBeNull();
  });
});
