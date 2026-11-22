// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCALE_STEP,
  formatScaleStep,
  isScaleStepText,
  parseScaleStep,
  SCALE_STEPS,
} from '../scaleStep';

describe('parseScaleStep', () => {
  it('reads the presets, plain numbers and fractions, with a dot or a comma', () => {
    expect(SCALE_STEPS).toContain(DEFAULT_SCALE_STEP);
    for (const step of SCALE_STEPS) expect(parseScaleStep(step)).toBe(Number(step));
    expect(parseScaleStep('.25')).toBe(0.25);
    expect(parseScaleStep('0,15')).toBe(0.15);
    expect(parseScaleStep('1/3')).toBeCloseTo(1 / 3, 12);
    expect(parseScaleStep('0.3/0.2')).toBeCloseTo(1.5, 12);
    expect(parseScaleStep(' 2 / 3 ')).toBeCloseTo(2 / 3, 12);
    expect(parseScaleStep('1,5/3')).toBe(0.5);
  });

  it('refuses what is not a step, or a value outside 0.01–2', () => {
    for (const bad of [
      '',
      'abc',
      '1/',
      '/3',
      '1/0',
      '0',
      '0.001',
      '2.5',
      '3/1',
      '-0.2',
      '1e-1',
      '1/3/2',
    ]) {
      expect(parseScaleStep(bad), bad).toBeNull();
      expect(isScaleStepText(bad)).toBe(false);
    }
    expect(parseScaleStep('2')).toBe(2);
    expect(parseScaleStep('0.01')).toBe(0.01);
    expect(isScaleStepText(0.2)).toBe(false);
    expect(isScaleStepText('0.2')).toBe(true);
  });
});

describe('formatScaleStep', () => {
  it('shows a plain number as typed, and restates a fraction or a comma decimal', () => {
    expect(formatScaleStep('0.2')).toBe('0.2');
    expect(formatScaleStep(' .5 ')).toBe('.5');
    expect(formatScaleStep('1/3')).toBe('1/3 = 0.3333');
    expect(formatScaleStep('0.3/0.2')).toBe('0.3/0.2 = 1.5');
    expect(formatScaleStep('0,15')).toBe('0,15 = 0.15');
    expect(formatScaleStep('nope')).toBe('nope');
  });
});
