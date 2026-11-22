import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EMPHASIS_KINDS, type ClipAction } from '../../../model';
import {
  EmphasisKindSchema,
  IntroKindSchema,
  OutroKindSchema,
  ProjectSchema,
  RelationStyleSchema,
} from '../../../model/schema';
import { AnimationIcon } from '../AnimationIcon';
import {
  ANIMATION_ICON_DRAWINGS,
  ANIMATION_ICON_NAMES,
  blockIcon,
  cameraMoveIcon,
  emphasisIcon,
  groupIcon,
  phaseIcon,
  relationIcon,
  type AnimationIconName,
} from '../animationIcons';
import {
  APPEAR_ANIMATIONS,
  DISAPPEAR_ANIMATIONS,
  EMPHASIS_EFFECTS,
  GROW_ARROW,
  INTRO_CHOICES,
  OUTRO_CHOICES,
} from '../catalogue';

/** A block with only the fields that choose its icon. */
const block = (fields: Record<string, unknown>) => fields as unknown as ClipAction;

/** The kinds of block the file format knows, read from its schema: a kind added there has no
 * sample below until it is given an icon. */
const ACTION_KINDS: string[] = ProjectSchema.shape.clips.element.shape.actions.element.options.map(
  (option) => option.shape.kind.value,
);

/** Where a camera move can go, read from the schema of the file format. */
const CAMERA_DESTINATIONS = ProjectSchema.shape.camera
  .unwrap()
  .shape.moves.element.shape.to.options.map((option) => option.shape.kind.value);

const APPEAR_KINDS = IntroKindSchema.options.filter((kind) => kind !== 'none');
const DISAPPEAR_KINDS = OutroKindSchema.options.filter((kind) => kind !== 'none');

/** Blocks of every kind, in every variant that draws a different icon. */
const SAMPLE_BLOCKS: Record<string, ClipAction[]> = {
  tween: [
    block({ kind: 'tween', to: {} }),
    block({ kind: 'tween', to: {}, fit: { clipId: 'c2', glyphs: 'all', fitted: null } }),
    block({ kind: 'tween', to: {}, ends: { buff: 0, degrees: null, drawn: null } }),
  ],
  appear: APPEAR_KINDS.map((anim) => block({ kind: 'appear', anim })),
  disappear: DISAPPEAR_KINDS.map((anim) => block({ kind: 'disappear', anim })),
  transform: [block({ kind: 'transform', glyphs: [0] })],
  morph: [block({ kind: 'morph', pairs: [] })],
  emphasis: EmphasisKindSchema.options.map((effect) => block({ kind: 'emphasis', effect })),
};

/** Every icon an animation of the app takes. */
function usedIcons(): Set<AnimationIconName> {
  const used = new Set<AnimationIconName>();
  for (const kind of [...IntroKindSchema.options, ...OutroKindSchema.options]) {
    used.add(phaseIcon(kind));
  }
  for (const effect of EmphasisKindSchema.options) used.add(emphasisIcon(effect));
  for (const style of RelationStyleSchema.options) used.add(relationIcon(style));
  for (const kind of ACTION_KINDS)
    for (const action of SAMPLE_BLOCKS[kind]!) used.add(blockIcon(action));
  // A folded group of blocks that run different animations.
  used.add(groupIcon([SAMPLE_BLOCKS.appear![0]!, SAMPLE_BLOCKS.emphasis![0]!]));
  // A kind of block this module does not know yet.
  used.add(blockIcon(block({ kind: 'unknown' })));
  for (const kind of CAMERA_DESTINATIONS) used.add(cameraMoveIcon(kind));
  return used;
}

describe('animation icons', () => {
  it('gives an icon of its own to every intro, outro, Appear and Disappear animation', () => {
    const kinds = [...IntroKindSchema.options, ...OutroKindSchema.options];
    for (const kind of kinds) expect(phaseIcon(kind), kind).not.toBe('animation');
    // No two animations share an icon, but the two "none" (no intro, no outro).
    const icons = kinds.filter((kind) => kind !== 'none').map(phaseIcon);
    expect(new Set(icons).size).toBe(icons.length);
    expect(phaseIcon('none')).toBe('none');
  });

  it('covers what the menus and panels offer', () => {
    const offered = [
      ...INTRO_CHOICES,
      ...OUTRO_CHOICES,
      ...APPEAR_ANIMATIONS,
      ...DISAPPEAR_ANIMATIONS,
      GROW_ARROW,
    ];
    for (const { value } of offered) expect(phaseIcon(value), value).not.toBe('animation');
    for (const { value } of EMPHASIS_EFFECTS)
      expect(emphasisIcon(value), value).not.toBe('animation');
  });

  it('gives each Emphasis effect and each relation style an icon of its own', () => {
    expect(EMPHASIS_KINDS).toEqual(EmphasisKindSchema.options);
    const effects = EmphasisKindSchema.options.map(emphasisIcon);
    expect(effects).not.toContain('animation');
    expect(new Set(effects).size).toBe(effects.length);
    const styles = RelationStyleSchema.options.map(relationIcon);
    expect(styles).not.toContain('animation');
    expect(new Set(styles).size).toBe(styles.length);
  });

  it('gives every kind of block of the file format an icon', () => {
    expect(ACTION_KINDS.length).toBeGreaterThan(0);
    for (const kind of ACTION_KINDS) {
      const samples = SAMPLE_BLOCKS[kind];
      expect(samples, `a sample block of kind "${kind}"`).toBeDefined();
      for (const action of samples!) expect(blockIcon(action), kind).not.toBe('animation');
    }
  });

  it("draws an Appear, a Disappear or an Emphasis block with its animation's icon", () => {
    expect(blockIcon(block({ kind: 'appear', anim: 'write' }))).toBe(phaseIcon('write'));
    expect(blockIcon(block({ kind: 'disappear', anim: 'fade_out' }))).toBe('fade-out');
    expect(blockIcon(block({ kind: 'emphasis', effect: 'flash' }))).toBe('flash');
    const [plain, fit, ends] = SAMPLE_BLOCKS.tween!.map(blockIcon);
    expect([plain, fit, ends]).toEqual(['tween', 'tween-fit', 'tween-ends']);
  });

  it("draws a folded group with its members' icon when they share one, the group's otherwise", () => {
    const write = block({ kind: 'appear', anim: 'write' });
    expect(groupIcon([write, write, write])).toBe('write');
    expect(groupIcon([write, block({ kind: 'appear', anim: 'fade_in' })])).toBe('group');
    expect(groupIcon([write, block({ kind: 'disappear', anim: 'unwrite' })])).toBe('group');
  });

  it('draws a camera move by where it goes: back to the start, or to another frame', () => {
    expect(CAMERA_DESTINATIONS.map((kind) => [kind, cameraMoveIcon(kind)])).toEqual([
      ['frame', 'camera-move'],
      ['target', 'camera-move'],
      ['start', 'camera-back'],
    ]);
  });

  it('uses every icon it draws, and draws every icon differently', () => {
    expect([...usedIcons()].sort()).toEqual([...ANIMATION_ICON_NAMES].sort());
    const drawings = ANIMATION_ICON_NAMES.map((name) =>
      JSON.stringify(ANIMATION_ICON_DRAWINGS[name]),
    );
    expect(new Set(drawings).size).toBe(drawings.length);
    for (const name of ANIMATION_ICON_NAMES) {
      expect(ANIMATION_ICON_DRAWINGS[name].parts.length, name).toBeGreaterThan(0);
    }
  });

  it('draws an animation and its reverse as a pair', () => {
    const drawing = (name: AnimationIconName) => ANIMATION_ICON_DRAWINGS[name];
    // Mirrored: the same paths, the other way round.
    for (const [forth, back] of [
      ['write', 'unwrite'],
      ['fade-in', 'fade-out'],
    ] as const) {
      expect(drawing(back).parts).toEqual(drawing(forth).parts);
      expect([drawing(forth).mirror, drawing(back).mirror]).toEqual([undefined, true]);
    }
    // The same drawing with its arrows turned.
    for (const [forth, back] of [
      ['grow', 'shrink'],
      ['create', 'uncreate'],
    ] as const) {
      expect(drawing(back).parts[0]).toEqual(drawing(forth).parts[0]);
      expect(drawing(back).parts).not.toEqual(drawing(forth).parts);
    }
  });

  it('keeps every path inside the 16×16 box', () => {
    for (const name of ANIMATION_ICON_NAMES) {
      for (const { d } of ANIMATION_ICON_DRAWINGS[name].parts) {
        // Absolute coordinates only (an M, L, H, V or C command's numbers).
        for (const match of d.matchAll(/[MLHVC]([-\d.\s]+)/g)) {
          for (const value of match[1]!
            .trim()
            .split(/[\s]+|(?=-)/)
            .map(Number)) {
            expect(value, `${name}: ${d}`).toBeGreaterThanOrEqual(0);
            expect(value, `${name}: ${d}`).toBeLessThanOrEqual(16);
          }
        }
      }
    }
  });
});

describe('AnimationIcon', () => {
  it('draws the icon in the colour of the text around it, hidden from assistive technology', () => {
    const { container } = render(<AnimationIcon name="write" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveClass('icon', 'animation-icon');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', '0 0 16 16');
    expect(svg.querySelectorAll('path')).toHaveLength(2);
    expect(svg.querySelector('path[fill="currentColor"]')).not.toBeNull();
    expect(svg.querySelector('path[stroke="currentColor"]')).not.toBeNull();
    expect(svg.querySelector('g')).toBeNull();
  });

  it('mirrors the drawing of a reverse animation', () => {
    const { container } = render(<AnimationIcon name="unwrite" />);
    expect(container.querySelector('g')).toHaveAttribute('transform', 'matrix(-1 0 0 1 16 0)');
    expect(container.querySelectorAll('g path')).toHaveLength(2);
  });
});
