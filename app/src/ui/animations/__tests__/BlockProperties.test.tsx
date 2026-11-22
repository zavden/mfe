import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFormula, toSnapshot } from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import {
  createAppear,
  createBraceFormula,
  createClip,
  createDisappear,
  createEmphasis,
  createEmptyProject,
  createFitTween,
  createFormula,
  createLineFormula,
  createMorph,
  createPartTransform,
  createShapeFormula,
  createTween,
  defaultIntro,
  defaultOutro,
  validateProject,
  type ClipAction,
} from '../../../model';
import { boxSnapshot } from '../../../model/__tests__/fixtures';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { useMorphEditorStore } from '../../morph/morphEditorStore';
import { useNoticeStore } from '../../project/noticeStore';
import { usePathEdit } from '../../preview/pathEdit';
import { useShapeRetarget } from '../../preview/shapeRetarget';
import { AnimationsPanel } from '../AnimationsPanel';
import { useAnimationsTab } from '../animationsTab';
import { editBlock, setBlockGlyphs, setBlockTiming } from '../blockActions';

/* Formula a+b=c (glyphs 0 a, 1 +, 2 b, 3 =, 4 c), hiding 3 and 4 at the start, on a 0–10 s clip
 * with the given blocks; mock-rendered so that the glyph view has glyphs. */
async function setup(actions: ClipAction[]) {
  const project = createEmptyProject();
  const result = await createMockEngine().render({
    kind: 'math',
    latex: 'a+b=c',
    packages: [],
    preamble: '',
    target: 'ce',
    fontSize: 48,
    prefer: 'auto',
  });
  if (!result.ok) throw new Error(result.error.message);
  const formula = createFormula({
    name: 'f1',
    source: 'a+b=c',
    snapshot: toSnapshot(result.render),
    hiddenGlyphs: [3, 4],
  });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 10, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
    actions,
  });
  project.clips.push(clip);
  loadProject(project);
  act(() => {
    useRenderStore.getState().setEntry(formula.id, {
      status: 'ok',
      resolved: resolveFormula(formula, result.render),
      error: null,
    });
  });
  return { clip, formula };
}

const select = (clipId: string, actionId: string) =>
  act(() => useUiStore.getState().select({ kind: 'action', clipId, actionId }));
const block = (id: string) =>
  useProjectStore.getState().project.clips[0]!.actions.find((a) => a.id === id)!;

afterEach(() => {
  useUiStore.setState({ selection: { kind: 'none' } });
  useAnimationsTab.setState({ tab: 'relations' });
  useMorphEditorStore.setState({ request: null });
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
});

describe('the group of a block, in the panel', () => {
  /** A Write of glyph 3 and an Indicate of glyph 0 grouped over [2, 3.5], and a block on its own. */
  async function grouped() {
    const write = { ...createAppear(2, 'write', [3], { duration: 1.5 }), id: 'w', group: 'g' };
    const indicate = {
      ...createEmphasis(2, 'indicate', [0], { duration: 1.5 }),
      id: 'i',
      group: 'g',
    };
    const lone = { ...createPartTransform(6, [1]), id: 'lone' };
    return setup([write, indicate, lone]);
  }
  const groups = () =>
    Object.fromEntries(
      useProjectStore
        .getState()
        .project.clips[0]!.actions.map((a) => [a.id, 'group' in a ? a.group : null]),
    );

  it('lists its members, the one shown held down, and shows another when its key is pressed', async () => {
    const { clip } = await grouped();
    const user = userEvent.setup();
    select(clip.id, 'w');
    render(<AnimationsPanel />);
    const section = screen.getByTestId('block-group-section');
    expect(within(section).getByRole('heading')).toHaveTextContent('Group ×2');
    const members = within(section).getByRole('group', { name: 'Animations of the group' });
    expect(
      within(members)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Write · 1', 'Indicate · 1']);
    expect(screen.getByTestId('block-group-member-w')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('block-group-member-i')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('block-group-member-i')).toHaveAttribute('title', 'Indicate · 0');
    expect(screen.getByTestId('block-name')).toHaveTextContent('Write · 1');

    await user.click(screen.getByTestId('block-group-member-i'));
    expect(useUiStore.getState().selection).toEqual({
      kind: 'action',
      clipId: clip.id,
      actionId: 'i',
    });
    expect(screen.getByTestId('block-name')).toHaveTextContent('Indicate · 1');
    expect(screen.getByTestId('block-effect')).toHaveValue('indicate');
    expect(screen.getByTestId('block-group-member-i')).toHaveAttribute('aria-pressed', 'true');
    // Nothing of the project changed: it is the panel that shows another block.
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('has the timing of the group: a member moved or stretched takes the others along', async () => {
    const { clip } = await grouped();
    const user = userEvent.setup();
    select(clip.id, 'i');
    render(<AnimationsPanel />);
    const start = screen.getByTestId('block-start');
    await user.clear(start);
    await user.type(start, '4{Enter}');
    expect([block('w').start, block('i').start, block('lone').start]).toEqual([4, 4, 6]);
    const duration = screen.getByTestId('block-duration');
    await user.clear(duration);
    await user.type(duration, '1{Enter}');
    expect([block('w').duration, block('i').duration]).toEqual([1, 1]);
    expect(groups()).toMatchObject({ w: 'g', i: 'g' });
    // What is the member's own stays its own.
    await user.selectOptions(screen.getByTestId('block-effect'), 'wiggle');
    expect(block('i')).toMatchObject({ effect: 'wiggle', group: 'g' });
    expect(block('w')).toMatchObject({ kind: 'appear', anim: 'write' });
  });

  it('takes the member out of the group, or undoes the group, in one step each', async () => {
    const third = { ...createPartTransform(2, [1], { duration: 1.5 }), id: 'p', group: 'g' };
    const { clip } = await grouped();
    act(() =>
      useProjectStore.getState().update((draft) => {
        draft.clips[0]!.actions.push(third);
      }),
    );
    useProjectStore.temporal.getState().clear();
    const user = userEvent.setup();
    select(clip.id, 'p');
    render(<AnimationsPanel />);
    expect(
      within(screen.getByTestId('block-group-section')).getByRole('heading'),
    ).toHaveTextContent('Group ×3');
    await user.click(screen.getByTestId('block-group-leave'));
    expect(groups()).toMatchObject({ w: 'g', i: 'g', p: null });
    // The block is still the one shown; it has no group to show any more.
    expect(screen.getByTestId('block-name')).toHaveTextContent('Transform · 1');
    expect(screen.queryByTestId('block-group-section')).toBeNull();
    act(() => history.undo());
    expect(groups()).toMatchObject({ w: 'g', i: 'g', p: 'g' });
    await user.click(screen.getByTestId('block-group-ungroup'));
    expect(groups()).toMatchObject({ w: null, i: null, p: null });
    expect(screen.queryByTestId('block-group-section')).toBeNull();
    act(() => history.undo());
    expect(groups()).toMatchObject({ w: 'g', i: 'g', p: 'g' });
  });

  it('is not shown for a block on its own, and cannot be changed on a locked track', async () => {
    const { clip } = await grouped();
    select(clip.id, 'lone');
    render(<AnimationsPanel />);
    expect(screen.queryByTestId('block-group-section')).toBeNull();
    act(() =>
      useProjectStore.getState().update((draft) => {
        draft.tracks[0]!.locked = true;
      }),
    );
    select(clip.id, 'w');
    expect(screen.getByTestId('block-group-leave')).toBeDisabled();
    expect(screen.getByTestId('block-group-ungroup')).toBeDisabled();
    // Its members can still be looked at.
    expect(screen.getByTestId('block-group-member-i')).toBeEnabled();
  });
});

describe('BlockProperties', () => {
  it("shows an Emphasis block's effect and settings, and runs another effect as one undo step", async () => {
    const indicate = createEmphasis(2, 'indicate', [0, 1]);
    const { clip } = await setup([indicate]);
    const user = userEvent.setup();
    select(clip.id, indicate.id);
    render(<AnimationsPanel />);
    expect(screen.getByTestId('block-name')).toHaveTextContent('Indicate · 2');
    expect(screen.getByTestId('block-effect')).toHaveValue('indicate');
    expect(screen.getByTestId('block-emphasis-scale')).toHaveValue('1.2');
    expect(
      within(screen.getByTestId('block-easing'))
        .getAllByRole('option')
        .map((o) => o.getAttribute('value')),
    ).toEqual(['there_and_back', 'there_and_back_with_pause']);

    await user.selectOptions(screen.getByTestId('block-effect'), 'circumscribe');
    expect(block(indicate.id)).toMatchObject({
      effect: 'circumscribe',
      easing: 'smooth',
      buff: 0.1,
      glyphs: [0, 1],
      start: 2,
    });
    expect(screen.getByTestId('block-name')).toHaveTextContent('Circumscribe · 2');
    expect(screen.getByTestId('block-emphasis-buff')).toHaveValue('0.1');
    expect(screen.getByTestId('block-emphasis-time-width')).toHaveValue('0.3');
    await user.selectOptions(screen.getByTestId('block-effect'), 'flash');
    expect(screen.queryByTestId('block-easing')).toBeNull();
    history.undo();
    expect(block(indicate.id)).toMatchObject({ effect: 'circumscribe' });
  });

  it('names the formula and the block, and changes the animation as one undo step', async () => {
    const write = createAppear(2, 'write', [3, 4], { duration: 1.5 });
    const { clip } = await setup([write]);
    const user = userEvent.setup();
    select(clip.id, write.id);
    render(<AnimationsPanel />);
    expect(screen.getByTestId('block-title')).toHaveTextContent('f1');
    expect(screen.getByTestId('block-name')).toHaveTextContent('Write · 2');
    const anim = screen.getByTestId('block-anim');
    expect(anim).toHaveValue('appear:write');
    expect(
      within(anim)
        .getAllByRole('group')
        .map((g) => g.getAttribute('label')),
    ).toEqual(['Appear', 'Disappear']);

    await user.selectOptions(anim, 'disappear:fade_out');
    expect(block(write.id)).toMatchObject({
      kind: 'disappear',
      anim: 'fade_out',
      start: 2,
      duration: 1.5,
      glyphs: [3, 4],
    });
    expect(screen.getByTestId('block-name')).toHaveTextContent('FadeOut · 2');
    history.undo();
    expect(block(write.id)).toMatchObject({ kind: 'appear', anim: 'write' });
  });

  it('shows fade settings only for FadeIn and FadeOut and edits them', async () => {
    const fade = createAppear(2, 'fade_in', 'all', { duration: 1 });
    const { clip } = await setup([fade]);
    const user = userEvent.setup();
    select(clip.id, fade.id);
    render(<AnimationsPanel />);
    const shiftY = screen.getByTestId('block-shift-y');
    await user.clear(shiftY);
    await user.type(shiftY, '-2{Enter}');
    expect(block(fade.id)).toMatchObject({ shift: [0, -2] });
    const scale = screen.getByTestId('block-scale');
    await user.clear(scale);
    await user.type(scale, '3{Enter}');
    expect(block(fade.id)).toMatchObject({ scale: 3 });
    await user.selectOptions(screen.getByTestId('block-anim'), 'appear:create');
    expect(screen.queryByTestId('block-shift-y')).toBeNull();
  });

  it('clamps start and duration to the free time around the block', async () => {
    const before = createDisappear(1, 'fade_out', [1], { duration: 1 });
    const mine = createAppear(4, 'write', [1], { duration: 1 });
    const after = createDisappear(7, 'fade_out', [1], { duration: 1 });
    const { clip } = await setup([before, mine, after]);
    const user = userEvent.setup();
    select(clip.id, mine.id);
    render(<AnimationsPanel />);
    const start = screen.getByTestId('block-start');
    expect(start).toHaveValue('4');
    await user.clear(start);
    await user.type(start, '9{Enter}');
    expect(block(mine.id)).toMatchObject({ start: 6, duration: 1 });
    await user.clear(start);
    await user.type(start, '0{Enter}');
    expect(block(mine.id).start).toBe(2);
    const duration = screen.getByTestId('block-duration');
    await user.clear(duration);
    await user.type(duration, '50{Enter}');
    expect(block(mine.id).duration).toBe(5);
    expect(start).toHaveValue('2');
  });

  it('lets Manim choose the lag ratio, or takes a number', async () => {
    const write = createAppear(2, 'write', [0, 1, 2], { duration: 1 });
    const { clip } = await setup([write]);
    const user = userEvent.setup();
    select(clip.id, write.id);
    render(<AnimationsPanel />);
    const mode = screen.getByTestId('block-lag-mode');
    expect(mode).toHaveValue('auto');
    expect(within(mode).getByRole('option', { name: /Default \(0\.2\)/ })).toBeInTheDocument();
    await user.selectOptions(mode, 'custom');
    expect(block(write.id)).toMatchObject({ lagRatio: 0.2 });
    const value = screen.getByTestId('block-lag');
    await user.clear(value);
    await user.type(value, '0.5{Enter}');
    expect(block(write.id)).toMatchObject({ lagRatio: 0.5 });
    await user.selectOptions(mode, 'auto');
    expect(block(write.id)).toMatchObject({ lagRatio: null });
  });

  it('picks glyphs by click, Ctrl and the quick buttons, dims what is off screen', async () => {
    const write = createAppear(2, 'write', 'all', { duration: 1 });
    const { clip } = await setup([write]);
    const user = userEvent.setup();
    select(clip.id, write.id);
    render(<AnimationsPanel />);
    const glyph = (i: number) => screen.getByTestId(`block-glyph-${i}`);
    // 'all': every glyph selected, "All" pressed; every glyph waits for the block, so none is on
    // screen before it: all faint.
    expect(screen.getByTestId('block-glyphs-all')).toHaveAttribute('aria-pressed', 'true');
    expect([0, 1, 2, 3, 4].map((i) => glyph(i).getAttribute('data-selected'))).toEqual(
      Array(5).fill('true'),
    );
    expect([0, 1, 2, 3, 4].map((i) => glyph(i).getAttribute('data-dimmed'))).toEqual(
      Array(5).fill('true'),
    );

    await user.click(glyph(2));
    expect(block(write.id)).toMatchObject({ glyphs: [2] });
    // Now 2 waits for the block, 0 and 1 come in with the intro, 3 and 4 are hidden at the start.
    expect([0, 1, 2, 3, 4].map((i) => glyph(i).getAttribute('data-dimmed'))).toEqual([
      'false',
      'false',
      'true',
      'true',
      'true',
    ]);
    await user.keyboard('{Control>}');
    await user.click(glyph(0));
    await user.keyboard('{/Control}');
    expect(block(write.id)).toMatchObject({ glyphs: [0, 2] });
    expect(screen.getByTestId('block-glyphs-summary')).toHaveTextContent('2 glyphs: 0, 2');
    expect(screen.getByTestId('block-name')).toHaveTextContent('Write · 2');

    await user.click(screen.getByTestId('block-glyphs-off-screen'));
    expect(block(write.id)).toMatchObject({ glyphs: [0, 2, 3, 4] }); // 1 alone is on screen
    await user.click(screen.getByTestId('block-glyphs-on-screen'));
    expect(block(write.id)).toMatchObject({ glyphs: [1] });
    await user.click(screen.getByTestId('block-glyphs-hidden'));
    expect(block(write.id)).toMatchObject({ glyphs: [3, 4] });
    await user.click(screen.getByTestId('block-glyphs-all'));
    expect(block(write.id)).toMatchObject({ glyphs: 'all' });

    history.undo(); // back from 'all' to [3, 4]
    expect(block(write.id)).toMatchObject({ glyphs: [3, 4] });
    history.redo();
    expect(block(write.id)).toMatchObject({ glyphs: 'all' });
  });

  it('draws as faint what is not on screen when this block starts', async () => {
    const write = createAppear(2, 'write', [3, 4], { duration: 1 });
    const out = createDisappear(5, 'fade_out', 'all', { duration: 1 });
    const { clip } = await setup([write, out]);
    select(clip.id, out.id);
    render(<AnimationsPanel />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`block-glyph-${i}`)).toHaveAttribute('data-dimmed', 'false');
    }
    select(clip.id, write.id);
    expect(screen.getByTestId('block-glyph-3')).toHaveAttribute('data-dimmed', 'true');
  });

  it('picks glyphs from the keyboard with the chips under the drawing', async () => {
    const appear = createAppear(1, 'write', [3]);
    const { clip } = await setup([appear]);
    const user = userEvent.setup();
    select(clip.id, appear.id);
    render(<AnimationsPanel />);
    const chip = screen.getByRole('button', { name: /^Glyph 0:/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    chip.focus();
    await user.keyboard('{Enter}');
    expect(block(appear.id)).toMatchObject({ glyphs: [0, 3] });
    expect(screen.getByRole('button', { name: /^Glyph 0:/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('gives every field a name, also those with a blank or symbol label', async () => {
    const tween = createTween(2, 1, { rotation: 30, scale: 2, opacity: 0.5, color: '#FF0000' });
    const part = createPartTransform(5, [1], { opacity: 0.5, color: '#FF0000' });
    const { clip } = await setup([tween, part]);
    select(clip.id, tween.id);
    render(<AnimationsPanel />);
    for (const name of ['Scale factor', 'Rotation in degrees', 'Opacity value']) {
      expect(screen.getByRole('textbox', { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Colour value')).toHaveAttribute('type', 'color');
    select(clip.id, part.id);
    expect(screen.getByRole('slider', { name: 'Opacity' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Opacity value' })).toBeInTheDocument();
    expect(screen.getByLabelText('Colour')).toHaveAttribute('type', 'color');
  });

  it.each([
    ['shape', createShapeFormula],
    ['brace', createBraceFormula],
  ] as const)(
    'the Transform of a %s has no whole / part switch and names the object',
    (noun, create) => {
      const project = createEmptyProject();
      const object = create({ name: 'o1' });
      const tween = createTween(2, 1, { rotation: 30 });
      project.formulas.push(object);
      const clip = createClip(object.id, project.tracks[0]!.id, 0, 10, {
        intro: defaultIntro('none'),
        outro: defaultOutro('none'),
        actions: [tween],
      });
      project.clips.push(clip);
      loadProject(project);
      select(clip.id, tween.id);
      render(<AnimationsPanel />);
      expect(screen.getByTestId(`tween-${tween.id}-rotation`)).toBeInTheDocument();
      expect(screen.queryByTestId('block-kind-tween')).toBeNull();
      expect(screen.queryByTestId('block-kind-transform')).toBeNull();
      expect(screen.getByTestId('block-tween-hint')).toHaveTextContent(
        `Transform: the ${noun} moves to a new state (a keyframe).`,
      );
      expect(screen.getByTestId('block-properties')).not.toHaveTextContent(/formula/i);
    },
  );

  /** A shape `s1` of `fields` on a clip over [0, 10) with one Transform, selected, in the panel. */
  function shapeTween(fields: Parameters<typeof createShapeFormula>[0] = {}) {
    const project = createEmptyProject();
    const object = createShapeFormula({ name: 's1', color: '#FF0000', ...fields });
    const tween = createTween(2, 1, {});
    project.formulas.push(object);
    const clip = createClip(object.id, project.tracks[0]!.id, 0, 10, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
      actions: [tween],
    });
    project.clips.push(clip);
    loadProject(project);
    select(clip.id, tween.id);
    render(<AnimationsPanel />);
    const to = () => (block(tween.id) as { to: Record<string, unknown> }).to;
    return { id: `tween-${tween.id}`, to };
  }

  it('the Transform of a box sets its paint: each field ticked starts from what the box has', async () => {
    const user = userEvent.setup();
    const { id, to } = shapeTween({
      style: { strokeWidth: 6, strokeOpacity: 0.8, fillOpacity: 0.3 },
    });
    // Nothing is set until it is ticked.
    for (const field of ['stroke-width', 'stroke-opacity', 'fill-opacity', 'fill-color']) {
      expect(screen.getByTestId(`${id}-${field}-on`)).not.toBeChecked();
      expect(screen.queryByTestId(`${id}-${field}`)).toBeNull();
    }
    await user.click(screen.getByTestId(`${id}-stroke-width-on`));
    expect(to()).toEqual({ strokeWidth: 6 });
    const width = screen.getByTestId(`${id}-stroke-width`);
    await user.clear(width);
    await user.type(width, '10{Enter}');
    await user.click(screen.getByTestId(`${id}-stroke-opacity-on`));
    await user.click(screen.getByTestId(`${id}-fill-opacity-on`));
    expect(to()).toEqual({ strokeWidth: 10, strokeOpacity: 0.8, fillOpacity: 0.3 });
    const fill = screen.getByTestId(`${id}-fill-opacity`);
    await user.clear(fill);
    await user.type(fill, '2{Enter}');
    expect(to().fillOpacity).toBe(1); // an opacity, as the format requires
    // The fill's colour starts from the one it has: the stroke's, while it has none of its own.
    await user.click(screen.getByTestId(`${id}-fill-color-on`));
    expect(to().fillColor).toBe('#FF0000');
    expect(screen.getByLabelText('Fill colour value')).toHaveAttribute('type', 'color');
    // Unticked, the field is left as it was: the Transform no longer names it.
    await user.click(screen.getByTestId(`${id}-stroke-width-on`));
    await user.click(screen.getByTestId(`${id}-fill-color-on`));
    expect(to()).toEqual({ strokeOpacity: 0.8, fillOpacity: 1 });
  });

  it('starts a fill colour from the box’s own, and the colour from the box’s', async () => {
    const user = userEvent.setup();
    const { id, to } = shapeTween({ fillColor: '#00FF00' });
    await user.click(screen.getByTestId(`${id}-fill-color-on`));
    await user.click(screen.getByTestId(`${id}-color-on`));
    expect(to()).toEqual({ fillColor: '#00FF00', color: '#FF0000' });
  });

  it('a Transform that carries the shape elsewhere shows what it goes to, not a place to set', async () => {
    const user = userEvent.setup();
    const project = createEmptyProject();
    const formula = createFormula({ name: 'f1', source: 'a+b' });
    const object = createShapeFormula({ name: 's1' });
    project.formulas.push(formula, object);
    const target = createClip(formula.id, project.tracks[0]!.id, 0, 10);
    const tween = createFitTween(2, 1, { clipId: target.id, glyphs: [0, 2] });
    const clip = createClip(object.id, project.tracks[1]!.id, 0, 10, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
      actions: [tween],
    });
    project.clips.push(target, clip);
    loadProject(project);
    select(clip.id, tween.id);
    render(<AnimationsPanel />);
    const id = `tween-${tween.id}`;
    expect(screen.getByTestId('block-tween-hint')).toHaveTextContent(
      'Transform: the shape goes to surround other glyphs',
    );
    expect(screen.getByTestId(`${id}-fit-target`)).toHaveTextContent('f1 · glyphs 0, 2');
    // Its place, size and turn are the target's: no such fields; its appearance is its own.
    for (const field of ['position', 'scale', 'rotation', 'flip-x', 'flip-y']) {
      expect(screen.queryByTestId(`${id}-${field}-on`)).toBeNull();
    }
    for (const field of ['opacity', 'color', 'stroke-width', 'fill-color']) {
      expect(screen.getByTestId(`${id}-${field}-on`)).toBeInTheDocument();
    }
    // Pick again… starts the choice in the preview, for this Transform.
    await user.click(screen.getByTestId(`${id}-retarget`));
    expect(useShapeRetarget.getState().request).toEqual({ clipId: clip.id, actionId: tween.id });
    act(() => useShapeRetarget.getState().cancel());
  });

  it('a line and a cross have a stroke to repaint and no fill', () => {
    const { id } = shapeTween({ shape: 'underline' });
    expect(screen.getByTestId(`${id}-stroke-width-on`)).toBeInTheDocument();
    expect(screen.getByTestId(`${id}-stroke-opacity-on`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${id}-fill-opacity-on`)).toBeNull();
    expect(screen.queryByTestId(`${id}-fill-color-on`)).toBeNull();
  });

  it('keeps the tween editor; a part has its own fields and can become a keyframe', async () => {
    const tween = createTween(2, 1, { rotation: 30 });
    const part = createPartTransform(5, [1, 2], { shift: [1, 0] });
    const { clip } = await setup([tween, part]);
    const user = userEvent.setup();
    select(clip.id, tween.id);
    render(<AnimationsPanel />);
    const rotation = screen.getByTestId(`tween-${tween.id}-rotation`);
    await user.clear(rotation);
    await user.type(rotation, '75{Enter}');
    expect(block(tween.id)).toMatchObject({ to: { rotation: 75 } });
    expect(screen.queryByTestId('block-glyph-picker')).toBeNull();
    // A formula has no paint of a shape to set.
    expect(screen.queryByTestId(`tween-${tween.id}-stroke-width-on`)).toBeNull();
    expect(screen.queryByTestId(`tween-${tween.id}-fill-color-on`)).toBeNull();
    expect(screen.getByTestId('block-kind-tween')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('block-tween-hint')).toHaveTextContent(
      'Transform: the whole formula moves to a new state (a keyframe).',
    );

    select(clip.id, part.id);
    expect(screen.getByTestId('block-name')).toHaveTextContent('Transform · 2');
    expect(screen.getByTestId('block-part-shift-x')).toHaveValue('1');
    expect(screen.queryByTestId('block-lag-mode')).toBeNull();
    expect(screen.getByTestId('block-glyph-picker')).toBeInTheDocument();
    const scale = screen.getByTestId('block-part-scale');
    await user.clear(scale);
    await user.type(scale, '0{Enter}');
    expect(block(part.id)).toMatchObject({ scale: 0.05 }); // positive, as the format requires
    await user.clear(scale);
    await user.type(scale, '2{Enter}');
    await user.click(screen.getByTestId('block-part-opacity-on'));
    expect(block(part.id)).toMatchObject({ scale: 2, opacity: 1, color: null });
    // Whole formula ↔ part: the block keeps its id and time, the panel follows.
    await user.click(screen.getByTestId('block-kind-tween'));
    expect(block(part.id)).toMatchObject({ kind: 'tween', start: 5 });
    expect(screen.getByTestId(`tween-${part.id}-rotation`)).toBeInTheDocument();
    await user.click(screen.getByTestId('block-kind-transform'));
    expect(block(part.id)).toMatchObject({ kind: 'transform', start: 5, glyphs: [] });
    expect(screen.getByTestId('block-issues')).toHaveTextContent('animates no glyph');
  });

  it('lists only the problems of this block, and goes back to the clip', async () => {
    const out = createDisappear(2, 'fade_out', [1], { duration: 2 });
    const back = createAppear(3, 'write', [1], { duration: 1 }); // brings 1 back mid-fade
    const other = createAppear(8, 'write', [1], { duration: 1 }); // 1 is back already: warning
    const { clip } = await setup([out, back, other]);
    const user = userEvent.setup();
    select(clip.id, back.id);
    render(<AnimationsPanel />);
    const issues = screen.getByTestId('block-issues');
    expect(within(issues).getAllByRole('listitem')).toHaveLength(1);
    expect(issues).toHaveTextContent('at the same time');
    select(clip.id, other.id);
    expect(screen.getByTestId('block-issues')).toHaveTextContent('leaves out glyph 1');
    await user.click(screen.getByTestId('block-select-clip'));
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [clip.id] });
    expect(screen.getByTestId('clip-properties')).toBeInTheDocument();
  });

  it('a block of an arrow says it takes all of it: no glyph picker, no split, and a part is made whole', async () => {
    // A FadeOut of the shaft alone, as a file may have it, and a Circumscribe of all the arrow.
    const project = createEmptyProject();
    const arrow = createLineFormula({
      name: 'l1',
      line: 'arrow',
      snapshot: boxSnapshot(['—', '▸']),
    });
    project.formulas.push(arrow);
    const shaft = createDisappear(1, 'fade_out', [0], { duration: 1 });
    const frame = createEmphasis(3, 'circumscribe', 'all');
    const clip = createClip(arrow.id, project.tracks[0]!.id, 0, 6, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
      actions: [shaft, frame],
    });
    project.clips.push(clip);
    loadProject(project);
    const user = userEvent.setup();
    select(clip.id, frame.id);
    render(<AnimationsPanel />);
    const hint =
      'An arrow is animated whole, its shaft and its tips together, as Manim does: a block takes all of it, and is not split.';
    expect(screen.getByTestId('block-glyphs-whole')).toHaveTextContent(hint);
    for (const id of [
      'block-glyph-picker',
      'block-split-runs',
      'block-split',
      'block-duplicate-others',
      'block-glyphs-all-whole',
    ]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    // The block on a part of it: the error, and the button that gives it all of it.
    select(clip.id, shaft.id);
    expect(screen.getByTestId('block-issues')).toHaveTextContent(
      'is an arrow: a block animates it whole',
    );
    await user.click(screen.getByTestId('block-glyphs-all-whole'));
    expect(block(shaft.id)).toMatchObject({ glyphs: 'all' });
    expect(screen.queryByTestId('block-issues')).toBeNull();
    expect(screen.queryByTestId('block-glyphs-all-whole')).toBeNull();
    history.undo();
    expect(block(shaft.id)).toMatchObject({ glyphs: [0] });
  });

  it('a morph refuses a Default style that gives the project an error, and says why (audit A3-04)', async () => {
    // Over [4, 5.5) one Morph block turns a into =, while another, whose pair inherits Copy,
    // copies a into c (both hidden at the start, they arrive).
    const turn = createMorph(4, {
      duration: 1.5,
      style: 'transform',
      pairs: [{ from: [0], to: [3], style: null }],
    });
    const copy = createMorph(4, {
      duration: 1.5,
      style: 'copy',
      pairs: [{ from: [0], to: [4], style: null }],
    });
    const { clip } = await setup([turn, copy]);
    const errors = () =>
      validateProject(useProjectStore.getState().project).filter((i) => i.severity === 'error');
    expect(errors()).toEqual([]);
    useNoticeStore.getState().clear();
    const user = userEvent.setup();
    select(clip.id, copy.id);
    render(<AnimationsPanel />);
    // Transform would consume a a second time: refused, with the reason.
    await user.selectOptions(screen.getByTestId('block-morph-style'), 'transform');
    expect(block(copy.id)).toMatchObject({ style: 'copy' });
    expect(errors()).toEqual([]);
    expect(useNoticeStore.getState().notices.map((n) => [n.title, n.message])).toEqual([
      [
        'Default style not changed',
        'Transform would give the project an error: The Morph block consumes glyph 0 of "f1", which another pair consumes too. Give the pairs that clash a style of their own in Edit pairs…, or keep the default style.',
      ],
    ]);
    // Fade copy consumes nothing: it is set.
    await user.selectOptions(screen.getByTestId('block-morph-style'), 'fade_copy');
    expect(block(copy.id)).toMatchObject({ style: 'fade_copy' });
    expect(errors()).toEqual([]);
  });

  it('is read-only on a locked track', async () => {
    const write = createAppear(2, 'write', [3], { duration: 1 });
    const { clip } = await setup([write]);
    useProjectStore.getState().update((d) => {
      d.tracks[0]!.locked = true;
    });
    select(clip.id, write.id);
    render(<AnimationsPanel />);
    expect(screen.getByTestId('block-locked')).toBeInTheDocument();
    expect(screen.getByTestId('block-duration')).toBeDisabled();
    expect(screen.getByTestId('block-glyphs-all')).toBeDisabled();
  });

  it('a morph has its style, path arc, pairs and timing, and opens its pair editor', async () => {
    // a → c (copy, the block's style) and + → = (transform, its own).
    const morph = createMorph(4, {
      duration: 1.5,
      pairs: [
        { from: [0], to: [4], style: null },
        { from: [1], to: [3], style: 'transform' },
      ],
    });
    const { clip } = await setup([morph]);
    const user = userEvent.setup();
    select(clip.id, morph.id);
    render(<AnimationsPanel />);
    const name = screen.getByTestId('block-name');
    expect(name).toHaveTextContent('Morph · 2');
    expect(name).toHaveClass('is-morph');
    expect(screen.getByTestId('block-morph-hint')).toHaveTextContent(
      'Targets arrive through the morph and skip the intro.',
    );

    const style = screen.getByTestId('block-morph-style');
    expect(style).toHaveValue('copy');
    expect(
      within(style)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Transform', 'Copy (source stays)', 'Fade transform', 'Fade copy (source stays)']);
    await user.selectOptions(style, 'fade');
    expect(block(morph.id)).toMatchObject({ style: 'fade' });
    history.undo();
    expect(block(morph.id)).toMatchObject({ style: 'copy' });

    const arc = screen.getByTestId('block-morph-path-arc');
    expect(arc).toHaveValue('0');
    await user.clear(arc);
    await user.type(arc, '90{Enter}');
    expect(block(morph.id)).toMatchObject({ pathArc: 90 });
    await user.type(arc, '{ArrowUp}');
    expect(block(morph.id)).toMatchObject({ pathArc: 105 }); // steps of 15°
    await user.clear(arc);
    await user.type(arc, '999{Enter}');
    expect(block(morph.id)).toMatchObject({ pathArc: 360 });

    // The pairs, read-only: their glyphs, and a style only when the pair has its own.
    const list = screen.getByTestId('block-morph-pairs-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('block-morph-pair-0')).toHaveTextContent('a → c');
    expect(screen.getByTestId('block-morph-pair-0')).toHaveTextContent('0 → 4');
    expect(screen.queryByTestId('block-morph-pair-0-style')).toBeNull();
    expect(screen.getByTestId('block-morph-pair-1')).toHaveTextContent('+ → =');
    expect(screen.getByTestId('block-morph-pair-1-style')).toHaveTextContent('Transform');
    expect(screen.queryByTestId('block-morph-pairs-empty')).toBeNull();
    // Each pair says what its glyphs follow (the block's arc here) and can open the Edit-path
    // mode of the preview on it.
    expect(screen.getByTestId('block-morph-pair-0-path')).toHaveTextContent('arc 360°');
    await user.click(screen.getByTestId('block-morph-pair-1-edit-path'));
    expect(usePathEdit.getState().target).toEqual({
      origin: { kind: 'morph', clipId: clip.id, actionId: morph.id },
      index: 1,
    });
    act(() => usePathEdit.getState().close());

    // Timing: start, duration and easing, no lag ratio, shift or scale; no glyph picker.
    expect(screen.getByTestId('block-start')).toHaveValue('4');
    expect(screen.getByTestId('block-duration')).toHaveValue('1.5');
    expect(screen.getByTestId('block-easing')).toHaveValue('smooth');
    await user.selectOptions(screen.getByTestId('block-easing'), 'linear');
    expect(block(morph.id)).toMatchObject({ easing: 'linear' });
    const duration = screen.getByTestId('block-duration');
    await user.clear(duration);
    await user.type(duration, '2{Enter}');
    expect(block(morph.id)).toMatchObject({ start: 4, duration: 2 });
    for (const id of ['block-lag-mode', 'block-lag', 'block-shift-x', 'block-scale']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByTestId('block-glyph-picker')).toBeNull();
    expect(screen.queryByTestId('block-anim')).toBeNull();

    expect(useMorphEditorStore.getState().request).toBeNull();
    await user.click(screen.getByTestId('block-morph-pairs'));
    expect(useMorphEditorStore.getState().request).toEqual({
      clipId: clip.id,
      actionId: morph.id,
    });
  });

  it('a morph without pairs says how to add some; a locked track disables its fields', async () => {
    const morph = createMorph(2);
    const { clip } = await setup([morph]);
    select(clip.id, morph.id);
    render(<AnimationsPanel />);
    expect(screen.getByTestId('block-name')).toHaveTextContent('Morph · 0');
    expect(screen.getByTestId('block-morph-pairs-empty')).toHaveTextContent(
      'No pairs yet: Edit pairs… to choose which glyphs turn into which.',
    );
    expect(screen.getByTestId('block-issues')).toHaveTextContent('animates no glyph');
    act(() =>
      useProjectStore.getState().update((d) => {
        d.tracks[0]!.locked = true;
      }),
    );
    expect(screen.getByTestId('block-locked')).toBeInTheDocument();
    for (const id of ['block-morph-style', 'block-morph-path-arc', 'block-morph-pairs']) {
      expect(screen.getByTestId(id)).toBeDisabled();
    }
    expect(screen.getByTestId('block-start')).toBeDisabled();
  });

  it('the clip lists its blocks and a row selects one', async () => {
    const write = createAppear(2, 'write', [3, 4], { duration: 1 });
    const tween = createTween(5, 1, { rotation: 30 });
    const { clip } = await setup([write, tween]);
    const user = userEvent.setup();
    useUiStore.setState({ selection: { kind: 'clips', ids: [clip.id] } });
    useAnimationsTab.setState({ tab: 'timing' });
    render(<AnimationsPanel />);
    expect(screen.getByTestId(`block-row-${write.id}`)).toHaveTextContent('Write · 2');
    expect(screen.getByTestId(`tween-${tween.id}`)).toBeInTheDocument();
    await user.click(screen.getByTestId(`block-row-${write.id}`));
    expect(useUiStore.getState().selection).toEqual({
      kind: 'action',
      clipId: clip.id,
      actionId: write.id,
    });
    expect(await screen.findByTestId('block-properties')).toBeInTheDocument();
  });
});

/* A field of the panel keeps the focus when the button goes down on the block (on the timeline,
 * in the preview, on the glyph picker), and a chip or a quick button takes a key: each can fire
 * while that drag is still held. The edit gives the drag up, and starts from the block the drag
 * leaves, not from the one it showed. */
describe('the fields of a block while a drag is still held', () => {
  /** What a drag wrote so far, the button still held. */
  const held = (write: () => void) => {
    const gesture = history.beginGesture();
    act(() => void gesture.run(write));
    return gesture;
  };
  async function typed(testId: string, text: string) {
    const user = userEvent.setup();
    const field = screen.getByTestId(testId);
    await user.clear(field);
    await user.type(field, text);
    return user;
  }

  it.each([
    ['x', [5, 0]],
    ['y', [0, 5]],
  ] as const)(
    'Shift %s of a part keeps the other coordinate of the block the drag leaves',
    async (axis, to) => {
      const part = createPartTransform(2, [1]);
      const { clip } = await setup([part]);
      select(clip.id, part.id);
      render(<AnimationsPanel />);
      const user = await typed(`block-part-shift-${axis}`, '5');
      // The part dragged in the preview.
      const gesture = held(() =>
        editBlock(clip.id, part.id, (a) => {
          if (a.kind === 'transform') a.shift = [2, 3];
        }),
      );
      await user.keyboard('{Enter}');
      expect(gesture.active).toBe(false);
      expect(block(part.id)).toMatchObject({ shift: to });
    },
  );

  it('Start moves the block the drag leaves: its length is not the one a stretch showed', async () => {
    const mine = createAppear(1, 'write', [1], { duration: 1 });
    const { clip } = await setup([mine]);
    select(clip.id, mine.id);
    render(<AnimationsPanel />);
    const user = await typed('block-start', '2');
    const gesture = held(() => setBlockTiming(clip.id, mine.id, { start: 1, duration: 3 }));
    await user.keyboard('{Enter}');
    expect(gesture.active).toBe(false);
    expect(block(mine.id)).toMatchObject({ start: 2, duration: 1 });
  });

  it('Duration stretches the block the drag leaves: it stays where it was', async () => {
    const mine = createAppear(1, 'write', [1], { duration: 1 });
    const { clip } = await setup([mine]);
    select(clip.id, mine.id);
    render(<AnimationsPanel />);
    const user = await typed('block-duration', '2');
    const gesture = held(() => setBlockTiming(clip.id, mine.id, { start: 4, duration: 1 }));
    await user.keyboard('{Enter}');
    expect(gesture.active).toBe(false);
    expect(block(mine.id)).toMatchObject({ start: 1, duration: 2 });
  });

  it('a chip pressed during a marquee adds its glyph to those the block had', async () => {
    const appear = createAppear(1, 'write', [0]);
    const { clip } = await setup([appear]);
    select(clip.id, appear.id);
    render(<AnimationsPanel />);
    const user = userEvent.setup();
    screen.getByRole('button', { name: /^Glyph 4:/ }).focus();
    const gesture = held(() => setBlockGlyphs(clip.id, appear.id, [1, 2]));
    await user.keyboard('{Enter}');
    expect(gesture.active).toBe(false);
    expect(block(appear.id)).toMatchObject({ glyphs: [0, 4] });
  });

  it('a quick button picks what is on screen where the block is, not where a drag showed it', async () => {
    // Glyph 3 comes in at 2 s: on screen before 5 s, not before 0.5 s.
    const mine = createAppear(0.5, 'write', [4], { duration: 0.5 });
    const other = createAppear(2, 'write', [3], { duration: 1 });
    const { clip } = await setup([mine, other]);
    select(clip.id, mine.id);
    render(<AnimationsPanel />);
    const user = userEvent.setup();
    screen.getByTestId('block-glyphs-on-screen').focus();
    const gesture = held(() => setBlockTiming(clip.id, mine.id, { start: 5, duration: 0.5 }));
    await user.keyboard('{Enter}');
    expect(gesture.active).toBe(false);
    expect(block(mine.id)).toMatchObject({ start: 0.5, glyphs: [0, 1, 2] });
  });
});
