import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClip, createEmptyProject, createFormula } from '../../../model';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { usePreferences } from '../../preferences';
import { modalStack } from '../../project/modalStack';
import { useTimelineStore } from '../../timeline/timelineStore';
import { rehearsedSkips, rehearsedStops } from '../mainPlayback';
import { Transport } from '../Transport';

function loadScene(end: number) {
  const project = createEmptyProject();
  const formula = createFormula({ name: 'f' });
  project.formulas.push(formula);
  project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, end));
  loadProject(project);
}

beforeEach(() => {
  // Clock transition cases live in the Node controller suite; controls do not need timer loops.
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  useUiStore.setState({ time: 0, playing: false, selection: { kind: 'none' } });
  useTimelineStore.setState({ loop: false, stopAtPauses: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  loadProject(createEmptyProject());
});

describe('Transport', () => {
  it('connects live playback to the readout and disposes its clock on unmount', () => {
    loadScene(1);
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { unmount } = render(<Transport />);
    act(() => useUiStore.getState().setPlaying(true));
    expect(screen.getByTestId('transport-play')).toHaveAccessibleName('Pause');
    const tick = vi.mocked(window.requestAnimationFrame).mock.calls[0]![0];
    act(() => tick(400));
    expect(screen.getByTestId('transport-seconds')).toHaveTextContent('0.400 s');
    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    tick(2000);
    expect(useUiStore.getState()).toMatchObject({ time: 0.4, playing: true });
  });

  it('plays, pauses, stops, and toggles looping through the real controls', async () => {
    loadScene(10);
    const user = userEvent.setup();
    render(<Transport />);
    await user.click(screen.getByTestId('transport-play'));
    expect(useUiStore.getState().playing).toBe(true);
    expect(screen.getByTestId('transport-play')).toHaveAccessibleName('Pause');
    await user.click(screen.getByTestId('transport-play'));
    expect(useUiStore.getState().playing).toBe(false);
    act(() => {
      useUiStore.getState().setTime(3);
    });
    await user.click(screen.getByTestId('transport-play'));
    await user.click(screen.getByTestId('transport-stop'));
    expect(useUiStore.getState()).toMatchObject({ time: 0, playing: false });
    await user.click(screen.getByTestId('transport-loop'));
    expect(useTimelineStore.getState().loop).toBe(true);
    expect(screen.getByTestId('transport-loop')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('transport-loop'));
    expect(useTimelineStore.getState().loop).toBe(false);
  });

  it('offers to stop at the pauses only to a project with the Slides mode on', async () => {
    const user = userEvent.setup();
    loadScene(10);
    render(<Transport />);
    expect(screen.queryByTestId('transport-stop-at-pauses')).toBeNull();
    expect(rehearsedStops()).toEqual([]);
    act(() => {
      useProjectStore.getState().update((draft) => {
        draft.slides = {
          marks: [
            { id: 'p1', time: 4, kind: 'pause' },
            { id: 'p2', time: 2, kind: 'pause' },
            { id: 'p3', time: 3, kind: 'comment', text: 'A note stops nothing' },
            { id: 'p4', time: 10, kind: 'pause' }, // the end: the scene stands there anyway
            { id: 'p5', time: 99, kind: 'pause' }, // past it: left out
          ],
        };
      });
    });
    const button = screen.getByTestId('transport-stop-at-pauses');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAccessibleName('Stop at pauses');
    // Off: playback goes through them.
    expect(rehearsedStops()).toEqual([]);
    await user.click(button);
    expect(useTimelineStore.getState().stopAtPauses).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(rehearsedStops()).toEqual([2, 4]);
    // No pause skips its wait yet; one that does skips while the pauses are rehearsed only.
    expect(rehearsedSkips()).toEqual([]);
    act(() => {
      useProjectStore.getState().update((draft) => {
        draft.clips[0]!.intro = { ...draft.clips[0]!.intro, kind: 'write', duration: 1 };
        draft.clips[0]!.start = 5;
        draft.slides!.marks[1]!.skipWait = true;
      });
    });
    // To the pause at 4 s, which stands in the same rest before the formula's intro at 5 s.
    expect(rehearsedSkips()).toEqual([{ start: 2, end: 4 }]);
    await user.click(button);
    expect(rehearsedStops()).toEqual([]);
    expect(rehearsedSkips()).toEqual([]);
  });

  it('shows the time, timecode and frame number of the playhead', () => {
    loadScene(10);
    useUiStore.setState({ time: 2.5 });
    render(<Transport />);
    expect(screen.getByTestId('transport-seconds')).toHaveTextContent('2.500 s');
    expect(screen.getByTestId('transport-timecode')).toHaveTextContent('00:02:30');
    expect(screen.getByTestId('transport-frame')).toHaveTextContent('f150 / 600');
  });

  it('handles Space, Home, End and the arrow keys, but not while typing', async () => {
    loadScene(10);
    const user = userEvent.setup();
    render(
      <>
        <Transport />
        <input data-testid="field" />
      </>,
    );
    await user.keyboard('{End}');
    expect(useUiStore.getState().time).toBe(10);
    await user.keyboard('{Home}{ArrowRight}');
    expect(useUiStore.getState().time).toBeCloseTo(1 / 60, 9);
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(useUiStore.getState().time).toBeCloseTo(1 + 1 / 60, 9);
    await user.keyboard(' ');
    expect(useUiStore.getState().playing).toBe(true);
    await user.keyboard(' ');
    expect(useUiStore.getState().playing).toBe(false);

    await user.click(screen.getByTestId('field'));
    await user.keyboard('{Home} {ArrowLeft}');
    expect(useUiStore.getState().time).toBeCloseTo(1 + 1 / 60, 9);
    expect(screen.getByTestId('field')).toHaveValue(' ');
  });

  it('plays with Space unless the focused control takes it; not in a dialog', async () => {
    loadScene(10);
    const user = userEvent.setup();
    const clicked = vi.fn();
    render(
      <>
        <Transport />
        <div tabIndex={0} data-testid="area" />
        <button type="button" data-testid="reopen" onClick={clicked}>
          Create relation…
        </button>
        <input type="checkbox" data-testid="check" />
      </>,
    );
    screen.getByTestId('area').focus();
    await user.keyboard(' ');
    expect(useUiStore.getState().playing).toBe(true);
    await user.keyboard(' ');
    expect(useUiStore.getState().playing).toBe(false);
    // A checkbox uses Space itself (it has no other key).
    screen.getByTestId('check').focus();
    await user.keyboard(' ');
    expect(useUiStore.getState().playing).toBe(false);
    expect(screen.getByTestId('check')).toBeChecked();
    // A button that got the focus after a key press (here: the Space above) takes Space; one
    // that only kept the focus after a click lets it play (e2e/transport.spec.ts).
    screen.getByTestId('reopen').focus();
    await user.keyboard(' ');
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().playing).toBe(false);

    // While a dialog is open the keys belong to it.
    screen.getByTestId('reopen').blur();
    const token = Symbol('dialog');
    modalStack.push(token);
    try {
      await user.keyboard(' {End}');
      expect(useUiStore.getState().playing).toBe(false);
      expect(useUiStore.getState().time).toBe(0);
    } finally {
      modalStack.splice(modalStack.indexOf(token), 1);
    }
  });

  it('shows what the grid holds as an icon, named by its label, and toggles it on click', async () => {
    const user = userEvent.setup();
    loadScene(1);
    usePreferences.getState().set({ grid: true, gridAnchor: 'center' });
    render(<Transport />);
    const button = screen.getByTestId('transport-grid-anchor');
    expect(button).toHaveAttribute('data-anchor', 'center');
    expect(button).toHaveAccessibleName(/holds the formula's centre.*click for its nearest edges/);
    expect(button).toHaveTextContent('');
    const dotInABox = button.querySelector('svg')!.innerHTML;
    expect(dotInABox).toContain('<circle');
    await user.click(button);
    expect(usePreferences.getState().gridAnchor).toBe('edges');
    expect(button).toHaveAttribute('data-anchor', 'edges');
    expect(button).toHaveAccessibleName(/holds the formula's nearest edges.*click for its centre/);
    expect(button.querySelector('svg')!.innerHTML).not.toBe(dotInABox);
    usePreferences.getState().set({ grid: false, gridAnchor: 'center' });
  });

  it('keeps the contract of the Preview panel: export name and test id', () => {
    loadScene(1);
    render(<Transport />);
    expect(screen.getByTestId('transport')).toBeInTheDocument();
    expect(useProjectStore.getState().project.clips).toHaveLength(1);
  });
});
