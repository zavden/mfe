# Timing: the block to split — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 TimingTheBlockToSplit.py TimingTheBlockToSplit
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


class TimingTheBlockToSplit(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # equation: a + b = c + d
        equation = MathTex(r"a + b = c + d", font_size=96)
        equation_g = _glyphs(equation, [
            (-3.3418, -0.1166, 0.6095, 0.5812), (-2.2197, -0.0715, 0.8582, 0.857), (-1.1344, 0.0457, 0.4923, 0.9085), (-0.02, -0.0722, 0.8582, 0.3015),
            (1.1381, -0.1175, 0.5099, 0.5855), (2.1849, -0.0715, 0.8582, 0.857), (3.3308, 0.0464, 0.6314, 0.9072),
        ])

        # 0 s – 0.4 s
        self.wait(0.4)
        self.add(equation_g[3])
        # 0.4 s – 1.2 s
        self.wait(0.8)
        # 1.2 s – 2.4 s: equation write
        self.play(Write(VGroup(*equation_g[:3], *equation_g[4:])), run_time=1.2)
        # 2.4 s – 5 s
        self.wait(2.6)
