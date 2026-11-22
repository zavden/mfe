// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { defaultIntro, defaultOutro } from '../../../model';
import { animationLabel } from '../../animations/catalogue';
import {
  MIN_DURATION,
  parseDraft,
  phaseForKind,
  toDraft,
  type AnimationsDraft,
} from '../defaultAnimations';

const base = (): AnimationsDraft => toDraft(defaultIntro('write'), defaultOutro('fade_out'));

describe('default animations draft', () => {
  it('round-trips the default specs', () => {
    const parsed = parseDraft(base());
    expect(parsed).toEqual({
      ok: true,
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
    });
  });

  it('names the animations the way the Animations panel does', () => {
    expect(animationLabel('write')).toBe('Write');
    expect(animationLabel('fade_in')).toBe('FadeIn');
    expect(animationLabel('draw_border_then_fill')).toBe('DrawBorderThenFill');
    expect(animationLabel('shrink_to_center')).toBe('ShrinkToCenter');
  });

  it('takes the new animation’s own defaults when the kind changes', () => {
    const draft = phaseForKind('intro', 'draw_border_then_fill');
    expect(draft).toMatchObject({ kind: 'draw_border_then_fill', duration: '2', lagMode: 'auto' });
    expect(phaseForKind('outro', 'uncreate')).toMatchObject({ kind: 'uncreate', lagMode: 'auto' });
  });

  it('accepts comma decimals and a custom lag ratio', () => {
    const draft = base();
    draft.intro.duration = '0,5';
    draft.intro.lagMode = 'custom';
    draft.intro.lag = '0.25';
    const parsed = parseDraft(draft);
    expect(parsed).toMatchObject({ ok: true, intro: { duration: 0.5, lagRatio: 0.25 } });
  });

  it('rejects durations that are not positive numbers', () => {
    for (const bad of ['', '0', '-1', 'abc', String(MIN_DURATION / 2)]) {
      const draft = base();
      draft.intro.duration = bad;
      const parsed = parseDraft(draft);
      expect(parsed.ok).toBe(false);
      expect(parsed.ok ? {} : parsed.errors).toHaveProperty(['intro.duration']);
    }
    const draft = base();
    draft.outro.duration = '0';
    expect(parseDraft(draft)).toMatchObject({ ok: false, errors: { 'outro.duration': /Outro/ } });
  });

  it('checks the custom lag ratio only when it is used', () => {
    const draft = base();
    draft.intro.lag = 'nonsense';
    expect(parseDraft(draft).ok).toBe(true); // auto: the text is ignored
    draft.intro.lagMode = 'custom';
    expect(parseDraft(draft)).toMatchObject({ ok: false, errors: { 'intro.lag': /lag ratio/ } });
    draft.intro.lag = '-0.1';
    expect(parseDraft(draft).ok).toBe(false);
    draft.intro.lag = '0';
    expect(parseDraft(draft)).toMatchObject({ ok: true, intro: { lagRatio: 0 } });
  });

  it('keeps shift and scale only for fades, and validates them there', () => {
    const fade = base();
    fade.intro = { ...phaseForKind('intro', 'fade_in'), shiftX: '0.5', shiftY: '-1', scale: '1.5' };
    expect(parseDraft(fade)).toMatchObject({
      ok: true,
      intro: { kind: 'fade_in', shift: [0.5, -1], scale: 1.5 },
    });

    fade.intro.scale = '0';
    expect(parseDraft(fade)).toMatchObject({ ok: false, errors: { 'intro.scale': /scale/ } });
    fade.intro.scale = '1';
    fade.intro.shiftY = 'up';
    expect(parseDraft(fade)).toMatchObject({ ok: false, errors: { 'intro.shift': /shift/ } });

    // Not a fade: leftover text in the hidden fields is ignored and the spec stays neutral.
    const plain = base();
    plain.intro = { ...phaseForKind('intro', 'create'), shiftX: 'x', scale: '-3' };
    expect(parseDraft(plain)).toMatchObject({ ok: true, intro: { shift: [0, 0], scale: 1 } });
  });

  it('requires intro and outro to fit in the clip a drop creates (3 s)', () => {
    const draft = base();
    draft.intro.duration = '2';
    draft.outro.duration = '1';
    expect(parseDraft(draft).ok).toBe(true);
    draft.outro.duration = '1.5';
    const parsed = parseDraft(draft);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? '' : parsed.errors.total).toMatch(/3\.5 s together.*3 s long/);
  });
});
