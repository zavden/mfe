import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClip, createEmptyProject, createFormula } from '../../../model';
import {
  loadProject,
  useProjectStore,
  useRenderStore,
  useSyncWarnings,
  useUiStore,
} from '../../../store';
import { useAnnouncer } from '../../announcer';
import { FORMULA_MIME } from '../../dnd';
import { usePreferences } from '../../preferences';
import { CreatorPanel } from '../CreatorPanel';
import { useFormulaSearch } from '../search/formulaSearchStore';

const project = () => useProjectStore.getState().project;
const setValue = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });

beforeEach(() => {
  const next = createEmptyProject();
  next.formulas.push(
    { ...createFormula({ name: 'alpha', source: 'x^2' }), id: 'f_a' },
    { ...createFormula({ name: 'beta', source: '\\frac{a}{b}' }), id: 'f_b' },
  );
  loadProject(next);
  useUiStore.setState({ selection: { kind: 'none' }, time: 0, playing: false });
  useRenderStore.setState({ prefer: 'auto', entries: {}, resolved: new Map() });
  useSyncWarnings.getState().clear();
  usePreferences.setState({ creatorView: 'list', creatorListPreview: 1, creatorBlockPreview: 1 });
  useFormulaSearch.setState({ open: false, tab: 'math', query: '', requests: 0 });
});

// List presentation and selection are owned by the panel. Real rendering, snapshot copying,
// editor/dialog hosts and Apply/undo remain in creator.test.tsx with the App and real engine.
function withFormulas() {
  const user = userEvent.setup();
  render(<CreatorPanel />);
  return user;
}

describe('CreatorPanel list items', () => {
  it('has a magnifier that shows the search of formulas, pressed while it is up', () => {
    withFormulas();
    const magnifier = screen.getByTestId('creator-search-open');
    expect(magnifier.getAttribute('aria-pressed')).toBe('false');
    expect(magnifier.getAttribute('title')).toMatch(
      /^Search formulas, by name or LaTeX \((Ctrl\+F|⌘F)\)$/,
    );
    fireEvent.click(magnifier);
    expect(useFormulaSearch.getState().open).toBe(true);
    expect(magnifier.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(magnifier);
    expect(useFormulaSearch.getState().open).toBe(false);
    expect(magnifier.getAttribute('aria-pressed')).toBe('false');
  });

  it('lists every formula whatever the search of formulas has typed: it is not a filter', () => {
    withFormulas();
    act(() => useFormulaSearch.setState({ open: true, query: 'frac' }));
    expect(screen.getAllByTestId('formula-item').map((e) => e.getAttribute('data-name'))).toEqual([
      'alpha',
      'beta',
    ]);
    expect(screen.queryByTestId('creator-search')).toBeNull();
  });

  it('selects on click and highlights the formula of a selected clip', async () => {
    const user = withFormulas();
    const item = (name: string) =>
      screen.getAllByTestId('formula-item').find((e) => e.getAttribute('data-name') === name)!;
    await user.click(item('beta'));
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: 'f_b' });
    expect(item('beta')).toHaveAttribute('data-selected', 'true');

    // A clip selected elsewhere (preview, timeline) highlights its formula.
    const clip = createClip('f_a', project().tracks[0]!.id, 0, 3);
    act(() => {
      useProjectStore.getState().update((d) => {
        d.clips.push(clip);
      });
      useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
    });
    expect(item('alpha')).toHaveAttribute('data-linked', 'true');
    expect(item('beta')).toHaveAttribute('data-selected', 'false');
    expect(item('alpha')).toHaveAccessibleName('Formula alpha, used by the selected clip');
    expect(item('beta')).toHaveAccessibleName('Formula beta');
  });

  it('has a key whose menu selects all of a kind, a row per kind, off for a kind the project lacks', async () => {
    const user = withFormulas();
    const key = screen.getByTestId('creator-kinds');
    const row = (kind: string) => screen.getByTestId(`creator-select-all-${kind}`);
    const menu = () => screen.queryByTestId('creator-kinds-menu');
    expect(key).toHaveAccessibleName('Select by kind');
    expect(key).toHaveAttribute('title', 'Select by kind');
    expect(key).toHaveAttribute('aria-haspopup', 'menu');
    expect(key).toHaveAttribute('aria-expanded', 'false');
    expect(key).toHaveTextContent('∑');
    expect(key).not.toHaveClass('is-on');
    // Closed, the menu is not in the document at all.
    expect(menu()).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();

    // A click opens it under the key, the focus on its first row; no tooltip over it.
    await user.click(key);
    expect(screen.getByRole('menu', { name: 'Select by kind' })).toBe(menu());
    expect(key).toHaveAttribute('aria-expanded', 'true');
    expect(key).toHaveAttribute('aria-controls', menu()!.id);
    expect(key).not.toHaveAttribute('title');
    expect(menu()!.parentElement!.parentElement).toBe(document.body);
    expect(row('math')).toHaveFocus();
    const items = screen.getAllByRole('menuitemcheckbox');
    expect(items.map((item) => item.textContent)).toEqual([
      '∑Formulas',
      'TLaTeX texts',
      'PFont texts',
    ]);
    expect(row('math')).toHaveAccessibleName('Formulas');
    expect(row('math')).toHaveAttribute('aria-checked', 'false');
    expect(row('math')).toHaveAttribute('title', 'Select all formulas (2), added to the selection');
    expect(row('tex')).toBeDisabled();
    expect(row('tex')).toHaveAttribute('title', 'The project has no LaTeX texts');
    expect(row('text')).toBeDisabled();

    // Chosen, a row selects its kind and is ticked, the key lit; the menu stays open.
    await user.keyboard('{Enter}');
    expect(useUiStore.getState().selection).toEqual({ kind: 'formulas', ids: ['f_a', 'f_b'] });
    expect(row('math')).toHaveAttribute('aria-checked', 'true');
    expect(row('math')).toHaveTextContent('✓∑Formulas');
    expect(key).toHaveClass('is-on');
    expect(menu()).not.toBeNull();
    expect(row('math')).toHaveFocus();
    // ↓ and ↑ go round the rows that are on (one here); Escape closes, the focus back on the key.
    await user.keyboard('{ArrowDown}');
    expect(row('math')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(menu()).toBeNull();
    expect(key).toHaveFocus();
    expect(key).toHaveAttribute('aria-expanded', 'false');
    expect(key).toHaveClass('is-on');

    // ↓ on the key opens it too; a click on a row takes the kind out again.
    await user.keyboard('{ArrowDown}');
    expect(row('math')).toHaveFocus();
    await user.click(row('math'));
    expect(useUiStore.getState().selection).toEqual({ kind: 'none' });
    expect(row('math')).toHaveAttribute('aria-checked', 'false');
    expect(key).not.toHaveClass('is-on');
    // Tab leaves the menu, which closes; a second click on the key closes what a click opened.
    await user.tab();
    expect(menu()).toBeNull();
    await user.click(key);
    expect(menu()).not.toBeNull();
    await user.click(key);
    expect(menu()).toBeNull();
    // A press elsewhere closes it.
    await user.click(key);
    await user.click(screen.getAllByTestId('formula-item')[1]!);
    expect(menu()).toBeNull();
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: 'f_b' });
  });

  it('has one key that sizes the previews of the view shown: click larger, right-click smaller', async () => {
    const user = withFormulas();
    const key = screen.getByTestId('creator-preview-size');
    const list = screen.getByTestId('formula-list');
    const announced = () => useAnnouncer.getState().text;
    expect(key).toHaveTextContent('+/−');
    expect(key).toBeEnabled();
    expect(key).toHaveAttribute('data-scale', '1');
    expect(key).toHaveAccessibleName('Preview size 1×, the smallest: click for larger');
    expect(key).toHaveAttribute('title', 'Preview size 1×, the smallest: click for larger');
    expect(list.style.getPropertyValue('--row-preview-height')).toBe('52px');
    // At the smallest a right-click does nothing, and says so; the browser shows no menu.
    expect(fireEvent.contextMenu(key)).toBe(false);
    expect(usePreferences.getState().creatorListPreview).toBe(1);
    expect(announced()).toBe('Preview size 1×, the smallest');
    await user.click(key);
    expect(usePreferences.getState().creatorListPreview).toBe(1.5);
    expect(key).toHaveAttribute('data-scale', '1.5');
    expect(key).toHaveAccessibleName(
      'Preview size 1.5×: click for larger, right-click or Shift+click for smaller',
    );
    expect(announced()).toBe('Preview size 1.5×');
    expect(list.style.getPropertyValue('--row-preview-height')).toBe('78px');
    expect(list.style.getPropertyValue('--group-preview-height')).toBe('54px');
    await user.click(key);
    await user.click(key);
    expect(usePreferences.getState().creatorListPreview).toBe(3);
    expect(key).toHaveAttribute(
      'title',
      'Preview size 3×, the largest: right-click or Shift+click for smaller',
    );
    expect(list.style.getPropertyValue('--row-preview-height')).toBe('156px');
    // At the largest a click does nothing.
    await user.click(key);
    expect(usePreferences.getState().creatorListPreview).toBe(3);
    expect(announced()).toBe('Preview size 3×, the largest');
    // A right-click and a Shift+click go one step smaller each.
    fireEvent.contextMenu(key);
    expect(usePreferences.getState().creatorListPreview).toBe(2);
    await user.keyboard('{Shift>}');
    await user.click(key);
    await user.keyboard('{/Shift}');
    expect(usePreferences.getState().creatorListPreview).toBe(1.5);
    // ↑ and ↓ with the focus on the key.
    act(() => key.focus());
    await user.keyboard('{ArrowUp}');
    expect(usePreferences.getState().creatorListPreview).toBe(2);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(usePreferences.getState().creatorListPreview).toBe(1);
    // The block view has a size of its own, and words of its own.
    act(() => usePreferences.getState().set({ creatorView: 'grid' }));
    expect(key).toHaveAttribute('title', 'Preview tooltip size 1×, the smallest: click for larger');
    await user.click(key);
    expect(usePreferences.getState()).toMatchObject({
      creatorBlockPreview: 1.5,
      creatorListPreview: 1,
    });
    expect(announced()).toBe('Preview tooltip size 1.5×');
    fireEvent.contextMenu(key);
    expect(usePreferences.getState()).toMatchObject({
      creatorBlockPreview: 1,
      creatorListPreview: 1,
    });
  });

  it('makes the tooltip of a block as large as the block view’s size, its rendering in step', () => {
    usePreferences.setState({ creatorView: 'grid', creatorBlockPreview: 2 });
    withFormulas();
    const block = screen.getAllByTestId('formula-block')[0]!;
    fireEvent.pointerMove(block, { buttons: 0, pointerType: 'mouse' });
    const tip = screen.getByTestId('formula-tooltip');
    expect(tip).toHaveTextContent('alpha');
    // jsdom's window is 1024 × 768: room for 2×.
    expect(tip.style.width).toBe('562px');
    expect(tip.style.getPropertyValue('--tip-preview-height')).toBe('124px');
    act(() => usePreferences.getState().set({ creatorBlockPreview: 1 }));
    expect(tip.style.width).toBe('288px');
    expect(tip.style.getPropertyValue('--tip-preview-height')).toBe('62px');
  });

  it('marks the kind of each object in a badge, named by its tooltip', () => {
    withFormulas();
    const badges = screen.getAllByTestId('formula-kind');
    expect(badges.map((badge) => badge.textContent)).toEqual(['∑', '∑']);
    expect(badges[0]).toHaveAttribute('title', 'Formula');
    expect(badges[0]).toHaveAttribute('data-kind', 'math');
  });

  it('marks each formula with a small dot of its tag colour (and its icon), not a coloured chip', () => {
    withFormulas();
    act(() =>
      useProjectStore.getState().update((d) => {
        d.formulas[0]!.tag = { color: '#FC6255', icon: '★' };
      }),
    );
    expect(screen.getAllByTestId('formula-tag')[0]).toHaveTextContent('★');
    const [first, second] = screen.getAllByTestId('formula-tag');
    const dot = first!.querySelector<HTMLElement>('.formula-tag-dot')!;
    expect(dot.style.background).toBe('rgb(252, 98, 85)');
    expect(second).toHaveTextContent('');
  });

  it('renames in place, rejecting bad names', async () => {
    const user = withFormulas();
    const item = screen.getAllByTestId('formula-item')[0]!;
    await user.dblClick(within(item).getByTestId('formula-name'));
    const input = within(item).getByTestId('formula-rename-input');
    setValue(input, 'beta');
    expect(within(item).getByTestId('formula-rename-error')).toHaveTextContent(/already/);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(project().formulas[0]!.name).toBe('alpha');
    setValue(input, 'energy');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(project().formulas[0]!.name).toBe('energy');
    expect(screen.queryByTestId('formula-rename-input')).not.toBeInTheDocument();
  });

  it('starts a drag with the payload, copy effect and selection without setDragImage', () => {
    withFormulas();
    const item = screen.getAllByTestId('formula-item')[1]!;
    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: '' };
    fireEvent.dragStart(item, { dataTransfer });
    expect(setData).toHaveBeenCalledWith(FORMULA_MIME, 'f_b');
    expect(setData).toHaveBeenCalledWith('text/plain', 'beta');
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(item).toHaveAttribute('draggable', 'true');
    // The optional image must not prevent the row handler's remaining selection work.
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: 'f_b' });
    expect(item).toHaveAttribute('data-selected', 'true');
  });

  it('holds back the drag of a row pressed with Alt — a region — until the button is let go', () => {
    withFormulas();
    const item = screen.getAllByTestId('formula-item')[1]!;
    const setData = vi.fn();
    const drag = () => fireEvent.dragStart(item, { dataTransfer: { setData, effectAllowed: '' } });
    fireEvent.pointerDown(item, { button: 0, pointerId: 1, altKey: true });
    // Refused before the row hears of it: no payload, no selection.
    expect(drag()).toBe(false);
    expect(setData).not.toHaveBeenCalled();
    expect(useUiStore.getState().selection).toEqual({ kind: 'none' });
    // Let go, the row drags again.
    const up = new Event('pointerup', { bubbles: true });
    Object.assign(up, { pointerId: 1 });
    act(() => void window.dispatchEvent(up));
    expect(drag()).toBe(true);
    expect(setData).toHaveBeenCalledWith(FORMULA_MIME, 'f_b');
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: 'f_b' });
  });

  it('keeps the click of a row pressed with Alt that does not travel', () => {
    withFormulas();
    const item = screen.getAllByTestId('formula-item')[0]!;
    fireEvent.pointerDown(item, { button: 0, pointerId: 1, altKey: true });
    const up = new Event('pointerup', { bubbles: true });
    Object.assign(up, { pointerId: 1 });
    act(() => void window.dispatchEvent(up));
    fireEvent.click(item, { altKey: true });
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: 'f_a' });
    expect(screen.queryByTestId('creator-region')).toBeNull();
  });

  it('drags a small chip instead of the whole card, and keeps the formula payload', async () => {
    withFormulas();
    const item = screen.getAllByTestId('formula-item')[1]!;
    const setData = vi.fn();
    const setDragImage = vi.fn();
    const dataTransfer = { setData, setDragImage, effectAllowed: '' };
    fireEvent.dragStart(item, { dataTransfer });
    expect(setDragImage).toHaveBeenCalledTimes(1);
    const chip = setDragImage.mock.calls[0]![0] as HTMLElement;
    expect(chip).not.toBe(item);
    expect(chip.className).toBe('formula-drag-chip');
    expect(chip.textContent).toContain('beta');
    expect(chip.style.height).toBe('24px');
    expect(setData).toHaveBeenCalledWith(FORMULA_MIME, 'f_b');
    expect(setData).toHaveBeenCalledWith('text/plain', 'beta');
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(item).toHaveAttribute('draggable', 'true');
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: 'f_b' });
    // Taken down once the drag has started.
    await waitFor(() => expect(document.querySelector('.formula-drag-chip')).toBeNull());
  });

  it('shows and dismisses the "check glyph colours" warning', async () => {
    const user = withFormulas();
    act(() =>
      useSyncWarnings.setState({
        warnings: {
          f_a: {
            cause: 'edit',
            confidence: 0.5,
            droppedColors: 1,
            droppedHidden: 0,
            droppedPairGlyphs: 0,
            droppedPairs: 0,
            droppedActionGlyphs: 0,
            droppedAttachGlyphs: 0,
            detached: 0,
            droppedFits: 0,
          },
        },
      }),
    );
    const warning = screen.getByTestId('formula-warning');
    expect(warning).toHaveTextContent(/Check glyph colours, pairs and blocks/);
    await user.click(within(warning).getByTestId('formula-warning-dismiss'));
    expect(screen.queryByTestId('formula-warning')).not.toBeInTheDocument();
  });
});
