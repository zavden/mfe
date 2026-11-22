import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createTween,
  validateProject,
  type Clip,
  type TweenAction,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { AnimationsPanel } from '../AnimationsPanel';
import { useAnimationsTab } from '../animationsTab';

function load(): { clip: Clip; other: Clip } {
  const project = createEmptyProject();
  const formula = createFormula({ name: 'alpha' });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 1, 6);
  const other = createClip(formula.id, project.tracks[1]!.id, 2, 7);
  clip.actions.push(createTween(2, 1, { rotation: 45 }));
  project.clips.push(clip, other);
  loadProject(project);
  return { clip, other };
}

const clipOf = (id: string) => useProjectStore.getState().project.clips.find((c) => c.id === id)!;

afterEach(() => {
  useUiStore.setState({ selection: { kind: 'none' } });
  useAnimationsTab.setState({ tab: 'relations' });
  loadProject(createEmptyProject());
});

describe('AnimationsPanel', () => {
  it('opens a clip on the Relations tab and keeps the chosen tab for the next clip', async () => {
    const { clip, other } = load();
    const user = userEvent.setup();
    useUiStore.setState({ selection: { kind: 'clips', ids: [clip.id] } });
    render(<AnimationsPanel />);
    const relationsTab = screen.getByTestId('animations-tab-relations');
    expect(relationsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('animations-panel-relations')).toBeVisible();
    expect(screen.getByTestId('animations-panel-timing')).not.toBeVisible();

    // Arrow keys move between tabs.
    relationsTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('animations-tab-timing')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('animations-tab-timing')).toHaveFocus();
    expect(screen.getByTestId('timing-section')).toBeVisible();

    act(() => useUiStore.setState({ selection: { kind: 'clips', ids: [other.id] } }));
    expect(screen.getByTestId('animations-tab-timing')).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByTestId('animations-tab-relations'));
    expect(screen.getByTestId('relations-section')).toBeVisible();
  });

  it('asks for a selection and counts several clips', async () => {
    const { clip, other } = load();
    const user = userEvent.setup();
    render(<AnimationsPanel />);
    expect(screen.getByTestId('animations-empty')).toBeInTheDocument();

    useUiStore.setState({ selection: { kind: 'clips', ids: [clip.id, other.id] } });
    expect(await screen.findByTestId('animations-multi')).toHaveTextContent('2 clips selected');
    await user.click(screen.getByTestId('animations-delete-selected'));
    expect(useProjectStore.getState().project.clips).toHaveLength(0);
  });

  it('shows the clip and commits each edit as one undo step', async () => {
    const { clip } = load();
    const user = userEvent.setup();
    useUiStore.setState({ selection: { kind: 'clips', ids: [clip.id] } });
    render(<AnimationsPanel />);
    expect(screen.getByTestId('clip-title')).toHaveTextContent('alpha');
    expect(screen.getByTestId('relations-empty')).toBeInTheDocument();
    await user.click(screen.getByTestId('animations-tab-timing'));
    expect(screen.getByTestId('intro-kind')).toHaveValue('write');

    await user.selectOptions(screen.getByTestId('intro-kind'), 'grow_from_center');
    expect(clipOf(clip.id).intro).toMatchObject({ kind: 'grow_from_center', easing: 'smooth' });

    // Typing does not commit; Enter does, once.
    const duration = screen.getByTestId('intro-duration');
    await user.clear(duration);
    await user.type(duration, '0.5');
    expect(clipOf(clip.id).intro.duration).toBe(1);
    await user.keyboard('{Enter}');
    expect(clipOf(clip.id).intro.duration).toBe(0.5);

    history.undo();
    expect(clipOf(clip.id).intro.duration).toBe(1);
    history.undo();
    expect(clipOf(clip.id).intro.kind).toBe('write');
  });

  /* A field keeps the focus when the button goes down on an edge of the clip (the press is
   * prevented), so Enter in it, or a key in the Track select, can come during the trim. */
  describe('the Timing fields while a trim of the clip is still held', () => {
    const errors = () =>
      validateProject(useProjectStore.getState().project)
        .filter((issue) => issue.severity === 'error')
        .map((issue) => issue.code);

    async function openTiming(): Promise<{ clip: Clip; other: Clip }> {
      const scene = load();
      useUiStore.setState({ selection: { kind: 'clips', ids: [scene.clip.id] } });
      useAnimationsTab.setState({ tab: 'timing' });
      render(<AnimationsPanel />);
      return scene;
    }
    /** The end of the clip dragged to `end`, the button still held. */
    const trimTo = (end: number) => {
      const gesture = history.beginGesture();
      act(() =>
        gesture.update((draft) => {
          draft.clips[0]!.end = end;
        }),
      );
      return gesture;
    };

    it('Start is clamped to the clip the trim leaves, not to the one it showed', async () => {
      const { clip } = await openTiming();
      const user = userEvent.setup();
      const start = screen.getByTestId('clip-start');
      await user.clear(start);
      await user.type(start, '8');
      const gesture = trimTo(12);
      await user.keyboard('{Enter}');
      expect(gesture.active).toBe(false);
      // The clip ends at 6 s again: a start of 8 s would leave it with no length.
      expect(clipOf(clip.id).end).toBe(6);
      expect(clipOf(clip.id).start).toBeLessThan(6);
      expect(errors()).toEqual([]);
    });

    it('End is clamped the same way', async () => {
      const { clip } = await openTiming();
      const user = userEvent.setup();
      const end = screen.getByTestId('clip-end');
      await user.clear(end);
      await user.type(end, '0.5');
      // The start dragged to the left edge of the scene: 0.5 s would then be a valid end.
      const gesture = history.beginGesture();
      act(() =>
        gesture.update((draft) => {
          draft.clips[0]!.start = 0;
        }),
      );
      await user.keyboard('{Enter}');
      expect(gesture.active).toBe(false);
      expect(clipOf(clip.id).start).toBe(1);
      expect(clipOf(clip.id).end).toBeGreaterThan(1);
      expect(errors()).toEqual([]);
    });

    it('Track takes the clip only where the clip the trim leaves fits', async () => {
      const { clip, other } = await openTiming();
      const user = userEvent.setup();
      // Trimmed to half a second, the clip would fit before the other one, on its track.
      const gesture = trimTo(1.5);
      await user.selectOptions(screen.getByTestId('clip-track'), other.trackId);
      expect(gesture.active).toBe(false);
      expect(clipOf(clip.id)).toMatchObject({ trackId: clip.trackId, start: 1, end: 6 });
      expect(screen.getByText('That track is occupied during this clip.')).toBeInTheDocument();
      expect(errors()).toEqual([]);
    });
  });

  /* The same for a drag in the preview: a field of the clip's place keeps the focus while the
   * formula is dragged, and a check box takes Space. What they start from is the clip the drag
   * is given up on, not the one it showed. */
  describe('the fields of a place while a drag in the preview is still held', () => {
    /** A clip at the origin with a tween that sets no place (the first) and one that goes to
     * [1, 1]; its Timing tab is open. */
    async function openPlace(): Promise<{ clip: Clip; plain: TweenAction; placed: TweenAction }> {
      const project = createEmptyProject();
      const formula = createFormula({ name: 'alpha' });
      project.formulas.push(formula);
      const clip = createClip(formula.id, project.tracks[0]!.id, 1, 6);
      const plain = createTween(2, 0.5, { opacity: 0.5 });
      const placed = createTween(3, 0.5, { position: [1, 1] });
      clip.actions.push(plain, placed);
      project.clips.push(clip);
      loadProject(project);
      useUiStore.setState({ selection: { kind: 'clips', ids: [clip.id] } });
      useAnimationsTab.setState({ tab: 'timing' });
      render(<AnimationsPanel />);
      return { clip, plain, placed };
    }
    /** What a drag wrote so far, the button still held. */
    const held = (write: (clip: Clip) => void) => {
      const gesture = history.beginGesture();
      act(() => gesture.update((draft) => write(draft.clips[0]!)));
      return gesture;
    };
    /** The formula dragged at the start of the clip: to [2, 3], twice its size, turned 30°. */
    const dragged = () =>
      held((clip) => {
        Object.assign(clip.initial, { position: [2, 3], scale: 2, rotation: 30 });
      });
    const tweenOf = (clipId: string, id: string) =>
      clipOf(clipId).actions.find((a) => a.id === id) as TweenAction;

    it.each([
      ['x', [5, 0]],
      ['y', [0, 5]],
    ] as const)(
      'Initial %s keeps the other coordinate of the clip the drag leaves',
      async (axis, to) => {
        const { clip } = await openPlace();
        const user = userEvent.setup();
        const field = screen.getByTestId(`initial-${axis}`);
        await user.clear(field);
        await user.type(field, '5');
        const gesture = dragged();
        await user.keyboard('{Enter}');
        expect(gesture.active).toBe(false);
        expect(clipOf(clip.id).initial).toMatchObject({ position: to, scale: 1, rotation: 0 });
      },
    );

    it.each([
      ['x', [5, 1]],
      ['y', [1, 5]],
    ] as const)(
      'X and Y of a tween: %s keeps the other of the tween the drag leaves',
      async (axis, to) => {
        const { clip, placed } = await openPlace();
        const user = userEvent.setup();
        const field = screen.getByTestId(`tween-${placed.id}-position-${axis}`);
        await user.clear(field);
        await user.type(field, '5');
        // The formula dragged at the end of that tween: the drag writes the tween's target.
        const gesture = held((draft) => {
          (draft.actions[1] as TweenAction).to.position = [2, 3];
        });
        await user.keyboard('{Enter}');
        expect(gesture.active).toBe(false);
        expect(tweenOf(clip.id, placed.id).to.position).toEqual(to);
      },
    );

    it.each([
      ['position', [0, 0]],
      ['scale', 1],
      ['rotation', 0],
    ] as const)(
      'a tween field ticked starts from the clip the drag leaves: %s',
      async (field, from) => {
        const { clip, plain } = await openPlace();
        const user = userEvent.setup();
        const gesture = dragged();
        await user.click(screen.getByTestId(`tween-${plain.id}-${field}-on`));
        expect(gesture.active).toBe(false);
        expect(tweenOf(clip.id, plain.id).to[field]).toEqual(from);
        expect(clipOf(clip.id).initial).toMatchObject({ position: [0, 0], scale: 1, rotation: 0 });
      },
    );
  });

  it('names the fields whose visible label is blank', async () => {
    const { clip } = load();
    const user = userEvent.setup();
    useUiStore.setState({ selection: { kind: 'clips', ids: [clip.id] } });
    render(<AnimationsPanel />);
    await user.click(screen.getByTestId('animations-tab-timing'));
    expect(screen.getByRole('slider', { name: 'Opacity' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Opacity value' })).toBeInTheDocument();
    expect(screen.getByLabelText('Colour override value')).toHaveAttribute('type', 'color');
  });

  it('edits the tween targets and shows the validation issues of the clip', async () => {
    const { clip } = load();
    const user = userEvent.setup();
    useUiStore.setState({ selection: { kind: 'clips', ids: [clip.id] } });
    render(<AnimationsPanel />);
    await user.click(screen.getByTestId('animations-tab-timing'));
    const tween = clipOf(clip.id).actions[0]!;
    const rotation = screen.getByTestId(`tween-${tween.id}-rotation`);
    await user.clear(rotation);
    await user.type(rotation, '120{Enter}');
    expect((clipOf(clip.id).actions[0] as TweenAction).to.rotation).toBe(120);

    await user.click(screen.getByTestId(`tween-${tween.id}-position-on`));
    expect((clipOf(clip.id).actions[0] as TweenAction).to.position).toEqual([0, 0]);

    // Make the clip invalid (intro + outro longer than the clip): the panel reports it.
    useProjectStore.getState().update((d) => {
      d.clips[0]!.end = 1.5;
    });
    const issues = await screen.findByTestId('clip-issues');
    expect(within(issues).getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});
