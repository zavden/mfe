# Swapping two terms — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl SwappingTwoTerms.py SwappingTwoTerms -w -r 1920x1080 --fps 60
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


class SwappingTwoTerms(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # before: a+b
        before = Tex(r"a+b", font_size=197.9776)
        before_g = _glyphs(before, [
            (-1.0744, -0.1166, 0.6095, 0.5812), (0.0477, -0.0715, 0.8582, 0.857), (1.133, 0.0457, 0.4923, 0.9085),
        ])
        before_g[0].set_color("#F4C867")
        before_g[2].set_color("#58C4DD")
        before.set_z_index(1)

        # after: b+a
        after = Tex(r"b+a", font_size=197.9776)
        after_g = _glyphs(after, [
            (-1.1182, 0.0457, 0.4923, 0.9085), (-0.0754, -0.0715, 0.8582, 0.857), (1.0595, -0.1166, 0.6095, 0.5812),
        ])
        after_g[0].set_color("#58C4DD")
        after_g[2].set_color("#F4C867")

        # 0 s – 1 s: before write
        self.play(Write(VGroup(*before_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2.4 s
        self.wait(1.4)
        # 2.4 s – 3.9 s: before → after
        self.play(
            ReplacementTransform(before_g[0], after_g[2]),
            ReplacementTransform(before_g[1], after_g[1]),
            ReplacementTransform(before_g[2], after_g[0]),
            run_time=1.5,
        )
        # 3.9 s – 5.4 s
        self.wait(1.5)
