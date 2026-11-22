# Recipe: combine like terms — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 RecipeCombineLikeTerms.py RecipeCombineLikeTerms
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


class RecipeCombineLikeTerms(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # before: 3x + 2x + 4
        before = MathTex(r"3x + 2x + 4", font_size=96)
        before_g = _glyphs(before, [
            (-3.0322, 0.0316, 0.5468, 0.9051), (-2.3352, -0.108, 0.6416, 0.5968), (-1.1433, -0.0619, 0.8775, 0.8762), (-0.0093, 0.0468, 0.5257, 0.8775),
            (0.6877, -0.108, 0.6416, 0.5968), (1.8798, -0.0619, 0.8775, 0.8762), (3.0138, 0.054, 0.5837, 0.892),
        ])
        VGroup(before_g[0], before_g[1], before_g[3], before_g[4]).set_color("#58C4DD")
        before.set_z_index(1)

        # after: 5x + 4
        after = MathTex(r"5x + 4", font_size=96)
        after_g = _glyphs(after, [
            (-1.526, 0.0323, 0.5257, 0.9065), (-0.829, -0.108, 0.6416, 0.5968), (0.363, -0.0619, 0.8775, 0.8762), (1.497, 0.054, 0.5837, 0.892),
        ])
        VGroup(after_g[0], after_g[1]).set_color("#58C4DD")

        # 0 s – 1 s: before write
        self.play(Write(VGroup(*before_g[:])), run_time=1)
        # 1 s – 2.2 s
        self.wait(1.2)
        # 2.2 s – 3.7 s: before fade_out, before → after
        self.play(
            FadeOut(before_g[2]),
            ReplacementTransform(VGroup(before_g[0], before_g[3]), VGroup(after_g[0])),
            ReplacementTransform(VGroup(before_g[1], before_g[4]), VGroup(after_g[1])),
            ReplacementTransform(before_g[5], after_g[2]),
            ReplacementTransform(before_g[6], after_g[3]),
            run_time=1.5,
        )
        # 3.7 s – 5.3 s
        self.wait(1.6)
