import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createBraceFormula,
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createTrack,
  defaultIntro,
  type Clip,
} from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import { useNoticeStore } from '../../project/noticeStore';
import {
  clearStartHidden,
  leftOutGlyphs,
  setStartsEmpty,
  startHiddenLine,
  startHiddenReason,
} from '../clipEdit';
import { IDLE_INTRO_HINT, PhaseEditor, STARTS_EMPTY_HINT } from '../PhaseEditor';

/** A formula's clip with a Write intro, and a brace's clip. */
function load(): { clip: Clip; brace: Clip } {
  const project = createEmptyProject();
  const formula = createFormula({ name: 'alpha' });
  const under = createBraceFormula({ name: 'under' });
  project.formulas.push(formula, under);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 4, {
    intro: defaultIntro('write'),
  });
  const brace = createClip(under.id, project.tracks[1]!.id, 0, 4);
  project.clips.push(clip, brace);
  loadProject(project);
  return { clip, brace };
}

const clipOf = (id: string) => useProjectStore.getState().project.clips.find((c) => c.id === id)!;

function Intro({ clipId }: { clipId: string }) {
  const clip = useProjectStore((s) => s.project.clips.find((c) => c.id === clipId));
  return clip ? <PhaseEditor clip={clip} phase="intro" /> : null;
}

afterEach(() => loadProject(createEmptyProject()));

describe('setStartsEmpty', () => {
  it('marks the clip, and takes the mark off without leaving the field', () => {
    const { clip } = load();
    const copy = structuredClone(clip);
    setStartsEmpty(copy, true);
    expect(copy.startsEmpty).toBe(true);
    expect(copy.intro).toEqual(clip.intro);
    setStartsEmpty(copy, false);
    expect('startsEmpty' in copy).toBe(false);
  });
});

describe('the Starts empty box of the Intro section', () => {
  it('makes the clip start empty in one undo step, and says what is left of the intro', async () => {
    const { clip } = load();
    const user = userEvent.setup();
    render(<Intro clipId={clip.id} />);
    const box = screen.getByTestId('clip-starts-empty');
    expect(box).not.toBeChecked();
    expect(screen.getByTestId('clip-starts-empty-hint')).toHaveTextContent(STARTS_EMPTY_HINT);
    expect(screen.getByTestId('clip-starts-empty-hint')).not.toHaveTextContent(IDLE_INTRO_HINT);

    await user.click(box);
    expect(clipOf(clip.id).startsEmpty).toBe(true);
    expect(clipOf(clip.id).intro.kind).toBe('write');
    expect(box).toBeChecked();
    expect(screen.getByTestId('clip-starts-empty-hint')).toHaveTextContent(IDLE_INTRO_HINT);

    history.undo();
    expect('startsEmpty' in clipOf(clip.id)).toBe(false);
    history.redo();
    await user.click(screen.getByTestId('clip-starts-empty'));
    expect('startsEmpty' in clipOf(clip.id)).toBe(false);
  });

  it('has nothing to add about an intro of kind None', async () => {
    const { clip } = load();
    useProjectStore.getState().update((draft) => {
      const c = draft.clips.find((x) => x.id === clip.id)!;
      c.intro = defaultIntro('none');
      c.startsEmpty = true;
    });
    render(<Intro clipId={clip.id} />);
    expect(screen.getByTestId('clip-starts-empty')).toBeChecked();
    expect(screen.getByTestId('clip-starts-empty-hint')).not.toHaveTextContent(IDLE_INTRO_HINT);
  });

  it('shows on a brace that a file made start empty, to untick it', async () => {
    const { brace } = load();
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === brace.id)!.startsEmpty = true;
    });
    const user = userEvent.setup();
    render(<Intro clipId={brace.id} />);
    const box = screen.getByTestId('clip-starts-empty');
    expect(box).toBeChecked();
    await user.click(box);
    expect('startsEmpty' in clipOf(brace.id)).toBe(false);
    // Unticked, a brace has no such box any more.
    expect(screen.queryByTestId('clip-starts-empty')).toBeNull();
  });

  it('is not offered for a brace, nor in the Outro section', () => {
    const { clip, brace } = load();
    const { unmount } = render(<Intro clipId={brace.id} />);
    expect(screen.queryByTestId('clip-starts-empty')).toBeNull();
    unmount();
    render(<PhaseEditor clip={clipOf(clip.id)} phase="outro" />);
    expect(screen.queryByTestId('clip-starts-empty')).toBeNull();
  });
});

describe('the glyphs a clip leaves out of its intro', () => {
  it('are said in the singular and in the plural, with the reason', () => {
    expect(startHiddenLine(1)).toBe('1 glyph stays out of the intro');
    expect(startHiddenLine(3)).toBe('3 glyphs stay out of the intro');
    expect(startHiddenReason([4])).toBe(
      'Glyph 4: it had not come on screen yet where this clip was split, so its intro leaves it out.',
    );
    expect(startHiddenReason([7, 3, 4])).toBe(
      'Glyphs 3, 4 and 7: they had not come on screen yet where this clip was split, so its intro leaves them out.',
    );
    // By their labels where the formula's render gives them.
    const labels = ['a', '+', 'b', '=', 'c'];
    expect(startHiddenReason([4, 3], (glyph) => labels[glyph])).toBe(
      'Glyphs = (3) and c (4): they had not come on screen yet where this clip was split, so its intro leaves them out.',
    );
  });

  it('are those of the list that the formula has and does not hide itself, once each', () => {
    const formula = { hiddenGlyphs: [1], snapshot: { glyphs: new Array(5).fill({}) } } as never;
    expect(leftOutGlyphs({ startHidden: [4, 1, 3, 3, 9] }, formula)).toEqual([3, 4]);
    expect(leftOutGlyphs({ startHidden: [4, 9] }, undefined)).toEqual([4, 9]);
    expect(leftOutGlyphs({}, formula)).toEqual([]);
  });

  it('come back when the list is taken off, without leaving the field', () => {
    const { clip } = load();
    const copy = structuredClone(clip);
    copy.startHidden = [1, 2];
    clearStartHidden(copy, undefined);
    expect('startHidden' in copy).toBe(false);
    expect(copy.intro).toEqual(clip.intro);
  });

  it('stay in the list when the formula hides them: shown there again, they are still out', () => {
    const { clip } = load();
    const copy = structuredClone(clip);
    copy.startHidden = [4, 1, 2];
    clearStartHidden(copy, { hiddenGlyphs: [2, 4], snapshot: null });
    expect(copy.startHidden).toEqual([2, 4]);
  });
});

describe('the line of the Intro section about the glyphs left out', () => {
  const leaveOut = (clipId: string, glyphs: number[]) =>
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === clipId)!.startHidden = glyphs;
    });

  it('is not there for a clip that leaves none out', () => {
    const { clip } = load();
    render(<Intro clipId={clip.id} />);
    expect(screen.queryByTestId('clip-start-hidden')).toBeNull();
  });

  it('says how many there are, and its button brings them back in one undo step', async () => {
    const { clip } = load();
    leaveOut(clip.id, [3, 4]);
    const user = userEvent.setup();
    render(<Intro clipId={clip.id} />);
    const line = screen.getByTestId('clip-start-hidden');
    expect(line).toHaveTextContent('2 glyphs stay out of the intro');
    expect(line.querySelector('p')).toHaveAttribute('title', startHiddenReason([3, 4]));
    const button = screen.getByTestId('clip-start-hidden-clear');
    expect(button).toHaveTextContent('Bring them back');
    // The button, which the keyboard reaches, says which glyphs and what it does.
    expect(button).toHaveAttribute(
      'title',
      `${startHiddenReason([3, 4])} The intro brings them in again, as the other glyphs.`,
    );

    await user.click(button);
    expect('startHidden' in clipOf(clip.id)).toBe(false);
    expect(screen.queryByTestId('clip-start-hidden')).toBeNull();
    history.undo();
    expect(clipOf(clip.id).startHidden).toEqual([3, 4]);
  });

  it('speaks of one glyph as one', () => {
    const { clip } = load();
    leaveOut(clip.id, [2]);
    render(<Intro clipId={clip.id} />);
    expect(screen.getByTestId('clip-start-hidden')).toHaveTextContent(
      '1 glyph stays out of the intro',
    );
    const button = screen.getByTestId('clip-start-hidden-clear');
    expect(button).toHaveTextContent('Bring it back');
    expect(button.getAttribute('title')).toMatch(/The intro brings it in again/);
  });

  it('leaves out of the count the glyphs the formula hides, and keeps them in the list', async () => {
    const { clip } = load();
    leaveOut(clip.id, [2, 3, 4]);
    useProjectStore.getState().update((draft) => {
      draft.formulas.find((f) => f.id === clip.formulaId)!.hiddenGlyphs = [3, 4];
    });
    const user = userEvent.setup();
    render(<Intro clipId={clip.id} />);
    expect(screen.getByTestId('clip-start-hidden')).toHaveTextContent(
      '1 glyph stays out of the intro',
    );
    await user.click(screen.getByTestId('clip-start-hidden-clear'));
    expect(clipOf(clip.id).startHidden).toEqual([3, 4]);
    // Nothing is left that the list alone keeps out: no line.
    expect(screen.queryByTestId('clip-start-hidden')).toBeNull();
  });

  it('waits while the clip starts empty, which leaves them all out, and keeps the list', async () => {
    const { clip } = load();
    leaveOut(clip.id, [3, 4]);
    const user = userEvent.setup();
    render(<Intro clipId={clip.id} />);
    await user.click(screen.getByTestId('clip-starts-empty'));
    expect(screen.queryByTestId('clip-start-hidden')).toBeNull();
    expect(clipOf(clip.id).startHidden).toEqual([3, 4]);
    await user.click(screen.getByTestId('clip-starts-empty'));
    expect(screen.getByTestId('clip-start-hidden')).toHaveTextContent('2 glyphs stay out');
  });

  it('shows on a brace that a file gave a list, to take it off; never in the Outro', async () => {
    const { clip, brace } = load();
    leaveOut(brace.id, [0]);
    leaveOut(clip.id, [1]);
    const user = userEvent.setup();
    const { unmount } = render(<Intro clipId={brace.id} />);
    expect(screen.queryByTestId('clip-starts-empty')).toBeNull();
    await user.click(screen.getByTestId('clip-start-hidden-clear'));
    expect('startHidden' in clipOf(brace.id)).toBe(false);
    unmount();
    render(<PhaseEditor clip={clipOf(clip.id)} phase="outro" />);
    expect(screen.queryByTestId('clip-start-hidden')).toBeNull();
  });
});

describe('the intro of a clip whose relation a locked track holds (A6-02)', () => {
  /** `alpha` over [0, 4] with a Write intro of `intro` s, the source of a relation to `beta` on a
   * locked track whose window starts at `start` s (one second long): the window stays where it
   * plays, so the intro may not reach past it. */
  function loadHeld(start: number, intro: number) {
    const project = createEmptyProject();
    const alpha = createFormula({ name: 'alpha' });
    const beta = createFormula({ name: 'beta' });
    project.formulas.push(alpha, beta);
    const locked = createTrack('Locked');
    locked.locked = true;
    project.tracks.push(locked);
    const clip = createClip(alpha.id, project.tracks[0]!.id, 0, 4, {
      intro: intro > 0 ? { ...defaultIntro('write'), duration: intro } : defaultIntro('none'),
    });
    const other = createClip(beta.id, locked.id, 0, 4);
    project.clips.push(clip, other);
    project.relations.push(createRelation(clip.id, other.id, { offset: start, duration: 1 }));
    loadProject(project);
    useNoticeStore.setState({ notices: [] });
    return { clip };
  }
  const offset = () => useProjectStore.getState().project.relations[0]!.offset;

  it('stops where the window starts, typed in or given by another animation', async () => {
    const { clip } = loadHeld(1.5, 0.5);
    const user = userEvent.setup();
    render(<Intro clipId={clip.id} />);
    const field = screen.getByTestId('intro-duration');
    await user.clear(field);
    await user.type(field, '3{Enter}');
    expect(clipOf(clip.id).intro.duration).toBe(1.5);
    // DrawBorderThenFill lasts 2 s by default: here, as long as the window lets it.
    await user.selectOptions(screen.getByTestId('intro-kind'), 'draw_border_then_fill');
    expect(clipOf(clip.id).intro).toMatchObject({ kind: 'draw_border_then_fill', duration: 1.5 });
    expect(offset()).toBe(1.5);
    expect(useNoticeStore.getState().notices).toEqual([]);
  });

  it('is not given when the window leaves it no room, and a notice says why', async () => {
    const { clip } = loadHeld(0.02, 0);
    const user = userEvent.setup();
    render(<Intro clipId={clip.id} />);
    await user.selectOptions(screen.getByTestId('intro-kind'), 'write');
    expect(clipOf(clip.id).intro.kind).toBe('none');
    expect(offset()).toBe(0.02);
    expect(useNoticeStore.getState().notices.map((n) => [n.title, n.message])).toEqual([
      [
        'No room for Write',
        'The relation from “alpha” to “beta” (0.02–1.02 s) leaves the intro of “alpha” no room. Track “Locked” is locked: unlock it on the timeline to create, edit or delete relations of its clips.',
      ],
    ]);
  });
});
