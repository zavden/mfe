# Recipe: expand a square — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 RecipeExpandASquare.py RecipeExpandASquare
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


class RecipeExpandASquare(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # before: (a+b)^2
        before = MathTex(r"(a+b)^2", font_size=96)
        before_g = _glyphs(before, [
            (-1.3123, -0.059, 0.2108, 0.8819), (-0.9198, -0.0895, 0.4172, 0.3978), (-0.1519, -0.0586, 0.5874, 0.5865), (0.5909, 0.0217, 0.3369, 0.6218),
            (0.9194, -0.059, 0.2108, 0.8819), (1.2933, 0.2924, 0.2488, 0.4153),
        ])
        before_g[1].set_color("#58C4DD")
        before_g[3].set_color("#83C167")
        before.set_z_index(1)

        # after: a^2 + 2ab + b^2
        after = MathTex(r"a^2 + 2ab + b^2", font_size=96)
        after_g = _glyphs(after, [
            (-2.6618, -0.192, 0.4897, 0.4669), (-2.1763, 0.2562, 0.2921, 0.4875), (-1.3083, -0.1557, 0.6895, 0.6885), (-0.4172, -0.0703, 0.4131, 0.6895),
            (0.1212, -0.192, 0.4897, 0.4669), (0.6291, -0.0615, 0.3955, 0.7299), (1.4669, -0.1557, 0.6895, 0.6885), (2.3388, -0.0615, 0.3955, 0.7299),
            (2.7606, 0.2562, 0.2921, 0.4875),
        ])
        VGroup(after_g[0], after_g[4]).set_color("#58C4DD")
        VGroup(after_g[5], after_g[7]).set_color("#83C167")

        # 0 s – 1 s: before write
        self.play(Write(VGroup(*before_g[:])), run_time=1)
        # 1 s – 2.2 s
        self.wait(1.2)
        # 2.2 s – 3.7 s: before fade_out, before → after, after fade_in
        self.play(
            FadeOut(VGroup(before_g[0], before_g[4])),
            ReplacementTransform(VGroup(before_g[1]), VGroup(after_g[0], after_g[4])),
            ReplacementTransform(VGroup(before_g[3]), VGroup(after_g[5], after_g[7])),
            ReplacementTransform(VGroup(before_g[2]), VGroup(after_g[2], after_g[6])),
            ReplacementTransform(VGroup(before_g[5]), VGroup(after_g[1], after_g[8])),
            FadeIn(after_g[3]),
            run_time=1.5,
        )
        # 3.7 s – 5.3 s
        self.wait(1.6)
