# Themes and transformations for Manim

The application assigns colors by role: background, formula, variables,
constants, operators, result, text, secondary text, rectangles, circles, and
arrows. Changing the theme preserves the mathematics and the identifiers that
connect each symbol between steps. Opacity affects highlight fills; outlines
and letters retain their role's opaque color.

## What exports contain

- **Theme JSON:** HEX colors, opacity, stroke width, font scale, mode,
  independent seeds, locks, linked groups (`groups`), and background mode
  (`backgroundMode`: `auto` or `manual`). It has `format: "manim-palette"`
  and `version: 1`; the theme is at the document root.
- **Theme Python:** a standalone module with `THEME`, `COLORS`,
  `COLOR_GROUPS`, `PALETTE`, `STYLE`, `apply_theme(scene)`, `color_for(role)`,
  and `style_highlight(mobject, role)`. Importing it does not change Manim's
  global configuration.
- **Scene Python:** an executable `PaletteScene` class containing the selected
  scene and current theme. It needs no JavaScript files or other files to
  obtain its data. It uses `ReplacementTransform` for identifiers present in
  both steps and entrance/exit animations for the others.

Strings are inserted as JSON data and recovered with `json.loads`.
Names, notes, and symbols are never interpolated as executable Python code.

`groups` contains a partition of the ten foreground roles: each role appears
exactly once, and each group shares exactly one color and lock state. The
background remains separate. The order is always formula, variables,
constants, operators, result, text, secondary text, rectangles, circles, and
arrows; each group occupies the position of its first role. Older themes
without these fields are exported with ten individual groups and a manual
background, preserving their colors.

Both Python files preserve all eleven roles in `COLORS`, so scenes can keep
using names such as `COLORS["variable"]`. `COLOR_GROUPS` contains the groups,
and `PALETTE` provides the compact list: first the background, then one color
per group. With all ten foreground roles linked, `PALETTE` contains two entries;
with all roles independent, eleven. Two independent groups can have the same
HEX and retain their own entries. Incomplete or repeated groups, groups that
include the background, and groups with differing colors or lock states are
rejected during export.

Exported scenes use Pango `Text` with DejaVu Sans and draw fraction bars,
exponents, subscripts, and highlights separately. This allows rendering without
LaTeX. The browser SVG is an approximation: it shares coordinates, colors, and
steps, but its typography and transitions are not a Manim render. Metrics may
differ across systems. A theme can also be applied to custom `MathTex` scenes.

## Use a theme in your own scene

Save the exported module as `palette_theme.py` alongside your scene:

```python
from manim import Scene, MathTex, Write
from palette_theme import COLORS, STYLE, apply_theme

class MyScene(Scene):
    def construct(self):
        apply_theme(self)
        equation = MathTex("x", "=", "4", font_size=64 * STYLE["fontScale"])
        equation[0].set_color(COLORS["variable"])
        equation[1].set_color(COLORS["operator"])
        equation[2].set_color(COLORS["result"])
        self.play(Write(equation))
```

To transform LaTeX formulas by matching fragments, the example
`examples/manim/mathtex_validation.py` uses `MathTex` and `TransformMatchingTex`.
Manim matches fragments by their LaTeX strings; the example's separate
arguments make those fragments explicit. See the
[official TransformMatchingTex reference](https://docs.manim.community/en/stable/reference/manim.animation.transform_matching_parts.TransformMatchingTex.html).

## Reproducible examples without installing Python

The verified existing environment is **Manim Community 0.21.0** (`manim` below
is its executable: give its full path if it is not on your `PATH`):

```sh
manim --version
```

From this project's root, regenerate the examples using the same functions as
the application:

```sh
node examples/manim/generate.mjs
```

This writes `scene_1.py` (solving an equation, Midnight chalkboard theme), `scene_2.py`
(cancelling a common factor, Ink & paper theme), `palette_theme.py`, and both
JSON themes. The hand-authored LaTeX scene reads the first theme.

Full verification uses only the existing executable and neither installs
packages nor opens preview windows:

```sh
python3 -B scripts/verify-manim.py
```

The verifier regenerates the examples, renders all three animations with Cairo
at 640 × 360 and 12 fps, checks the videos with `ffprobe`, extracts three frames
from each, and saves a report to `artifacts/manim/verification.json`.
It keeps videos, text/LaTeX caches, temporary files, and logs inside
`artifacts/manim`, and disables Python bytecode writes. It requires the
existing `ffmpeg` and `ffprobe` executables; the third example also requires
`latex` and `dvisvgm`.

To render an exported scene directly:

```sh
PYTHONDONTWRITEBYTECODE=1 manim render \
  --config_file examples/manim/manim.cfg --renderer cairo \
  -ql --progress_bar none --silent examples/manim/scene_1.py PaletteScene
```

The configuration file directs media and text/LaTeX caches to
`artifacts/manim`. The verifier is the recommended way to redirect temporary
files and supporting library caches as well.

## Checks

`tests/manim-export.test.js` checks color and geometry preservation for all
twelve scenes, compiles every export with Python without importing Manim or
writing bytecode, checks strings containing quotes and Unicode, and rejects
duplicate identifiers or highlights without targets. It also checks migration
of older themes, linked groups, automatic or manual backgrounds, and compact
palette entries in both Python exports.

Manim verification is an additional check: it produces real videos of two
exported scenes with dark and light backgrounds, and the LaTeX scene. Frames
from the beginning, middle, and end are available for visual inspection in
`artifacts/manim/frames`. Low-quality videos verify behavior; final quality is
controlled with normal Manim options, such as `-qh`.

## Gallery and color recipes

Copies of the three verification videos shown to users are in
`examples/previews/`; the gallery loads them locally with video controls and
no autoplay. Posters are actual rendered frames. These copies are example
assets and do not change when the web theme is edited.

The JSON and Python module also include `generation` when a theme comes from
the generator: method, relative chroma, diversity, and optional base.
Together with `seeds`, `mode`, `groups`, `backgroundMode`, `locks`, and locked
colors, this allows the same colors to be reconstructed. Manually changing a
HEX value in the studio removes that recipe, so an edited result is not
attributed to random generation; edited colors are still preserved exactly
in the export.
