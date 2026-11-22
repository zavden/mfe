# Recipe: move a term — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 RecipeMoveATerm.py RecipeMoveATerm
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 318 frames, like the editor's video export.
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


class RecipeMoveATerm(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # before: 2x - 4 = 6
        before = MathTex(r"2x - 4 = 6", font_size=96)
        before_g = _glyphs(before, [
            (-2.9578, 0.0079, 0.5708, 0.9528), (-2.201, -0.1602, 0.6967, 0.6481), (-0.9067, -0.1109, 0.8727, 0.0572), (0.3246, 0.0157, 0.6338, 0.9685),
            (1.6369, -0.1109, 0.9528, 0.3348), (2.9466, -0.0079, 0.5932, 0.9843),
        ])
        VGroup(before_g[2], before_g[3]).set_color("#F4C867")
        before.set_z_index(1)

        # after: 2x = 6 + 4
        after = MathTex(r"2x = 6 + 4", font_size=96)
        after_g = _glyphs(after, [
            (-2.7339, 0.0468, 0.5257, 0.8775), (-2.0369, -0.108, 0.6416, 0.5968), (-0.7717, -0.0626, 0.8775, 0.3083), (0.4345, 0.0323, 0.5463, 0.9065),
            (1.5709, -0.0619, 0.8775, 0.8762), (2.7049, 0.054, 0.5837, 0.892),
        ])
        VGroup(after_g[4], after_g[5]).set_color("#F4C867")

        # 0 s – 1 s: before write
        self.play(Write(VGroup(*before_g[:])), run_time=1)
        # 1 s – 2.2 s
        self.wait(1.2)
        # 2.2 s – 3.7 s: before → after
        self.play(
            ReplacementTransform(before_g[0], after_g[0], path_arc=-45 * DEGREES),
            ReplacementTransform(before_g[1], after_g[1], path_arc=-45 * DEGREES),
            ReplacementTransform(before_g[4], after_g[2], path_arc=-45 * DEGREES),
            ReplacementTransform(before_g[5], after_g[3], path_arc=-45 * DEGREES),
            ReplacementTransform(before_g[2], after_g[4], path_arc=-45 * DEGREES),
            ReplacementTransform(before_g[3], after_g[5], path_arc=-45 * DEGREES),
            run_time=1.5,
        )
        # 3.7 s – 5.3 s
        self.wait(1.6)
