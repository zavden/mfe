# Fade copies — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 180 frames, like the editor's video export.
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


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # sum: a+b=c
        sum = MathTex(r"a+b=c")
        sum_g = _glyphs(sum, [
            (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
            (1.75, 0, 0.6875, 1),
        ])
        sum.move_to([0, 2, 0])
        sum.set_z_index(1)

        # swap: c=a+b
        swap = MathTex(r"c=a+b", color="#83C167")
        swap_g = _glyphs(swap, [
            (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
            (1.75, 0, 0.6875, 1),
        ])
        swap.set_z_index(2)

        # x: x
        x = MathTex(r"x", color="#FC6255")
        x_g = _glyphs(x, [
            (0, 0, 0.6875, 1),
        ])
        x.scale(2).move_to([-3, -2, 0])
        x.set_z_index(3)

        # y: y
        y = MathTex(r"y", color="#FFFF00")
        y_g = _glyphs(y, [
            (0, 0, 0.6875, 1),
        ])
        y.scale(2).move_to([3, -2, 0])

        # 0 s – 1 s: sum write
        self.play(Write(VGroup(*sum_g[:])), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        sum_g[3].set_z_index(2)
        # 1.5 s – 2.5 s: sum → swap
        self.play(
            FadeTransform(sum_g[0].copy().set_z_index(2), swap_g[2], path_arc=90 * DEGREES),
            FadeTransform(VGroup(sum_g[1], sum_g[2]).copy().set_z_index(2), VGroup(swap_g[3], swap_g[4]), path_arc=90 * DEGREES),
            ReplacementTransform(sum_g[4].copy().set_z_index(2), swap_g[0], path_arc=90 * DEGREES),
            FadeTransform(sum_g[3], swap_g[1], path_arc=90 * DEGREES),
            run_time=1,
        )
        # 2.5 s – 3.5 s
        self.wait(1)
        # 3.5 s – 4.3 s: sum → x
        self.play(
            FadeTransform(sum_g[0].copy().set_z_index(3), x_g[0]),
            FadeTransform(sum_g[2].copy().set_z_index(3), x_g[0]),
            run_time=0.8,
        )
        # 4.3 s – 4.5 s
        self.wait(0.2)
        # 4.5 s – 5.3 s: sum → y
        self.play(
            ReplacementTransform(sum_g[0].copy(), y_g[0], rate_func=linear),
            FadeTransform(sum_g[4].copy(), y_g[0], rate_func=linear),
            run_time=0.8,
        )
        # 5.3 s – 5.5 s
        self.wait(0.2)
        # 5.5 s – 6 s: sum fade_out, swap fade_out, x fade_out, y fade_out
        self.play(
            FadeOut(VGroup(*sum_g[:3], sum_g[4])),
            FadeOut(swap),
            FadeOut(x),
            FadeOut(y),
            run_time=0.5,
        )
