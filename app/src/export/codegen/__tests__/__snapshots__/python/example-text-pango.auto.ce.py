# Font text — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 420 frames, like the editor's video export.
from manim import *


def _mfe_text_contours(mob, target):
    contours = []
    for path in mob.get_subpaths():
        if len(path) < 3:
            continue
        contour = [float(path[0][0]), float(path[0][1])]
        if target == 'ce':
            for i in range(0, len(path), 4):
                curve = path[i:i + 4]
                if len(curve) != 4:
                    raise ValueError('Unexpected CE text contour topology.')
                contour.extend(float(v) for point in curve[1:] for v in point[:2])
        else:
            for i in range(0, len(path) - 2, 2):
                a, h, b = path[i:i + 3]
                contour.extend(float(v) for point in ((a + 2 * h) / 3, (2 * h + b) / 3, b)
                               for v in point[:2])
        if len(contour) > 2:
            contours.append(contour)
    return contours


def _mfe_verify_text(mob, name, target, count, expected=None):
    """Says, on stderr, when Manim has not built the text the editor showed, and keeps the
    scene running. `count` is the number of its glyphs there, `expected` the fingerprint of
    their outlines (none for a text the other library shaped). Other fonts, or other versions
    of Manim, Pango or the libraries under them, draw a text differently. With fewer glyphs
    here, empty ones are added: every glyph the scene names exists."""
    import hashlib
    import json
    import math
    import sys
    built = len(mob.submobjects)
    same = built == count
    if same and expected is not None:
        try:
            contours = [_mfe_text_contours(glyph, target) for glyph in mob.submobjects]
            quantized = [[[math.floor(v * 1000000 + 0.5) for v in path] for path in glyph]
                         for glyph in contours]
            same = expected == hashlib.sha256(
                json.dumps(quantized, separators=(',', ':')).encode()).hexdigest()
        except Exception:
            same = False
    if built < count:
        mob.add(*[VMobject() for _ in range(count - built)])
    if same:
        return
    if built == count:
        glyphs = ('It may look different, and colours or animations of single glyphs may fall '
                  'on other glyphs.')
    else:
        glyphs = (f'It has {built} glyphs here and {count} there, so colours and animations of '
                  'single glyphs fall on other glyphs.')
    try:
        # On a line of its own: ManimGL leaves a progress bar open on stderr.
        print(f'\nWarning: the text {name!r} is not drawn here as in the editor (other fonts, or '
              f'other versions of Manim or Pango). {glyphs} To match it again, shape the text '
              'again in the editor, on this machine and for this library, and export again.',
              file=sys.stderr)
    except Exception:
        pass


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # title: The quadratic equation
        with tempconfig({'pixel_width': 1920, 'pixel_height': 1080}):
            title = Text(r"The quadratic equation", font=r"DejaVu Sans", font_size=56, weight=r"BOLD", slant=r"NORMAL", disable_ligatures=False)
        _mfe_verify_text(title, r"title", "ce", 20, "fcc45f4fff6a38d65db14f24dc82facce5ef3631690b452c53f254a292ab589d")
        title.set_color("#FFFFFF")
        title[3:12].set_color("#58C4DD")
        title.move_to([0, 2.6, 0])
        title.set_z_index(2)

        # note: with a ≠ 0 (plain text: no LaTeX, any font)
        with tempconfig({'pixel_width': 1920, 'pixel_height': 1080}):
            note = Text(r"""with a ≠ 0
(plain text: no LaTeX, any font)""", font=r"DejaVu Sans", font_size=32, weight=r"NORMAL", slant=r"ITALIC", disable_ligatures=False)
        _mfe_verify_text(note, r"note", "ce", 34, "4f607cbfdc71d8e7be7fe6e11f58ecd5e5280af79a04e7e2edb76ed590cf6e03")
        note.set_color("#BBBBBB")
        note.move_to([0, 1.1, 0])
        note.set_z_index(1)

        # equation: ax^2+bx+c=0
        equation = MathTex(r"ax^2+bx+c=0", font_size=72)
        equation.move_to([0, -1.2, 0])

        # 0 s – 1.2 s: title write
        self.play(Write(title), run_time=1.2)
        # 1.2 s – 1.8 s: note fade_in
        self.play(FadeIn(note), run_time=0.6)
        # 1.8 s – 2 s
        self.wait(0.2)
        # 2 s – 2.6 s: note part
        self.play(note[4:7].animate.set_color("#FFFF00"), run_time=0.6)
        # 2.6 s – 3 s
        self.wait(0.4)
        # 3 s – 4 s: note → equation, equation write
        self.play(
            ReplacementTransform(note[4].copy(), equation[0][0]),
            ReplacementTransform(note[6].copy(), equation[0][9]),
            Write(equation[0][1:9]),
            run_time=1,
        )
        # 4 s – 6.2 s
        self.wait(2.2)
        # 6.2 s – 7 s: equation fade_out, note fade_out, title fade_out
        self.play(FadeOut(equation), FadeOut(note), FadeOut(title), run_time=0.8)
