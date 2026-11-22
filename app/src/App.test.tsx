import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createEmptyProject } from './model';
import { history, loadProject, useRenderStore, useUiStore } from './store';
import { defaultPreferences, PREFERENCES_STORAGE_KEY, usePreferences } from './ui/preferences';
import { useDocumentStore } from './ui/project/documentStore';
import { useNoticeStore } from './ui/project/noticeStore';
import { THEME_STORAGE_KEY } from './ui/theme';

// The app-wide engine, with a companion that is never reachable (tests must not depend on a
// companion running on this machine).
vi.mock('./engine/instance', async () => {
  const { createEngine } = await import('./engine/engine');
  const engine = createEngine({
    companion: {
      fetch: (() => Promise.reject(new TypeError('offline'))) as typeof fetch,
      watchFocus: false,
    },
  });
  return { getEngine: () => engine };
});

// jsdom has no 2D canvas context; the preview skips painting when there is none. Silence the
// "not implemented" notice jsdom prints for getContext.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  // The stores are module singletons: start every test from an empty, clean project.
  loadProject(createEmptyProject());
  useUiStore.setState({ selection: { kind: 'none' }, time: 0, playing: false });
  useRenderStore.setState({ prefer: 'auto', entries: {}, resolved: new Map() });
  useDocumentStore.getState().markClean(createEmptyProject(), { fileName: null, handle: null });
  useNoticeStore.getState().clear();
  window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  usePreferences.setState(defaultPreferences());
});

describe('App layout', () => {
  it('renders the menu bar and the four panels', async () => {
    render(<App />);
    expect(screen.getByTestId('menu-bar')).toBeInTheDocument();
    for (const [testId, title] of [
      ['panel-creator', 'Creator'],
      ['panel-preview', 'Preview'],
      ['panel-animations', 'Animations'],
      ['panel-timeline', 'Timeline'],
    ] as const) {
      const panel = screen.getByTestId(testId);
      expect(within(panel).getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByTestId('preview-frame')).toBeInTheDocument();
    // No formula yet and no companion: new formulas would render with MathJax.
    expect(await screen.findByText('Renderer: MathJax')).toBe(screen.getByTestId('engine-status'));
    expect(screen.getByTestId('engine-status')).toHaveAttribute('data-companion', 'offline');
  });

  it('is dark by default and the toggle flips data-theme and persists it', async () => {
    const user = userEvent.setup();
    render(<App />);
    const root = document.documentElement;
    expect(root).toHaveAttribute('data-theme', 'dark');

    await user.click(screen.getByTestId('theme-toggle'));
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await user.click(screen.getByTestId('theme-toggle'));
    expect(root).toHaveAttribute('data-theme', 'dark');
  });

  it('restores the stored theme', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(<App />);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('works when storage is blocked', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<App />);
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    await user.click(screen.getByTestId('theme-toggle'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    vi.restoreAllMocks();
  });
});

describe('Menu bar', () => {
  it('opens a menu, lists its items, and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    const file = screen.getByTestId('menu-file');
    expect(file).toHaveAttribute('aria-haspopup', 'menu');
    expect(file).toHaveAttribute('aria-expanded', 'false');

    await user.click(file);
    expect(file).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'File' });
    for (const label of ['New', 'Open…', 'Save', 'Save As…', 'Project settings…']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeEnabled();
    }

    await user.keyboard('{Escape}');
    expect(file).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on outside click', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('menu-edit'));
    expect(screen.getByRole('menu', { name: 'Edit' })).toBeInTheDocument();
    await user.click(screen.getByTestId('panel-creator'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('toggles the theme from the View menu', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('menu-view'));
    await user.click(screen.getByRole('menuitem', { name: 'Toggle theme' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('View → Theme → System follows the system scheme as it changes; the toggle leaves it', async () => {
    // A fake `matchMedia`: dark at first, then switched to light.
    let dark = true;
    const listeners = new Set<() => void>();
    const matchMedia = vi.fn((query: string) => ({
      get matches() {
        return query === '(prefers-color-scheme: dark)' && dark;
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }));
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByTestId('menu-view'));
      await user.click(screen.getByTestId('menu-item-view-theme'));
      const system = screen.getByTestId('menu-item-view-theme-system');
      expect(system).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByTestId('menu-item-view-theme-dark')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await user.click(system);
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');

      dark = false;
      act(() => listeners.forEach((fn) => fn()));
      expect(document.documentElement).toHaveAttribute('data-theme', 'light');

      // The bar's button flips from the theme in effect to a choice of its own.
      await user.click(screen.getByTestId('theme-toggle'));
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      dark = true;
      act(() => listeners.forEach((fn) => fn()));
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Edit menu: default intro and outro', () => {
  it('has "Always add intro / outro" toggles, off by default, and the dialog entry', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('menu-edit'));
    const menu = screen.getByRole('menu', { name: 'Edit' });
    const intro = within(menu).getByRole('menuitemcheckbox', {
      name: 'Always add intro (Write)',
    });
    const outro = within(menu).getByRole('menuitemcheckbox', {
      name: 'Always add outro (FadeOut)',
    });
    expect(intro).toHaveAttribute('aria-checked', 'false');
    expect(outro).toHaveAttribute('aria-checked', 'false');
    expect(within(menu).getByRole('menuitem', { name: 'Default intro & outro…' })).toBeEnabled();
  });

  it('toggles each preference independently, remembers it and closes the menu', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('menu-edit'));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Always add intro/ }));
    expect(usePreferences.getState()).toMatchObject({ autoIntro: true, autoOutro: false });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toMatchObject({
      autoIntro: true,
      autoOutro: false,
    });

    await user.click(screen.getByTestId('menu-edit'));
    expect(screen.getByRole('menuitemcheckbox', { name: /Always add intro/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Always add outro/ }));
    expect(usePreferences.getState()).toMatchObject({ autoIntro: true, autoOutro: true });

    await user.click(screen.getByTestId('menu-edit'));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Always add intro/ }));
    expect(usePreferences.getState()).toMatchObject({ autoIntro: false, autoOutro: true });
    // Preferences are not part of the project: no undo step, project not marked as changed.
    expect(history.canUndo()).toBe(false);
  });

  it('shows the animations chosen in the dialog and saves them from there', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('menu-edit'));
    await user.click(screen.getByRole('menuitem', { name: 'Default intro & outro…' }));
    const dialog = screen.getByTestId('default-animations-dialog');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.selectOptions(within(dialog).getByTestId('default-intro-kind'), 'grow_from_center');
    await user.selectOptions(within(dialog).getByTestId('default-outro-kind'), 'uncreate');
    await user.click(within(dialog).getByTestId('default-animations-save'));
    expect(screen.queryByTestId('default-animations-dialog')).not.toBeInTheDocument();
    expect(usePreferences.getState().intro.kind).toBe('grow_from_center');
    expect(history.canUndo()).toBe(false);

    await user.click(screen.getByTestId('menu-edit'));
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Always add intro (GrowFromCenter)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Always add outro (Uncreate)' }),
    ).toBeInTheDocument();
  });

  it('closes the dialog with Escape and leaves the preferences alone', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('menu-edit'));
    await user.click(screen.getByRole('menuitem', { name: 'Default intro & outro…' }));
    await user.selectOptions(screen.getByTestId('default-intro-kind'), 'create');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('default-animations-dialog')).not.toBeInTheDocument();
    expect(usePreferences.getState().intro.kind).toBe('write');
  });
});

describe('Edit menu: Suggest morph pairs', () => {
  it('follows the intro and outro entries, off by default, and toggles the preference', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('menu-edit'));
    const menu = screen.getByRole('menu', { name: 'Edit' });
    const labels = [...menu.querySelectorAll('[role^="menuitem"]')].map((item) =>
      item.textContent!.replace('✓', '').trim(),
    );
    const at = labels.indexOf('Default intro & outro…');
    expect(labels.slice(at - 2, at + 2)).toEqual([
      'Always add intro (Write)',
      'Always add outro (FadeOut)',
      'Default intro & outro…',
      'Suggest morph pairs',
    ]);
    const item = within(menu).getByRole('menuitemcheckbox', { name: 'Suggest morph pairs' });
    expect(item).toHaveAttribute('data-testid', 'menu-item-edit-auto-suggest-morph-pairs');
    expect(item).toHaveAttribute('aria-checked', 'false');

    await user.click(item);
    expect(usePreferences.getState().autoSuggestMorphPairs).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toMatchObject({
      autoSuggestMorphPairs: true,
    });
    await user.click(screen.getByTestId('menu-edit'));
    const again = screen.getByRole('menuitemcheckbox', { name: /Suggest morph pairs/ });
    expect(again).toHaveAttribute('aria-checked', 'true');
    await user.click(again);
    expect(usePreferences.getState()).toMatchObject({
      autoSuggestMorphPairs: false,
      autoIntro: false,
      autoOutro: false,
    });
    // A preference, not a project edit.
    expect(history.canUndo()).toBe(false);
  });
});

describe('Engine inspector', () => {
  it('opens from the Help menu, renders \\frac{a}{b} with MathJax and closes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('menu-help'));
    await user.click(screen.getByRole('menuitem', { name: 'Engine inspector…' }));
    const dialog = screen.getByTestId('engine-inspector');
    expect(dialog).toHaveAttribute('role', 'dialog');

    const input = screen.getByTestId('inspector-latex');
    await user.clear(input);
    await user.paste('\\frac{a}{b}');
    await user.selectOptions(screen.getByTestId('inspector-prefer'), 'mathjax');

    const labels = await screen.findByTestId('inspector-glyphs-labels');
    await vi.waitFor(() => {
      const items = within(labels).getAllByRole('listitem');
      expect(items.map((li) => li.getAttribute('data-label'))).toEqual(['a', 'b', '—']);
    });
    expect(screen.getByTestId('inspector-backend')).toHaveTextContent('mathjax');
    expect(screen.getByTestId('inspector-exact')).toHaveTextContent('approximate');

    await user.hover(screen.getByTestId('inspector-glyphs-glyph-1'));
    expect(screen.getByTestId('inspector-glyphs-label-1')).toHaveClass('active');

    await user.click(screen.getByTestId('inspector-compare'));
    expect(await screen.findByTestId('inspector-latex-error')).toHaveTextContent(/companion/);

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('engine-inspector')).not.toBeInTheDocument();
  });

  it('shows MathJax errors', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('menu-help'));
    await user.click(screen.getByRole('menuitem', { name: 'Engine inspector…' }));
    const input = screen.getByTestId('inspector-latex');
    await user.clear(input);
    await user.paste('\\nosuchmacro');
    expect(await screen.findByTestId('inspector-error')).toHaveTextContent(/nosuchmacro/);
  });
});
