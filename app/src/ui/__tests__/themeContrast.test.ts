// @vitest-environment node
/* WCAG contrast of the theme tokens (ui/styles.css), in both themes: text ≥ 4.5:1, the edges
 * that identify a control and the focus ring ≥ 3:1 against the surfaces they sit on. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/** The custom properties of the first rule whose selector list contains `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const shared = css.slice(css.indexOf(':root {') + 7, css.indexOf('}', css.indexOf(':root {')));
  const out: Record<string, string> = {};
  for (const block of [shared, body]) {
    for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
      out[name!] = value!;
    }
  }
  return out;
}

function luminance(hex: string): number {
  const full = hex.length === 4 ? hex.replace(/[0-9a-f]/gi, (c) => c + c) : hex;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const THEMES = {
  dark: tokens(":root[data-theme='dark']"),
  light: tokens(":root[data-theme='light']"),
};

/** [foreground, background, minimum ratio] */
const PAIRS: [string, string, number][] = [
  ...['--bg', '--panel', '--panel-header'].flatMap((surface): [string, string, number][] => [
    ['--text', surface, 4.5],
    ['--text-dim', surface, 4.5],
    ['--warning', surface, 4.5],
    ['--border-strong', surface, 3],
    ['--focus-ring', surface, 3],
    // What is on, drawn as a line or an icon: the panels' icons, the edge of a chosen item.
    ['--accent', surface, 3],
  ]),
  // The other surfaces text is written on: a secondary button, a lane, what is under the
  // pointer, a selected item and both ends of the active tab.
  ...['--raised', '--well', '--hover', '--menu-hover'].flatMap(
    (surface): [string, string, number][] => [
      ['--text', surface, 4.5],
      ['--text-dim', surface, 4.5],
    ],
  ),
  ...['--selection', '--selection-from', '--selection-to'].map(
    (surface): [string, string, number] => ['--text', surface, 4.5],
  ),
  // Placeholders and metadata, only where they are used.
  ...['--bg', '--panel', '--input-bg'].map((surface): [string, string, number] => [
    '--text-muted',
    surface,
    4.5,
  ]),
  // The issues of what is selected (D177): the title of a Problems section (an error among them)
  // or of a Warnings section (only warnings) on its card; the edges of a relation's bands and its
  // arrow over the lanes of the timeline, in the same colours.
  ...['--danger', '--warning'].flatMap((colour): [string, string, number][] => [
    [colour, '--raised', 4.5],
    [colour, '--well', 3],
  ]),
  ['--border-strong', '--input-bg', 3],
  ['--border-strong', '--raised', 3],
  ['--accent-text', '--accent', 4.5],
  ['--accent-text', '--accent-bright', 4.5],
  ['--on-danger', '--danger', 4.5],
  ['--on-badge-color', '--badge-exact', 4.5],
  ['--on-badge-color', '--badge-approx', 4.5],
  // A primary button: its dark label on every stop of its fill, at rest and under the pointer;
  // its rim against what it sits on.
  ...[
    '--primary-from',
    '--primary-mid',
    '--primary-to',
    '--primary-hover-from',
    '--primary-hover-mid',
    '--primary-hover-to',
  ].map((fill): [string, string, number] => ['--primary-text', fill, 4.5]),
  ...['--bg', '--panel', '--panel-header'].map((surface): [string, string, number] => [
    '--primary-edge',
    surface,
    3,
  ]),
];

describe('theme contrast', () => {
  for (const [theme, t] of Object.entries(THEMES)) {
    it(`meets WCAG AA in the ${theme} theme`, () => {
      const failures = PAIRS.filter(([fg, bg]) => !t[fg] || !t[bg]).map(
        ([fg, bg]) => `${fg}/${bg} missing`,
      );
      for (const [fg, bg, min] of PAIRS) {
        if (!t[fg] || !t[bg]) continue;
        const ratio = contrast(t[fg], t[bg]);
        if (ratio < min) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
      }
      expect(failures).toEqual([]);
    });
  }

  it("draws the groove of the timeline's slider in a colour held to 4.5:1 on the panels", () => {
    // A line on the panel, under the thumb: `--text-muted`, one of the pairs above.
    expect(readFileSync(new URL('../timeline/timeline.css', import.meta.url), 'utf8')).toMatch(
      /\.tl-slider::before \{[^}]*\bbackground: var\(--text-muted\);/,
    );
  });

  it('draws what has an error in the danger colour and what has only warnings in the warning colour', () => {
    // The colours the pairs above hold to AA: a Problems or a Warnings section, a relation on the
    // timeline, a pair and its glyphs in the pair editors (D177).
    const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
    const animations = read('../animations/animations.css');
    for (const [tone, colour] of [
      ['problems', 'danger'],
      ['warnings', 'warning'],
    ]) {
      expect(animations).toMatch(
        new RegExp(
          `\\.an-section\\[data-tone='${tone}'\\] \\{\\s*--section-color: var\\(--${colour}\\);\\s*--section-title: var\\(--${colour}\\);`,
        ),
      );
    }
    const relations = read('../relations/relations.css');
    for (const [mark, colour] of [
      ['is-bad', 'danger'],
      ['is-warned', 'warning'],
    ]) {
      expect(relations).toMatch(
        new RegExp(`\\.tl-rel-window\\.${mark} \\{\\s*border-color: var\\(--${colour}\\);`),
      );
      expect(relations).toMatch(
        new RegExp(`\\.tl-rel-arrow\\.${mark}[^{]*\\{\\s*stroke: var\\(--${colour}\\);`),
      );
      expect(relations).toMatch(
        new RegExp(`\\.rel-pair\\.${mark} \\{[^}]*border-color: var\\(--${colour}\\);`),
      );
      expect(relations).toMatch(
        new RegExp(`\\.rg-glyph\\.${mark} \\.rg-hit \\{\\s*stroke: var\\(--${colour}\\);`),
      );
    }
  });

  it("keeps the ruler's numbers readable over the tints of the Slides mode, and its notch seen", () => {
    // The ruler of the Slides mode (D200) is tinted by zone over the colour of the bars: a tint of
    // `--slide-pause` where a pause may stand; one of `--slide-busy` where something animates,
    // hatched with thin stripes of it a little stronger. The numbers of the ruler are
    // `--text-dim`: AA over the tints, and at least 4:1 over the stripes, a quarter of the
    // hatch. A zone of no length is a notch of the pause colour, a mark that has to be seen.
    const css = readFileSync(new URL('../timeline/slidesTimeline.css', import.meta.url), 'utf8');
    const share = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)%`).exec(css)![1]) / 100;
    const [tint, hatch] = [share('--slide-tint'), share('--slide-hatch')];
    const mix = (colour: string, surface: string, amount: number) => {
      const channels = [1, 3, 5].map((i) =>
        Math.round(
          parseInt(colour.slice(i, i + 2), 16) * amount +
            parseInt(surface.slice(i, i + 2), 16) * (1 - amount),
        ),
      );
      return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    };
    const failures: string[] = [];
    for (const [theme, t] of Object.entries(THEMES)) {
      const surface = t['--panel-header']!;
      const check = (what: string, bg: string, fg: string, min: number) => {
        const ratio = contrast(fg, bg);
        if (ratio < min) failures.push(`${theme}: ${what} ${ratio.toFixed(2)} < ${min}`);
      };
      check(
        'numbers on the pause tint',
        mix(t['--slide-pause']!, surface, tint),
        t['--text-dim']!,
        4.5,
      );
      check(
        'numbers on the busy tint',
        mix(t['--slide-busy']!, surface, tint),
        t['--text-dim']!,
        4.5,
      );
      check('numbers on a stripe', mix(t['--slide-busy']!, surface, hatch), t['--text-dim']!, 4);
      check('the notch', surface, t['--slide-pause']!, 3);
      // A pause that skips its wait (D202): its tag on the bar, the «‖▸» in the panel's colour on
      // it, the line of what it skips over the pause tint, and its words in the tooltip.
      check('a pause that skips', surface, t['--slide-skip']!, 3);
      check('its «‖▸»', t['--slide-skip']!, t['--panel']!, 3);
      check('the stretch it skips', mix(t['--slide-pause']!, surface, tint), t['--slide-skip']!, 3);
      check('its words', t['--panel']!, t['--slide-skip']!, 4.5);
    }
    expect(failures).toEqual([]);
  });

  it('draws a pause that skips its wait in a hue of its own, which a warning still wins over', () => {
    // Violet (D202): far from the amber of a mark with a warning and from the accent, in both
    // themes; and the warning's rule comes after its own, so that it wins on a warned pause.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const [max, min] = [Math.max(r!, g!, b!), Math.min(r!, g!, b!)];
      const d = max - min;
      const h = max === r ? ((g! - b!) / d) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    for (const t of Object.values(THEMES)) {
      const skip = hue(t['--slide-skip']!);
      expect(skip).toBeGreaterThanOrEqual(245);
      expect(skip).toBeLessThanOrEqual(295);
      for (const [other, least] of [
        ['--warning', 80],
        ['--accent', 80],
        ['--slide-busy', 80],
        ['--slide-pause', 50],
      ] as const) {
        expect(apart(skip, hue(t[other]!)), other).toBeGreaterThan(least);
      }
    }
    const css = readFileSync(new URL('../timeline/slidesTimeline.css', import.meta.url), 'utf8');
    const own = css.indexOf('.tl-slide-mark.is-skip {');
    expect(own).toBeGreaterThan(0);
    expect(css.indexOf('.tl-slide-mark.is-warned {', own)).toBeGreaterThan(own);
  });

  it('fills the error badge with the danger colour and its own text colour', () => {
    expect(readFileSync(new URL('../creator/creator.css', import.meta.url), 'utf8')).toMatch(
      /\.badge-error \{\s*background: var\(--danger\);\s*color: var\(--on-danger\);/,
    );
  });
});
