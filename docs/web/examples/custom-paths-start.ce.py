# Swap, straight paths — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 SwapStraightPaths.py SwapStraightPaths
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 264 frames, like the editor's video export.
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


class SwapStraightPaths(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # ab: a \qquad\qquad b
        ab = MathTex(r"a \qquad\qquad b", font_size=144)
        ab_g = _glyphs(ab, [
            (-3.1525, -0.1787, 0.6709, 0.6397), (3.217, 0, 0.5418, 1),
        ])
        ab_g[0].set_color("#58C4DD")
        ab_g[1].set_color("#F4C867")
        ab.set_z_index(1)

        # ba: b \qquad\qquad a
        ba = MathTex(r"b \qquad\qquad a", font_size=144)
        ba_g = _glyphs(ba, [
            (-3.2007, 0, 0.5418, 1), (3.1362, -0.1787, 0.6709, 0.6397),
        ])
        ba_g[0].set_color("#F4C867")
        ba_g[1].set_color("#58C4DD")

        # 0 s – 0.8 s: ab write
        self.play(Write(VGroup(ab_g[0], ab_g[1])), run_time=0.8)
        # 0.8 s – 1.6 s
        self.wait(0.8)
        # 1.6 s – 3.6 s: ab → ba
        self.play(
            ReplacementTransform(ab_g[0], ba_g[1]),
            ReplacementTransform(ab_g[1], ba_g[0]),
            run_time=2,
        )
        # 3.6 s – 4.4 s
        self.wait(0.8)
