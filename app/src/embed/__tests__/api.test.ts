// @vitest-environment node
/* What the engine offers widgets beyond examples and scenes (`index.ts`, EXAMPLES.md §5): the
 * rate functions the app's editors offer and their curves, the relation editor's rules, lines and
 * palettes — each the module the parity tests hold to the app (pairs, window, lines, palettes) —,
 * and the player's stylesheet for a widget that builds its controls. */
import { describe, expect, it } from 'vitest';
import { rateFunction } from '../../scene';
import { EASINGS, PULSE_EASING_CHOICES } from '../../ui/animations/catalogue';
import { MFEPlayer } from '../index';
import { placeLines } from '../lines';
import { linkPair } from '../pairs';
import { BUILT_IN_PALETTES } from '../palettes';
import { clampWindow } from '../window';

describe('the engine for widgets', () => {
  const { engine } = MFEPlayer;

  it('offers every rate function the editors offer, with the scene’s curves', () => {
    expect([...engine.rates.names]).toEqual([...EASINGS]);
    expect([...engine.rates.pulses]).toEqual(PULSE_EASING_CHOICES.map((c) => c.value));
    for (const target of ['ce', 'gl'] as const) {
      for (const name of engine.rates.names) {
        const own = engine.rates.curve(name, target);
        const app = rateFunction(name, target);
        for (let i = 0; i <= 20; i++) expect(own(i / 20)).toBe(app(i / 20));
        // Clamped to the time of the animation, as the scene clamps it.
        expect(own(-1)).toBe(own(0));
        expect(own(2)).toBe(own(1));
      }
    }
    // CE and GL mean other curves by `smooth`.
    expect(engine.rates.curve('smooth', 'ce')(0.25)).not.toBeCloseTo(
      engine.rates.curve('smooth', 'gl')(0.25),
      4,
    );
  });

  it('gathers the relation editor’s rules, the lines and the palettes', () => {
    expect(engine.relations.link).toBe(linkPair);
    expect(engine.relations.clampWindow).toBe(clampWindow);
    expect(engine.relations.minWindow).toBe(0.05);
    expect(engine.relations.styles.map((s) => s.value)).toEqual([
      'transform',
      'copy',
      'fade',
      'fade_copy',
    ]);
    expect(engine.lines.anchors[0]).toBe('auto');
    expect(engine.lines.compass).toHaveLength(9);
    expect(engine.palettes.builtIn).toBe(BUILT_IN_PALETTES);
    expect(engine.palettes.roles).toHaveLength(11);
    expect(typeof placeLines).toBe('function');
    expect(MFEPlayer.version).toBe('1.1.0');
  });

  it('puts the player’s stylesheet in a document once', () => {
    const appended: { id: string }[] = [];
    const doc = {
      getElementById: (id: string) => appended.find((node) => node.id === id) ?? null,
      createElement: () => ({ id: '', textContent: '' }),
      head: { append: (node: { id: string }) => appended.push(node) },
    } as unknown as Document;
    MFEPlayer.injectStyles(doc);
    MFEPlayer.injectStyles(doc);
    expect(appended).toHaveLength(1);
    expect(appended[0]!.id).toBe('mfe-player-style');
  });
});
