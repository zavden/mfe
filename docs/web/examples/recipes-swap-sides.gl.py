# Recipe: swap the sides — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl RecipeSwapTheSides.py RecipeSwapTheSides -w -r 1920x1080 --fps 60
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


class RecipeSwapTheSides(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # before: y = x + 2
        before = Tex(r"y = x + 2", font_size=98.9888)
        before_g = _glyphs(before, [
            (-2.0496, -0.1282, 0.5461, 0.7436), (-1.0186, 0.0224, 0.7646, 0.2687), (0.0667, -0.0172, 0.5591, 0.5201), (1.1054, 0.023, 0.7646, 0.7635),
            (2.0936, 0.1177, 0.4581, 0.7646),
        ])
        before_g[0].set_color("#F4C867")
        before.set_z_index(1)

        # after: x + 2 = y
        after = Tex(r"x + 2 = y", font_size=98.9888)
        after_g = _glyphs(after, [
            (-2.0681, -0.0172, 0.5591, 0.5201), (-1.0294, 0.023, 0.7646, 0.7635), (-0.0413, 0.1177, 0.4581, 0.7646), (1.0119, 0.0224, 0.7646, 0.2687),
            (2.0746, -0.1282, 0.5461, 0.7436),
        ])
        after_g[4].set_color("#F4C867")

        # 0 s – 1 s: before write
        self.play(Write(VGroup(*before_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2.2 s
        self.wait(1.2)
        # 2.2 s – 3.7 s: before → after
        self.play(
            ReplacementTransform(before_g[2], after_g[0], path_arc=60 * DEGREES),
            ReplacementTransform(before_g[3], after_g[1], path_arc=60 * DEGREES),
            ReplacementTransform(before_g[4], after_g[2], path_arc=60 * DEGREES),
            ReplacementTransform(before_g[1], after_g[3], path_arc=60 * DEGREES),
            ReplacementTransform(before_g[0], after_g[4], path_arc=60 * DEGREES),
            run_time=1.5,
        )
        # 3.7 s – 5.3 s
        self.wait(1.6)
