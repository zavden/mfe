# Recipe: substitute a value — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl RecipeSubstituteAValue.py RecipeSubstituteAValue -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 318 frames, like the editor's video export.
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


class RecipeSubstituteAValue(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # before: x^2 + 3x
        before = Tex(r"x^2 + 3x", font_size=98.9888)
        before_g = _glyphs(before, [
            (-1.4138, -0.192, 0.5042, 0.469), (-0.8931, 0.2562, 0.2921, 0.4875), (-0.0251, -0.1557, 0.6895, 0.6885), (0.8661, -0.0822, 0.4297, 0.7113),
            (1.4138, -0.192, 0.5042, 0.469),
        ])
        VGroup(before_g[0], before_g[4]).set_color("#F4C867")
        before.move_to([0, 1.3, 0])
        before.set_z_index(1)

        # after: 2^2 + 3 \cdot 2
        after = Tex(r"2^2 + 3 \cdot 2", font_size=98.9888)
        after_g = _glyphs(after, [
            (-1.7505, -0.0703, 0.4131, 0.6895), (-1.2743, 0.2562, 0.2921, 0.4875), (-0.4063, -0.1557, 0.6895, 0.6885), (0.4849, -0.0822, 0.4297, 0.7113),
            (1.1177, -0.1563, 0.1253, 0.1242), (1.7505, -0.0703, 0.4131, 0.6895),
        ])
        VGroup(after_g[0], after_g[5]).set_color("#F4C867")
        after.move_to([0, -1.3, 0])

        # 0 s – 1 s: before write
        self.play(Write(VGroup(*before_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2.2 s
        self.wait(1.2)
        # 2.2 s – 3.7 s: before → after, after fade_in
        self.play(
            TransformFromCopy(before_g[0], after_g[0]),
            TransformFromCopy(before_g[1], after_g[1]),
            TransformFromCopy(before_g[2], after_g[2]),
            TransformFromCopy(before_g[3], after_g[3]),
            TransformFromCopy(before_g[4], after_g[5]),
            FadeIn(VGroup(after_g[4])),
            run_time=1.5,
        )
        # 3.7 s – 5.3 s
        self.wait(1.6)
