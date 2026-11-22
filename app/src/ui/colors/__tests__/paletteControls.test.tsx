import { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClip, createColorMatch, createEmptyProject, createFormula } from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import { ColorField } from '../../animations/fields';
import { StateFields } from '../../animations/StateFields';
import { GlyphMenu } from '../../creator/GlyphMenu';
import { HexColorField } from '../../project/HexColorField';
import { Modal } from '../../project/Modal';
import { SwatchRow } from '../../project/SwatchRow';
import { ColorMatchDialog } from '../ColorMatchDialog';
import { normalizePalette, PALETTE_ROLES } from '../palette';
import { emptyPaletteLibrary } from '../paletteLibrary';
import { PaletteRoleButton } from '../PaletteRoleChoices';
import { usePaletteStore } from '../paletteStore';

const source = normalizePalette({
  format: 'manim-palette',
  version: 1,
  name: 'Shared roles',
  colors: Object.fromEntries(PALETTE_ROLES.map((role) => [role, '#AABBCC'])),
}).palette;
const entry = { id: 'shared', displayName: 'Shared roles', source };
/** The same palette with two roles of the user's. */
const ownRoles = normalizePalette({
  ...source,
  customRoles: [
    { name: 'highlight', color: '#FFD400' },
    { name: 'accent 2', color: '#00B3FF' },
  ],
}).palette;

beforeEach(() => {
  usePaletteStore.setState({
    library: { version: 1, activePaletteId: entry.id, palettes: [entry] },
    revision: 1,
  });
});

afterEach(() => {
  cleanup();
  usePaletteStore.setState({ library: emptyPaletteLibrary(), revision: 0 });
  loadProject(createEmptyProject());
});

describe('semantic palette controls', () => {
  it('keeps equal-hex roles separately named beside Manim swatches and respects disabled rows', () => {
    const onPick = vi.fn();
    const view = render(
      <SwatchRow label="Glyph colours" testIdPrefix="glyph" onPick={onPick}>
        <input type="color" aria-label="Custom glyph colour" />
      </SwatchRow>,
    );
    const formula = screen.getByTestId('glyph-role-formula');
    const text = screen.getByTestId('glyph-role-text');
    expect(formula).toHaveAccessibleName('Colour formula #AABBCC');
    expect(text).toHaveAccessibleName('Colour text #AABBCC');
    expect(text).not.toBe(formula);
    expect(formula).toHaveAttribute('title', 'formula #AABBCC');
    expect(screen.getByRole('group', { name: 'Palette roles: Shared roles' })).toBeInTheDocument();
    expect(screen.getByLabelText('Custom glyph colour')).toBeInTheDocument();
    fireEvent.click(formula);
    expect(onPick).toHaveBeenCalledExactlyOnceWith('#AABBCC');
    fireEvent.click(screen.getByTestId('glyph-WHITE'));
    expect(onPick).toHaveBeenLastCalledWith('#FFFFFF');

    view.rerender(
      <SwatchRow label="Glyph colours" testIdPrefix="glyph" onPick={onPick} disabled />,
    );
    expect(screen.getByTestId('glyph-role-text')).toBeDisabled();
    expect(screen.getByTestId('glyph-WHITE')).toBeDisabled();
    fireEvent.click(screen.getByTestId('glyph-role-text'));
    expect(onPick).toHaveBeenCalledTimes(2);
  });

  it('names each role in the pop-up of the Roles button, the user’s under a heading of their own', () => {
    usePaletteStore.setState({
      library: {
        version: 1,
        activePaletteId: entry.id,
        palettes: [{ ...entry, source: ownRoles }],
      },
      revision: 2,
    });
    const onPick = vi.fn();
    render(<PaletteRoleButton testIdPrefix="row" onPick={onPick} />);
    fireEvent.click(screen.getByTestId('row-roles'));
    const formula = screen.getByTestId('row-role-formula');
    expect(formula).toHaveTextContent('formula');
    expect(formula).toHaveAccessibleName('Colour formula #AABBCC');
    expect(formula).toHaveAttribute('role', 'menuitem');
    for (const role of PALETTE_ROLES) {
      expect(screen.getByTestId(`row-role-${role}`)).toHaveTextContent(role);
    }
    expect(screen.getByTestId('row-custom-roles')).toHaveTextContent('Your roles');
    const highlight = screen.getByTestId('row-custom-role-0');
    expect(highlight).toHaveTextContent('highlight');
    expect(highlight).toHaveAccessibleName('Colour highlight #FFD400');
    fireEvent.click(screen.getByTestId('row-custom-role-1'));
    expect(onPick).toHaveBeenCalledExactlyOnceWith('#00B3FF');
    expect(screen.queryByTestId('row-role-menu')).toBeNull();
  });

  it('is named by what it shows: Roles, with what it does as its description', () => {
    // WCAG 2.5.3, Label in Name: a voice command says "Roles", a screen reader reads the same.
    render(<PaletteRoleButton testIdPrefix="row" onPick={vi.fn()} />);
    const button = screen.getByTestId('row-roles');
    expect(button).toHaveTextContent('Roles');
    expect(button).toHaveAccessibleName('Roles');
    expect(button).toHaveAccessibleDescription('Choose a palette role');
    expect(screen.getByRole('button', { name: 'Roles' })).toBe(button);
  });

  it('has no heading for the user’s roles in the pop-up of a palette without them', () => {
    render(<PaletteRoleButton testIdPrefix="row" onPick={vi.fn()} />);
    fireEvent.click(screen.getByTestId('row-roles'));
    expect(screen.getByTestId('row-role-arrow')).toHaveTextContent('arrow');
    expect(screen.queryByTestId('row-custom-roles')).toBeNull();
    expect(screen.queryByTestId('row-custom-role-0')).toBeNull();
  });

  it('adds the user’s roles to a row of swatches, their names in the tooltips', () => {
    usePaletteStore.setState({
      library: {
        version: 1,
        activePaletteId: entry.id,
        palettes: [{ ...entry, source: ownRoles }],
      },
      revision: 2,
    });
    const onPick = vi.fn();
    render(
      <SwatchRow label="Glyph colours" testIdPrefix="glyph" onPick={onPick}>
        <input type="color" aria-label="Custom glyph colour" />
      </SwatchRow>,
    );
    const highlight = screen.getByTestId('glyph-custom-role-0');
    expect(highlight).toHaveAttribute('title', 'highlight #FFD400');
    expect(highlight).toHaveTextContent('');
    expect(screen.getByTestId('glyph-role-formula')).toHaveTextContent('');
    expect(screen.queryByTestId('glyph-custom-roles')).toBeNull();
    fireEvent.click(highlight);
    expect(onPick).toHaveBeenCalledExactlyOnceWith('#FFD400');
  });

  it('opens role choices by keyboard, commits once and restores focus to its trigger', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<PaletteRoleButton testIdPrefix="color" onPick={onPick} />);
    await user.tab();
    expect(screen.getByTestId('color-roles')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('color-role-background')).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledExactlyOnceWith('#AABBCC');
    expect(screen.queryByTestId('color-role-menu')).toBeNull();
    expect(screen.getByTestId('color-roles')).toHaveFocus();
  });

  it('closes on Tab and lets the key move on between two real modal triggers, keeping only one keyboard owner', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    const view = render(
      <Modal title="Two colours" onClose={() => {}}>
        <PaletteRoleButton testIdPrefix="first" onPick={first} />
        <PaletteRoleButton testIdPrefix="second" onPick={second} />
      </Modal>,
    );
    // jsdom has no layout; expose the two visible controls to Modal's visibility filter.
    for (const id of ['first-roles', 'second-roles']) {
      Object.defineProperty(screen.getByTestId(id), 'offsetParent', { value: document.body });
    }
    expect(screen.getByTestId('first-roles')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('first-role-background')).toHaveFocus();
    // Tab closes the popup and is left to the browser, which finds the focus back on the popup's
    // button and moves on from it (jsdom moves no focus, so the test does).
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      document.activeElement!.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(false);
      expect(screen.getByTestId('first-roles')).toHaveFocus();
      screen.getByTestId('second-roles').focus();
    });
    expect(screen.queryByTestId('first-role-menu')).toBeNull();
    expect(screen.getByTestId('second-roles')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByTestId('first-role-menu')).toBeNull();
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByTestId('second-role-background')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('second-role-formula')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith('#AABBCC');
    await user.keyboard('{Enter}');
    view.unmount();
    const later = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    window.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it('discards an open popup when disabled or the active palette is removed', () => {
    const onPick = vi.fn();
    const view = render(<PaletteRoleButton testIdPrefix="color" onPick={onPick} />);
    fireEvent.click(screen.getByTestId('color-roles'));
    expect(screen.getByTestId('color-role-menu')).toBeInTheDocument();
    view.rerender(<PaletteRoleButton testIdPrefix="color" onPick={onPick} disabled />);
    expect(screen.queryByTestId('color-role-menu')).toBeNull();
    expect(screen.getByTestId('color-roles')).toHaveAttribute('aria-expanded', 'false');
    view.rerender(<PaletteRoleButton testIdPrefix="color" onPick={onPick} />);
    expect(screen.queryByTestId('color-role-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('color-roles'));
    act(() => usePaletteStore.setState({ library: emptyPaletteLibrary() }));
    expect(screen.queryByTestId('color-role-menu')).toBeNull();
    expect(screen.queryByTestId('color-roles')).toBeNull();
    act(() =>
      usePaletteStore.setState({
        library: { version: 1, activePaletteId: entry.id, palettes: [entry] },
      }),
    );
    expect(screen.queryByTestId('color-role-menu')).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it.each(['hex', 'animation'] as const)(
    '%s role choices preserve native input/change commits, repeated choices and listener cleanup',
    (kind) => {
      const committed = vi.fn();
      function Harness() {
        const [value, setValue] = useState('#FFFFFF');
        const props = {
          testId: 'color',
          value,
          label: 'Colour',
          onCommit(next: string) {
            committed(next);
            setValue(next);
          },
        };
        return kind === 'hex' ? <HexColorField {...props} /> : <ColorField {...props} />;
      }
      const view = render(
        <StrictMode>
          <Harness />
        </StrictMode>,
      );
      const input = () => screen.getByTestId('color') as HTMLInputElement;
      const original = input();
      fireEvent.input(original, { target: { value: '#123456' } });
      expect(committed).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('color-roles'));
      fireEvent.click(screen.getByTestId('color-role-formula'));
      expect(committed).toHaveBeenCalledExactlyOnceWith('#AABBCC');
      expect(input()).toHaveValue('#aabbcc');
      fireEvent.click(screen.getByTestId('color-roles'));
      fireEvent.click(screen.getByTestId('color-role-text'));
      expect(committed).toHaveBeenCalledTimes(1);
      if (original !== input()) fireEvent.change(original, { target: { value: '#abcdef' } });
      expect(committed).toHaveBeenCalledTimes(1);

      fireEvent.input(input(), { target: { value: '#010203' } });
      expect(committed).toHaveBeenCalledTimes(1);
      fireEvent.change(input());
      expect(committed).toHaveBeenCalledTimes(2);
      expect(committed).toHaveBeenLastCalledWith('#010203');
      const detached = input();
      view.unmount();
      fireEvent.change(detached, { target: { value: '#fedcba' } });
      expect(committed).toHaveBeenCalledTimes(2);
    },
  );

  it('keeps inherited animation colour disabled until explicitly enabled, then uses one undo per choice', () => {
    const project = createEmptyProject();
    const formula = createFormula();
    project.formulas.push(formula);
    project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 5));
    loadProject(project);
    function Harness() {
      const state = useProjectStore((store) => store.project.clips[0]!.initial);
      return (
        <StateFields
          state={state}
          idPrefix="state"
          patch={(patch) => {
            useProjectStore.getState().update((draft) => {
              Object.assign(draft.clips[0]!.initial, patch);
            });
          }}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByTestId('state-color-roles')).toBeDisabled();
    fireEvent.click(screen.getByTestId('state-color-roles'));
    expect(screen.queryByTestId('state-color-role-menu')).toBeNull();
    expect(useProjectStore.getState().project.clips[0]!.initial.color).toBeNull();
    fireEvent.click(screen.getByTestId('state-color-on'));
    fireEvent.click(screen.getByTestId('state-color-roles'));
    fireEvent.click(screen.getByTestId('state-color-role-result'));
    expect(useProjectStore.getState().project.clips[0]!.initial.color).toBe('#AABBCC');
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(2);
    act(() => history.undo());
    expect(useProjectStore.getState().project.clips[0]!.initial.color).toBe('#FFFFFF');
    act(() => history.undo());
    expect(useProjectStore.getState().project.clips[0]!.initial.color).toBeNull();
    expect(screen.getByTestId('state-color-roles')).toBeDisabled();
  });

  it('passes one copied hex through the actual glyph menu and closes once', () => {
    const onColor = vi.fn();
    const onClose = vi.fn();
    render(
      <GlyphMenu
        x={20}
        y={20}
        header="Selected glyphs"
        canClearColor={false}
        canHide
        canShow={false}
        onColor={onColor}
        onHidden={() => {}}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('glyph-menu-color-WHITE')).toBeInTheDocument();
    expect(screen.getByTestId('glyph-menu-color-role-formula')).toHaveAccessibleName(
      'Colour formula #AABBCC',
    );
    expect(screen.getByTestId('glyph-menu-color-role-text')).toHaveAccessibleName(
      'Colour text #AABBCC',
    );
    fireEvent.click(screen.getByTestId('glyph-menu-color-role-text'));
    expect(onColor).toHaveBeenCalledExactlyOnceWith('#AABBCC');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the actual Match colors popup to commit one ordinary hex and undo it', () => {
    const project = createEmptyProject();
    const list = createColorMatch('Course', [{ pattern: 'x', color: '#FFFFFF' }]);
    project.colorMatches.push(list);
    loadProject(project);
    render(<ColorMatchDialog shown={list.id} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('match-colors-chip-0'));
    expect(screen.getByTestId('match-colors-palette-WHITE')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('match-colors-palette-role-variable'));
    expect(screen.queryByTestId('match-colors-palette')).toBeNull();
    expect(useProjectStore.getState().project.colorMatches[0]!.entries[0]).toEqual({
      pattern: 'x',
      color: '#AABBCC',
    });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    act(() => history.undo());
    expect(useProjectStore.getState().project).toBe(project);
  });
});
