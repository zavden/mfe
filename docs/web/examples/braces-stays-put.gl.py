# A brace stays where it was fitted — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl ABraceStaysWhereItWasFitted.py ABraceStaysWhereItWasFitted -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 660 frames, like the editor's video export.
from manimlib import *


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


class ABraceStaysWhereItWasFitted(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # series: x + y + z
        series = Tex(r"x + y + z", font_size=98.9888)
        series_g = _glyphs(series, [
            (-2.1909, 0.0336, 0.618, 0.5749), (-1.0428, 0.078, 0.8452, 0.8439), (0.0613, -0.089, 0.6036, 0.8219), (1.1304, 0.078, 0.8452, 0.8439),
            (2.2252, 0.0336, 0.5495, 0.5749),
        ])
        series.move_to([-2, 0.6, 0])

        # b1: brace, built on series where its clip starts

        # 0 s – 1.4 s: series write
        self.play(Write(VGroup(*series_g[:]), stroke_color="#FFFFFF"), run_time=1.4)
        # 1.4 s – 2 s
        self.wait(0.6)
        b1 = Brace(series, DOWN, buff=0.2)
        b1.set_color("#58C4DD")
        b1.set_z_index(1)
        # 2 s – 2.7 s: b1 grow_from_center
        self.play(GrowFromCenter(b1), run_time=0.7)
        # 2.7 s – 3.6 s
        self.wait(0.9)
        # 3.6 s – 4.8 s: series tween
        self.play(series.animate.move_to([2, 0.6, 0]), run_time=1.2)
        # 4.8 s – 6 s
        self.wait(1.2)
        # 6 s – 7.2 s: b1 tween
        self.play(b1.animate.move_to([2, -0.131375, 0]), run_time=1.2)
        # 7.2 s – 10.2 s
        self.wait(3)
        # 10.2 s – 11 s: b1 fade_out, series fade_out
        self.play(FadeOut(b1), FadeOut(series), run_time=0.8)
