# Cancelling a common factor — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 CancellingACommonFactor.py CancellingACommonFactor
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 600 frames, like the editor's video export.
from manim import *


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


def _cross_line(mobject, rising=True, **kwargs):
    """One line of a Cross over the mobject: from its lower left corner up to its upper right one,
    or (rising=False) from its upper left corner down to its lower right one."""
    falling, other = Cross(mobject)
    ends = (other.get_end(), other.get_start()) if rising else (falling.get_start(), falling.get_end())
    return Line(*ends, **kwargs)


class CancellingACommonFactor(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # fraction: \frac{ab}{ac}
        fraction = MathTex(r"\frac{ab}{ac}", font_size=144)
        fraction_g = _glyphs(fraction, [
            (-0.1013, 0.2687, 0.2287, 0.218), (0.1359, 0.3296, 0.1847, 0.3409), (-0.1023, -0.3898, 0.2287, 0.218), (0.1353, -0.3902, 0.1913, 0.2197),
            (0, -0.0415, 0.5618, 0.029),
        ])

        # x1: cross_line, built on fraction where its clip starts

        # x2: cross_line, built on fraction where its clip starts

        # result: \frac{b}{c}
        result = MathTex(r"\frac{b}{c}", font_size=144)
        result_g = _glyphs(result, [
            (0.008, 0.3296, 0.1847, 0.3409), (0.0074, -0.3902, 0.1913, 0.2197), (0, -0.0415, 0.306, 0.029),
        ])
        result.set_z_index(1)

        # 0 s – 1.2 s: fraction write
        self.play(Write(VGroup(*fraction_g[:])), run_time=1.2)
        # 1.2 s – 2 s
        self.wait(0.8)
        x1 = _cross_line(fraction_g[0], color="#FC6255", stroke_width=6)
        x1.set_z_index(3)
        x2 = _cross_line(fraction_g[2], color="#FC6255", stroke_width=6)
        x2.set_z_index(2)
        # 2 s – 2.6 s: x1 create, x2 create
        self.play(Create(x1), Create(x2), run_time=0.6)
        # 2.6 s – 4.4 s
        self.wait(1.8)
        # 4.4 s – 4.8 s: x1 fade_out, x2 fade_out
        self.play(FadeOut(x1), FadeOut(x2), run_time=0.4)
        # 4.8 s – 5 s
        self.wait(0.2)
        fraction_g[1].set_z_index(1)
        fraction_g[3].set_z_index(1)
        fraction_g[4].set_z_index(1)
        # 5 s – 6 s: fraction fade_out, fraction → result
        self.play(
            FadeOut(VGroup(fraction_g[0], fraction_g[2])),
            ReplacementTransform(fraction_g[1], result_g[0]),
            ReplacementTransform(fraction_g[3], result_g[1]),
            ReplacementTransform(fraction_g[4], result_g[2]),
            run_time=1,
        )
        # 6 s – 10 s
        self.wait(4)
