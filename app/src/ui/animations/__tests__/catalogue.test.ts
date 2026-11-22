import { describe, expect, it } from 'vitest';
import { createFormula, createLineFormula, INTRO_KINDS } from '../../../model';
import { EasingSchema, IntroKindSchema, OutroKindSchema } from '../../../model/schema';
import {
  animationLabel,
  appearChoicesOf,
  APPEAR_ANIMATIONS,
  disappearChoicesOf,
  DISAPPEAR_ANIMATIONS,
  EASINGS,
  emphasisChoicesOf,
  EMPHASIS_EFFECTS,
  GROW_ARROW,
  introChoicesOf,
  INTRO_ANIMATIONS,
  INTRO_CHOICES,
  OUTRO_ANIMATIONS,
  OUTRO_CHOICES,
  shortAnimationLabel,
} from '../catalogue';

const values = (choices: readonly { value: string }[]) => choices.map((c) => c.value);

describe('animation catalogue', () => {
  it('offers every kind of the format, in its order', () => {
    // GrowArrow is an arrow's alone: it is offered to an arrow, after the ones every object takes.
    expect(values(INTRO_CHOICES)).toEqual(INTRO_KINDS);
    expect([...values(INTRO_CHOICES), GROW_ARROW.value]).toEqual(IntroKindSchema.options);
    expect(values(OUTRO_CHOICES)).toEqual(OutroKindSchema.options);
    expect(EASINGS).toEqual(EasingSchema.options);
  });

  it('lets blocks run the intro and outro animations, most used first', () => {
    expect(values(APPEAR_ANIMATIONS).sort()).toEqual(values(INTRO_ANIMATIONS).sort());
    expect(values(DISAPPEAR_ANIMATIONS).sort()).toEqual(values(OUTRO_ANIMATIONS).sort());
    expect(values(APPEAR_ANIMATIONS)[0]).toBe('write');
    expect(values(DISAPPEAR_ANIMATIONS)[0]).toBe('fade_out');
  });

  it('offers GrowArrow to an arrow and a double arrow, as an intro and in Appear', () => {
    const arrow = createLineFormula({ line: 'arrow' });
    const line = createLineFormula({ line: 'dashed' });
    expect(values(introChoicesOf(arrow))).toEqual([
      'none',
      'write',
      'fade_in',
      'create',
      'grow_arrow',
    ]);
    expect(values(introChoicesOf(createLineFormula({ line: 'double_arrow' })))).toContain(
      'grow_arrow',
    );
    expect(values(introChoicesOf(line))).toEqual(['none', 'write', 'fade_in', 'create']);
    expect(values(appearChoicesOf(arrow))).toEqual(['write', 'create', 'fade_in', 'grow_arrow']);
    expect(values(appearChoicesOf(line))).toEqual(['write', 'create', 'fade_in']);
    // A formula takes every intro but that one; with no object, the general list.
    expect(values(introChoicesOf(createFormula()))).toEqual(INTRO_KINDS);
    expect(introChoicesOf(null)).toBe(INTRO_CHOICES);
    expect(animationLabel('grow_arrow')).toBe('GrowArrow');
  });

  it('lists what the Disappear and Emphasis blocks of a line can run: nothing that scales it', () => {
    const line = createLineFormula({ line: 'arrow' });
    expect(values(disappearChoicesOf(line))).toEqual(['fade_out', 'unwrite', 'uncreate']);
    expect(values(emphasisChoicesOf(line))).toEqual(['circumscribe', 'flash', 'focus_on']);
    // A formula runs them all; with no object, the general lists.
    expect(disappearChoicesOf(createFormula())).toEqual(DISAPPEAR_ANIMATIONS);
    expect(emphasisChoicesOf(createFormula())).toEqual(EMPHASIS_EFFECTS);
    expect(disappearChoicesOf(null)).toBe(DISAPPEAR_ANIMATIONS);
    expect(emphasisChoicesOf(undefined)).toBe(EMPHASIS_EFFECTS);
  });

  it('names animations as Manim does, shorter on the timeline', () => {
    expect(animationLabel('draw_border_then_fill')).toBe('DrawBorderThenFill');
    expect(animationLabel('none')).toBe('none');
    expect(shortAnimationLabel('draw_border_then_fill')).toBe('Border');
    expect(shortAnimationLabel('shrink_to_center')).toBe('Shrink');
    expect(shortAnimationLabel('fade_out')).toBe('FadeOut');
    expect(shortAnimationLabel('none')).toBe('');
  });
});
