// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BAND_SECONDS,
  cooldownFor,
  MAC_COOLDOWN,
  pauseAfter,
  recordedSeconds,
  specBands,
  specOrder,
  specPattern,
} from '../e2ePlan';

describe('specOrder', () => {
  it('goes from the spec that takes longest to the one that takes least', () => {
    expect(
      specOrder(['a.spec.ts', 'b.spec.ts', 'c.spec.ts'], {
        'a.spec.ts': 2,
        'b.spec.ts': 30,
        'c.spec.ts': 7,
      }),
    ).toEqual(['b.spec.ts', 'c.spec.ts', 'a.spec.ts']);
  });

  it('puts first a spec without a recorded time, and keeps equal times in alphabetical order', () => {
    expect(
      specOrder(['d.spec.ts', 'new.spec.ts', 'b.spec.ts', 'also-new.spec.ts', 'c.spec.ts'], {
        'b.spec.ts': 5,
        'c.spec.ts': 5,
        'd.spec.ts': 9,
      }),
    ).toEqual(['also-new.spec.ts', 'new.spec.ts', 'd.spec.ts', 'b.spec.ts', 'c.spec.ts']);
  });
});

describe('specBands', () => {
  const seconds = {
    'huge.spec.ts': 90,
    'big.spec.ts': 61,
    'mid-a.spec.ts': 40,
    'mid-b.spec.ts': 25,
    'small-a.spec.ts': 3,
    'small-b.spec.ts': 2,
    'small-c.spec.ts': 1,
  };

  it('gives a slow spec a band of its own and lets the quick ones share', () => {
    expect(specBands(Object.keys(seconds), seconds)).toEqual([
      { name: 'order-01', specs: ['huge.spec.ts'] },
      { name: 'order-02', specs: ['big.spec.ts'] },
      { name: 'order-03', specs: ['mid-a.spec.ts', 'mid-b.spec.ts'] },
      { name: 'order-04', specs: ['small-a.spec.ts', 'small-b.spec.ts', 'small-c.spec.ts'] },
    ]);
  });

  it('closes a band once it holds a minute of tests', () => {
    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [`s${String(index).padStart(2, '0')}.spec.ts`, 5]),
    );
    const bands = specBands(Object.keys(many), many);
    expect(bands.map((band) => band.specs.length)).toEqual([12, 12, 6]);
    expect(BAND_SECONDS).toBe(60);
  });

  it('runs the specs without a time together, first', () => {
    expect(specBands(['z.spec.ts', 'new.spec.ts', 'a.spec.ts'], { 'z.spec.ts': 4 })).toEqual([
      { name: 'order-01', specs: ['a.spec.ts', 'new.spec.ts'] },
      { name: 'order-02', specs: ['z.spec.ts'] },
    ]);
  });

  it('is one band in alphabetical order when no time was recorded', () => {
    expect(specBands(['b.spec.ts', 'a.spec.ts'], {})).toEqual([
      { name: 'order-01', specs: ['a.spec.ts', 'b.spec.ts'] },
    ]);
    expect(specBands([], {})).toEqual([]);
  });

  it('puts every spec in exactly one band', () => {
    const specs = Object.keys(seconds).concat('new.spec.ts');
    const banded = specBands(specs, seconds).flatMap((band) => band.specs);
    expect([...banded].sort()).toEqual([...specs].sort());
  });
});

describe('specPattern', () => {
  const pattern = specPattern(['relations.spec.ts', 'shape.spec.ts', 'deep/inner.spec.ts']);

  it('matches the files of its specs, under either separator', () => {
    expect(pattern.test('/repo/app/e2e/relations.spec.ts')).toBe(true);
    expect(pattern.test('C:\\repo\\app\\e2e\\shape.spec.ts')).toBe(true);
    expect(pattern.test('/repo/app/e2e/deep/inner.spec.ts')).toBe(true);
    expect(pattern.test('C:\\repo\\app\\e2e\\deep\\inner.spec.ts')).toBe(true);
  });

  it('matches no other file, however alike its name', () => {
    expect(pattern.test('/repo/app/e2e/relations-playback.spec.ts')).toBe(false);
    expect(pattern.test('/repo/app/e2e/xrelations.spec.ts')).toBe(false);
    expect(pattern.test('/repo/app/e2e/shapeFit.spec.ts')).toBe(false);
    expect(pattern.test('/repo/app/e2e/relationsxspecxts')).toBe(false);
    expect(pattern.test('/repo/app/e2e/other/relations.spec.ts')).toBe(false);
    expect(pattern.test('/repo/app/e2e/inner.spec.ts')).toBe(false);
  });
});

describe('cooldownFor', () => {
  it('pauses a Mac by itself, and no other machine', () => {
    expect(cooldownFor('darwin', {})).toEqual({ every: 200, seconds: 120 });
    expect(cooldownFor('darwin', {})).toEqual(MAC_COOLDOWN);
    expect(cooldownFor('linux', {})).toBeNull();
    expect(cooldownFor('win32', {})).toBeNull();
  });

  it('takes what the environment asks: pauses anywhere, none on a Mac, another length', () => {
    expect(cooldownFor('linux', { MFE_E2E_COOL_EVERY: '50' })).toEqual({ every: 50, seconds: 120 });
    expect(cooldownFor('darwin', { MFE_E2E_COOL_EVERY: '0' })).toBeNull();
    expect(cooldownFor('darwin', { MFE_E2E_COOL_SECONDS: '45' })).toEqual({
      every: 200,
      seconds: 45,
    });
    expect(cooldownFor('darwin', { MFE_E2E_COOL_SECONDS: '0' })).toBeNull();
    expect(cooldownFor('linux', { MFE_E2E_COOL_EVERY: '20', MFE_E2E_COOL_SECONDS: '7.5' })).toEqual(
      { every: 20, seconds: 7.5 },
    );
  });

  it('ignores what is not a count', () => {
    expect(cooldownFor('darwin', { MFE_E2E_COOL_EVERY: 'often' })).toEqual(MAC_COOLDOWN);
    expect(cooldownFor('darwin', { MFE_E2E_COOL_EVERY: '' })).toEqual(MAC_COOLDOWN);
    expect(cooldownFor('darwin', { MFE_E2E_COOL_EVERY: '-5' })).toEqual(MAC_COOLDOWN);
    expect(cooldownFor('linux', { MFE_E2E_COOL_SECONDS: '30' })).toBeNull();
    expect(cooldownFor('linux', { MFE_E2E_COOL_EVERY: '199.9' })).toEqual({
      every: 199,
      seconds: 120,
    });
  });
});

describe('pauseAfter', () => {
  it('begins a pause every so many tests, while there are tests left', () => {
    expect(pauseAfter(199, 430, 200)).toBe(false);
    expect(pauseAfter(200, 429, 200)).toBe(true);
    expect(pauseAfter(201, 428, 200)).toBe(false);
    expect(pauseAfter(400, 229, 200)).toBe(true);
    expect(pauseAfter(600, 29, 200)).toBe(true);
  });

  it('begins none after the last test, before the first, or when there are no pauses', () => {
    expect(pauseAfter(600, 0, 200)).toBe(false);
    expect(pauseAfter(0, 629, 200)).toBe(false);
    expect(pauseAfter(200, 429, 0)).toBe(false);
  });
});

describe('recordedSeconds', () => {
  const before = { 'a.spec.ts': 10, 'b.spec.ts': 20, 'gone.spec.ts': 5 };

  it('takes the new time of a spec that ran clean and keeps the old one of a spec that failed', () => {
    expect(
      recordedSeconds(
        before,
        [
          { spec: 'a.spec.ts', seconds: 12.34, clean: true },
          { spec: 'b.spec.ts', seconds: 95, clean: false },
        ],
        ['a.spec.ts', 'b.spec.ts'],
      ),
    ).toEqual({ 'a.spec.ts': 12.3, 'b.spec.ts': 20 });
  });

  it('adds a new spec, drops one that is gone, and sorts by name', () => {
    const next = recordedSeconds(
      before,
      [
        { spec: 'new.spec.ts', seconds: 3.06, clean: true },
        { spec: 'broken.spec.ts', seconds: 30, clean: false },
      ],
      ['new.spec.ts', 'b.spec.ts', 'a.spec.ts', 'broken.spec.ts'],
    );
    expect(next).toEqual({ 'a.spec.ts': 10, 'b.spec.ts': 20, 'new.spec.ts': 3.1 });
    expect(Object.keys(next)).toEqual(['a.spec.ts', 'b.spec.ts', 'new.spec.ts']);
  });
});
