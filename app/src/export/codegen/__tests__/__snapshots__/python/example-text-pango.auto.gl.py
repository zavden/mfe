# Font text — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl Pinned.py Pinned -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 420 frames, like the editor's video export.
from manimlib import *


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


def _glyphs(tex, layout):
    """The glyphs of `tex` in the editor's order. That order (MathJax's, or another
    template's) can differ from Manim's, so the glyphs are matched by position: `layout`
    holds each glyph's (x, y, width, height) relative to the formula centre, divided by the
    formula height, and every real glyph is assigned to one entry with the least total
    distance. Entries without a counterpart get an empty VMobject."""
    from scipy.optimize import linear_sum_assignment

    real = tex.family_members_with_points()
    glyphs = [VMobject() for _ in layout]
    if len(real) != len(layout):
        print(f"Warning: Manim made {len(real)} glyphs of a formula the editor split into "
              f"{len(layout)}; unmatched glyphs are not animated.")
    if not real or not layout:
        return glyphs  # nothing to match (a formula without ink, such as \quad)
    centre, height = tex.get_center(), tex.get_height()
    if height < 1e-6:
        height = 1.0  # a flat mobject (a rule): the editor's layout is divided by 1 then too
    have = np.array([
        [*((g.get_center() - centre)[:2] / height), g.get_width() / height, g.get_height() / height]
        for g in real
    ])
    want = np.array(layout, dtype=float)
    cost = np.linalg.norm(want[:, None, :] - have[None, :, :], axis=2)
    for i, j in zip(*linear_sum_assignment(cost)):
        glyphs[i] = real[j]
    return glyphs


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # title: The quadratic equation
        title = Text(r"The quadratic equation", font=r"DejaVu Sans", font_size=82.1968, weight=r"BOLD", slant=r"NORMAL", disable_ligatures=False, alignment='LEFT')
        _mfe_verify_text(title, r"title", "gl", 20)
        title.set_color("#FFFFFF")
        title[3:12].set_color("#58C4DD")
        title.move_to([0, 2.6, 0])
        title.set_z_index(2)

        # note: with a ≠ 0 (plain text: no LaTeX, any font)
        note = Text(r"""with a ≠ 0
(plain text: no LaTeX, any font)""", font=r"DejaVu Sans", font_size=46.9696, weight=r"NORMAL", slant=r"ITALIC", disable_ligatures=False, alignment='LEFT')
        _mfe_verify_text(note, r"note", "gl", 34)
        note.set_color("#BBBBBB")
        note.move_to([0, 1.1, 0])
        note.set_z_index(1)

        # equation: ax^2+bx+c=0
        equation = Tex(r"ax^2+bx+c=0", font_size=72)
        equation_g = _glyphs(equation, [
            (-3.4985, -0.1893, 0.4767, 0.4715), (-2.9389, -0.1893, 0.5184, 0.4715), (-2.4264, 0.2581, 0.3221, 0.4838), (-1.5307, -0.1534, 0.6922, 0.6933),
            (-0.6537, -0.0581, 0.3831, 0.7338), (-0.1581, -0.1893, 0.5184, 0.4715), (0.7832, -0.1534, 0.6922, 0.6933), (1.6648, -0.1893, 0.4049, 0.4715),
            (2.5637, -0.1534, 0.6922, 0.2436), (3.5177, -0.0784, 0.4382, 0.7162),
        ])
        equation.move_to([0, -1.2, 0])

        # 0 s – 1.2 s: title write
        self.play(Write(title, stroke_color="#FFFFFF"), run_time=1.2)
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
            TransformFromCopy(note[4], equation_g[0]),
            TransformFromCopy(note[6], equation_g[9]),
            Write(VGroup(*equation_g[1:9]), stroke_color="#FFFFFF"),
            run_time=1,
        )
        # 4 s – 6.2 s
        self.wait(2.2)
        # 6.2 s – 7 s: equation fade_out, note fade_out, title fade_out
        self.play(FadeOut(equation), FadeOut(note), FadeOut(title), run_time=0.8)
