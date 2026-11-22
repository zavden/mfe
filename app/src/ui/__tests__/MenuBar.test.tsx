import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject, type Project } from '../../model';
import { history, loadProject, useProjectStore } from '../../store';
import { MenuBar } from '../MenuBar';
import { useDocumentStore } from '../project/documentStore';

vi.mock('../../engine/instance', async () => {
  const { createEngine } = await import('../../engine/engine');
  const engine = createEngine({
    companion: {
      fetch: (() => Promise.reject(new TypeError('offline'))) as typeof fetch,
      watchFocus: false,
    },
  });
  return { getEngine: () => engine };
});

const noop = () => {};

/** Make `project` the open document, as File → Open… does. The project the store holds. */
function open(project: Project): Project {
  loadProject(project);
  const held = useProjectStore.getState().project;
  useDocumentStore.getState().beginDocument(held, { fileName: null, handle: null });
  return held;
}

describe('MenuBar', () => {
  it('has a menubar of menu items alone; the rest of the bar is beside it', () => {
    render(
      <MenuBar
        theme="dark"
        themeChoice="system"
        onToggleTheme={noop}
        onChooseTheme={noop}
        onOpenInspector={noop}
        onOpenSettings={noop}
      />,
    );
    // ARIA lets a menubar own menu items (and groups of them) only (audit B5-04).
    const menubar = screen.getByRole('menubar', { name: 'Main menu' });
    const buttons = [...menubar.querySelectorAll('button')];
    expect(buttons.map((button) => button.getAttribute('role'))).toEqual(
      buttons.map(() => 'menuitem'),
    );
    expect(
      within(menubar)
        .getAllByRole('menuitem')
        .map((item) => item.dataset.testid),
    ).toEqual([
      'menu-file',
      'menu-edit',
      'menu-view',
      'menu-preferences',
      'menu-help',
      'export-button',
      'export-button-menu',
    ]);
    expect(within(menubar).queryByRole('status')).toBeNull();
    expect(within(menubar).queryByRole('textbox')).toBeNull();
    // The bar holds the title, the project's name and state, the renderer and the theme.
    const bar = screen.getByTestId('menu-bar');
    expect(bar.getAttribute('role')).toBeNull();
    for (const id of ['project-rename', 'doc-status', 'engine-status', 'theme-toggle']) {
      expect(bar.contains(screen.getByTestId(id)), id).toBe(true);
      expect(menubar.contains(screen.getByTestId(id)), id).toBe(false);
    }
    expect(within(bar).getByText('Manim Formula Editor').closest('[role="menubar"]')).toBeNull();
  });

  // The name being typed is the name of the document that was open when its field was opened.
  // Another one that opens meanwhile — the file chosen in File → Open… arrives — keeps its own:
  // the field, left as it was, gave it the first one's at the next Enter or click elsewhere.
  it('drops a name being typed when another document opens: it renames nothing there', () => {
    open(createEmptyProject('First'));
    render(
      <MenuBar
        theme="dark"
        themeChoice="system"
        onToggleTheme={noop}
        onChooseTheme={noop}
        onOpenInspector={noop}
        onOpenSettings={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('project-rename'));
    fireEvent.change(screen.getByTestId('project-rename-input'), {
      target: { value: 'Typed for the first' },
    });
    let second!: Project;
    act(() => {
      second = open(createEmptyProject('Second'));
    });
    expect(screen.queryByTestId('project-rename-input')).toBeNull();
    expect(screen.getByTestId('project-rename')).toHaveTextContent('Second');
    expect(useProjectStore.getState().project).toBe(second);
    expect(history.canUndo()).toBe(false);
    // The field opens again on the name of the document that is open now, and renames it.
    fireEvent.click(screen.getByTestId('project-rename'));
    expect(screen.getByTestId('project-rename-input')).toHaveValue('Second');
    fireEvent.change(screen.getByTestId('project-rename-input'), { target: { value: 'Its own' } });
    fireEvent.keyDown(screen.getByTestId('project-rename-input'), { key: 'Enter' });
    expect(useProjectStore.getState().project.meta.name).toBe('Its own');
  });
});
