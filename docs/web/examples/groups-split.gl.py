# One block over both sides — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl OneBlockOverBothSides.py OneBlockOverBothSides -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 300 frames, like the editor's video export.
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


class OneBlockOverBothSides(Scene):
    default_camera_config = dict(background_color="#070B15")

    def construct(self):

        # eq: 2x + 4 = 10
        eq = Tex(r"2x + 4 = 10", font_size=123.736)
        eq_g = _glyphs(eq, [
            (-3.056, 0.0468, 0.5257, 0.8775), (-2.359, -0.108, 0.6416, 0.5968), (-1.1671, -0.0619, 0.8775, 0.8762), (-0.0331, 0.054, 0.5837, 0.892),
            (1.1755, -0.0626, 0.8775, 0.3083), (2.39, 0.0468, 0.4532, 0.8775), (3.0415, 0.0323, 0.5547, 0.9065),
        ])

        self.add(eq_g[4])
        # 0 s – 1 s
        self.wait(1)
        # 1 s – 2 s: eq write
        self.play(Write(VGroup(*eq_g[:4], eq_g[5], eq_g[6]), stroke_color="#FFFFFF"), run_time=1)
        # 2 s – 5 s
        self.wait(3)
