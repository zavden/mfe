// @vitest-environment node
/* The strip's words are the app's: the names on the intro and outro bands and on the blocks, and
 * the families the blocks are coloured by (the player cannot import `ui/`; a test can). */
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createDisappear,
  createEmphasis,
  createPartTransform,
  EMPHASIS_KINDS,
  INTRO_KINDS,
  OUTRO_KINDS,
  type ClipAction,
} from '../../model';
import {
  animationLabel as appLabel,
  shortAnimationLabel as appShort,
} from '../../ui/animations/catalogue';
import {
  blockCategory as appCategory,
  blockLabel as appBlockLabel,
} from '../../ui/animations/blockKinds';
import { animationLabel, blockCategory, blockLabel, shortAnimationLabel } from '../labels';

describe('the words of the strip', () => {
  it("name every intro and outro as the app's timeline does", () => {
    for (const kind of [...INTRO_KINDS, 'grow_arrow' as const, 'none' as const, ...OUTRO_KINDS]) {
      expect(animationLabel(kind)).toBe(appLabel(kind));
      expect(shortAnimationLabel(kind)).toBe(appShort(kind));
    }
  });

  it('label and colour every kind of block as the app does', () => {
    const actions: ClipAction[] = [
      createAppear(0, 'write', [0, 1]),
      createAppear(0, 'fade_in', 'all'),
      createDisappear(0, 'uncreate', [2]),
      createPartTransform(0, [0], { shift: [1, 0] }),
      ...EMPHASIS_KINDS.map((effect) => createEmphasis(0, effect, [0, 1, 2])),
      {
        id: 'a_tween',
        kind: 'tween',
        start: 0,
        duration: 1,
        easing: 'smooth',
        to: { position: [1, 1] },
      },
      {
        id: 'a_fit',
        kind: 'tween',
        start: 0,
        duration: 1,
        easing: 'smooth',
        to: {},
        fit: { clipId: 'c', glyphs: 'all', fitted: null },
      },
      {
        id: 'a_morph',
        kind: 'morph',
        start: 0,
        duration: 1,
        easing: 'smooth',
        style: 'copy',
        pathArc: 0,
        pairs: [{ from: [0], to: [3], style: null }],
      },
    ];
    for (const action of actions) {
      expect(blockLabel(action)).toBe(appBlockLabel(action));
      expect(blockCategory(action)).toBe(appCategory(action));
    }
  });
});
