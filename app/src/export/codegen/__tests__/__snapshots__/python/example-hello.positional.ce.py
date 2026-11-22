# Hello: one-to-one — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 300 frames, like the editor's video export.
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

        # a1: mx+y=0
        a1 = MathTex(r"mx+y=0")
        a1_g = _glyphs(a1, [
            (-2.3783, -0.0173, 0.9403, 0.5202), (-1.5546, -0.0173, 0.5718, 0.5202), (-0.5165, 0.0224, 0.7635, 0.7647), (0.4835, -0.1286, 0.5292, 0.7428),
            (1.5544, 0.0224, 0.7635, 0.2687), (2.6068, 0.1051, 0.4833, 0.7898),
        ])
        a1_g[2].set_color("#FFFF00")
        a1.set_z_index(1)

        # f2: mx=-y
        f2 = MathTex(r"mx=-y")
        f2_g = _glyphs(f2, [
            (-2.4749, 0.1499, 1.2659, 0.7003), (-1.366, 0.1499, 0.7698, 0.7003), (0.1177, 0.2032, 1.0279, 0.3618), (1.7491, 0.2032, 0.9445, 0.0617),
            (2.7516, 0, 0.7124, 1),
        ])
        f2_g[3].set_color("#FFFF00")

        # 0 s – 1 s: a1 write
        self.play(Write(VGroup(*a1_g[:])), run_time=1)
        # 1 s – 2 s
        self.wait(1)
        # 2 s – 3 s: a1 fade_out, a1 → f2
        self.play(
            FadeOut(a1_g[5]),
            ReplacementTransform(VGroup(a1_g[0], a1_g[1]), VGroup(f2_g[0], f2_g[1])),
            ReplacementTransform(a1_g[4], f2_g[2]),
            ReplacementTransform(a1_g[2], f2_g[3]),
            ReplacementTransform(a1_g[3], f2_g[4]),
            run_time=1,
        )
        # 3 s – 3.2 s
        self.wait(0.2)
        # 3.2 s – 3.8 s: f2 tween
        self.play(f2.animate.move_to([0, 1.5, 0]), run_time=0.6)
        # 3.8 s – 4 s
        self.wait(0.2)
        # 4 s – 5 s: f2 fade_out
        self.play(FadeOut(f2), run_time=1)
