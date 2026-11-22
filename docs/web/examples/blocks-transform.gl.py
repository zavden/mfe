# Transform blocks — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl TransformBlocks.py TransformBlocks -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 540 frames, like the editor's video export.
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


class TransformBlocks(Scene):
    default_camera_config = dict(background_color="#070B15")

    def construct(self):

        # eq: y = ax^2 + bx + c
        eq = Tex(r"y = ax^2 + bx + c", font_size=136.1096)
        eq_g = _glyphs(eq, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])
        VGroup(*eq_g[2:5]).set_color("#43EECA")

        # eq: y = ax^2 + bx + c
        eq_2 = Tex(r"y = ax^2 + bx + c", font_size=136.1096)
        eq_2_g = _glyphs(eq_2, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])
        VGroup(*eq_2_g[2:5]).set_color("#43EECA")

        self.add(eq)
        # 0 s – 1 s
        self.wait(1)
        # 1 s – 2.5 s: eq tween
        self.play(eq.animate.scale(0.55).move_to([3.4, -2, 0]).set_color("#F4C867"), run_time=1.5)
        # 2.5 s – 4.5 s
        self.wait(2)
        self.remove(eq)
        self.add(eq_2)
        # 4.5 s – 5.5 s
        self.wait(1)
        eq_2_pivot = VGroup(*eq_2_g[2:5]).get_center()
        # 5.5 s – 7 s: eq_2 part
        self.play(
            VGroup(*eq_2_g[2:5]).animate.scale(1.4, about_point=eq_2_pivot).shift(1.3 * UP).set_color("#F4C867"),
            run_time=1.5,
        )
        # 7 s – 9 s
        self.wait(2)
