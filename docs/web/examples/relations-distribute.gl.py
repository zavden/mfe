# Distributing a factor — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl DistributingAFactor.py DistributingAFactor -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 324 frames, like the editor's video export.
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


class DistributingAFactor(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # before: a(b+c)
        before = Tex(r"a(b+c)", font_size=164.9813)
        before_g = _glyphs(before, [
            (-1.3952, -0.0345, 0.473, 0.451), (-0.9222, 0, 0.239, 1), (-0.5157, 0.0915, 0.382, 0.705), (0.2935, 0.0005, 0.666, 0.665),
            (1.1365, -0.0352, 0.3957, 0.4543), (1.5122, 0, 0.239, 1),
        ])
        before_g[0].set_color("#F4C867")
        before_g[2].set_color("#58C4DD")
        before_g[4].set_color("#FC6255")
        before.set_z_index(1)

        # after: ab+ac
        after = Tex(r"ab+ac", font_size=164.9813)
        after_g = _glyphs(after, [
            (-1.6966, -0.1166, 0.6095, 0.5812), (-1.0645, 0.0457, 0.4923, 0.9085), (-0.0217, -0.0715, 0.8582, 0.857), (1.1132, -0.1166, 0.6095, 0.5812),
            (1.7464, -0.1175, 0.5099, 0.5855),
        ])
        VGroup(after_g[0], after_g[3]).set_color("#F4C867")
        after_g[1].set_color("#58C4DD")
        after_g[4].set_color("#FC6255")

        # 0 s – 1.2 s: before write
        self.play(Write(VGroup(*before_g[:]), stroke_color="#FFFFFF"), run_time=1.2)
        # 1.2 s – 2.4 s
        self.wait(1.2)
        # 2.4 s – 3.9 s: before fade_out, before → after
        self.play(
            FadeOut(VGroup(before_g[1], before_g[5])),
            ReplacementTransform(VGroup(before_g[0]), VGroup(after_g[0], after_g[3])),
            ReplacementTransform(before_g[2], after_g[1]),
            ReplacementTransform(before_g[3], after_g[2]),
            ReplacementTransform(before_g[4], after_g[4]),
            run_time=1.5,
        )
        # 3.9 s – 5.4 s
        self.wait(1.5)
