# Glyph-parity harness

Checks that the app's formula engine decomposes formulas into the same glyphs Manim does:

- **ManimCE**: `MathTex(s)[0]` (LaTeX + dvisvgm), one glyph per submobject.
- **ManimGL**: `Tex(s)`, whose glyphs hang directly off the `Tex`.
- **LaTeX backend** (exact mode): the companion compiles the formula; `app/src/engine/latex.ts`
  parses the SVG like Manim and calibrates sizes per target.
- **MathJax backend** (free mode): `app/src/engine/mathjax.ts`, MathJax 3.2.2 SVG output.

The editor relates glyph _indices_ in the browser to glyph indices in the exported Manim code, so
what matters is (a) the same number of glyphs, (b) the same order, (c) the same positions and sizes
and, for MathJax, whose order differs, (d) that positional matching recovers the correspondence.

## Usage

From `app/`:

```bash
npm run parity
# or directly
node ../tests/parity/run.mjs [--corpus path/to/corpus.json]
```

`run.mjs` runs three stages:

1. **Dumps**: every corpus formula through ManimCE and ManimGL (`dump_ce.py`, `dump_gl.py`).
2. **CE vs GL**: glyph count and order, printed as a table.
3. **Engine** (`engine.parity.ts`, Vitest with `app/vitest.parity.config.ts`, jsdom):
   - spawns `python3 companion/mfe_companion.py serve --port <free port>` for the run (skipped,
     with a message, when the companion is missing or does not start);
   - **LaTeX vs CE / GL**: renders every formula with `prefer: 'latex'` for both targets and
     requires the same count, the same order and every glyph centre and size within 1e-3 scene
     units of the dump;
   - **MathJax vs LaTeX** (per target): glyph count, the position matcher judged by label agreement
     with the companion's labels, and the size calibration (least-squares fit of `MATHJAX_SCALE`
     on matched glyph widths and heights; rules and `\cancel` strokes excluded).

Python interpreters are detected through environment variables, with these defaults (relative to
this repository):

| Variable        | Default                              |
| --------------- | ------------------------------------ |
| `MFE_CE_PYTHON` | `<repo>/../manim_ce/venv/bin/python` |
| `MFE_GL_PYTHON` | `<repo>/../manim_gl/venv/bin/python` |

A missing interpreter skips its dump with a message, the engine checks that need it skip too (so
do the LaTeX checks when the companion does not start), and the verdict is `PARITY: INCOMPLETE`,
never `OK`, naming what was skipped (exit 0; `MFE_PARITY_STRICT=1` makes it exit 1). An interpreter
that is found but fails to dump makes the run `PARITY: FAILED` (exit 1). Otherwise the script
**exits non-zero only on unexpected results**: differences listed in `known-exceptions.json` are
reported but do not fail. The verdict is `verdict.mjs`, a pure function of what happened.

Dumps run with `cwd = tests/parity/results/.work/` because ManimCE writes a `media/` folder into the
current directory. Everything under `results/` is git-ignored.

## Files

| File                                 | Purpose                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `corpus.json`                        | 70 formulas: LaTeX strings or `{"latex": …, "packages": [ … ]}`                          |
| `known-exceptions.json`              | Explained differences: `ceGl`, `mathjaxCount`, `mathjaxMatch`, keyed by the corpus LaTeX |
| `dump_ce.py <corpus> <out>`          | ManimCE dump (centre, size, point count per glyph); packages via `TexTemplate`           |
| `dump_gl.py <corpus> <out>`          | ManimGL dump, same format; packages via `Tex(additional_preamble=…)`                     |
| `engine.parity.ts`                   | Engine checks (see above)                                                                |
| `run.mjs`                            | Runs everything and prints the summaries                                                 |
| `results/ce.json`, `gl.json`         | Raw dumps                                                                                |
| `results/report.json`, `engine.json` | CE-vs-GL report and engine report (per-formula rows, calibration, worst samples)         |
| `text_children.py`                   | Font text in ManimCE against ManimGL, run by hand (below)                                |
| `text_boxes.py`                      | The constants of the placeholder boxes on real Manim, run by hand (last section)         |

Packages in the corpus become one `\usepackage{…}` line each after the template's own packages —
the document the companion builds (docs/COMPANION.md).

## Results (reference machine: TeX Live 2025, dvisvgm 3.6, ManimCE 0.22, ManimGL 1.7)

- **CE vs GL**: same count and order on 67/70. Known exceptions: `\text{office}` and `\text{flow}`
  (CE merges the ffi/fl ligatures; GL's template has `\DisableLigatures`) and `\iint` (GL's template
  loads `wasysym`, whose `\iint` is one glyph; amsmath draws two `∫`).
- **LaTeX backend vs CE and vs GL**: 70/70 identical (count, order, centre and size within 1e-3).
  This includes the GL calibration: ManimGL measures h₀ on `latex_to_svg("0")`, a _text-mode_ 0
  (6.874222 SVG units, not the 6.854296 of math-mode `Tex("0")`), so the engine compiles `\text{0}`.
- **MathJax vs LaTeX**: equal glyph count on 60/70 (CE) and 63/70 (GL); every difference is a
  known exception (ligatures, `\iint`, tall delimiters assembled from a different number of pieces,
  `\neq` drawn as `/` over `=` by TeX, stretchy arrows and braces). The order differs on 28 of the
  equal-count formulas, and the position matcher recovers the correspondence in all of them:
  427/427 (CE) and 446/446 (GL) matched pairs have agreeing labels.
- **MathJax size calibration**: `MATHJAX_SCALE` = 1.044e-5 (CE) and 1.0122e-5 (GL) scene units per
  MathJax unit per font-size point (theory: 1.0378e-5 and 1.0065e-5). Relative size error: median
  0.75 %, rms 4.2 % (≈800 widths and heights); the outliers are script glyphs (TeX's optical sizes
  are up to 20 % wider) and stretchy delimiters.

## Adding formulas

Append entries to `corpus.json`. Formulas that LaTeX cannot compile appear with an `error` note
rather than aborting the run (and fail the engine checks only if Manim and the companion disagree).
When a new formula legitimately differs, add it to `known-exceptions.json` with the reason.

## Font text: ManimCE against ManimGL

`text_children.py` is a separate probe, run by hand (its header has the three commands): it builds
168 font texts in each library exactly as an exported scene does, `Text(source, font=…,
font_size=…, weight=…, slant=…, disable_ligatures=False)`, and compares the children. An export for
the library that did not shape a text addresses its glyphs by the other library's indices
([docs/ARCHITECTURE.md §8, "Font text"](../../docs/architecture/08a-export-python.md#font-text)),
which holds only if both build the same children in the same order.

Results on the reference machine (ManimCE 0.22, ManimGL 1.7, Pango 1.57; default font Noto Sans),
over accents (precomposed and combining), ligatures, several lines, an empty line, leading and
trailing spaces, a tab, symbols, literal markup, right-to-left text, scripts the font lacks, and
one-glyph texts, in eight fonts and three sizes:

- **Children**: the same number in 168/168, none without points, and the same order in 168/168
  (every step from a child to the next points the same way in both, across and from line to line).
  In two DejaVu Sans texts a few outlines are cut into another number of subpaths: the same glyphs,
  stored differently.
- **Size**: at equal `font_size` a ManimCE text is 1.4677 times as wide as ManimGL's (± 0.0003;
  a text of one glyph up to 0.5 % away, by the control points of its outline). ManimCE draws an em
  as `font_size / 72` scene units. ManimGL calibrates on the machine: the digit zero of Pango's
  default font is `font_size / 144` units tall, so the ratio is twice that zero's height in em
  (0.7339 for Noto Sans) and follows the machine's default font.
- **Lines**: ManimCE sets them `1.3 · font_size / 96` units apart, 0.975 em whatever the font;
  ManimGL at 0.96 of the font's own line height (Pango 1.50 or later), 1.07 to 1.31 em in these
  fonts. A text of several lines is 1.16 to 1.39 times as tall in ManimCE, not 1.47.
- **Tabs**: ManimCE writes a tab as four spaces, ManimGL keeps Pango's tab stops (`A⇥V` is 0.97 to
  1.32 times as wide).
- **Fallback fonts**: a script the font lacks is drawn by the same number of glyphs in the same
  order; in one italic case the two libraries pick fallback faces of different heights.

## Font text: the constants of the placeholder boxes

A font text nothing has shaped is drawn as one box per character (`app/src/engine/textBoxes.ts`,
[docs/ARCHITECTURE.md
§4](../../docs/architecture/04-formula-engine.md#placeholder-boxes-a-font-text-nothing-has-shaped)).
`text_boxes.py`, run by hand from an empty directory, measures the three constants that take that
layout to scene units. It starts a companion, has each library shape `MMMMMMMMMM`, three lines and
`M⇥M` in four fonts at two sizes, reads the advances and the line height of each font from its file,
and prints what Manim did next to what the app assumes (exit status 1 when one is more than 0.5 %
off).

Results on the reference machine, in DejaVu Sans, Noto Sans, Liberation Serif and Liberation Mono
at 48 and 96: every constant within 0.006 %.

- **Em**: `font_size / 72` scene units in ManimCE, that divided by 1.4678 in ManimGL (which
  follows the machine's default font, as above).
- **Lines**: 0.975 em from baseline to baseline in ManimCE; in ManimGL 0.96 of the font's ascent
  plus descent (`hhea`, without its line gap): 1.063 em in Liberation Serif, 1.308 em in Noto Sans.
- **Tabs**: four spaces in ManimCE; in ManimGL the next stop, one every eight spaces.
