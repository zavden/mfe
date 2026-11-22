# First animation: the first clip — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 FirstAnimationTheFirstClip.py FirstAnimationTheFirstClip
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
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


class FirstAnimationTheFirstClip(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # f1: x+3=5
        f1 = MathTex(r"x+3=5", font_size=96)
        f1_g = _glyphs(f1, [
            (-2.3763, -0.1023, 0.6511, 0.6056), (-1.1668, -0.0555, 0.8904, 0.889), (-0.0162, 0.0394, 0.5548, 0.9184), (1.2102, -0.0561, 0.8904, 0.3128),
            (2.4352, 0.0401, 0.5334, 0.9198),
        ])
        f1.set_z_index(1)

        self.add(f1)
        # 0 s – 3 s
        self.wait(3)
