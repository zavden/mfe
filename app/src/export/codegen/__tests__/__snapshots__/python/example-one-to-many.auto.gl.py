# One-to-many — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl Pinned.py Pinned -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 360 frames, like the editor's video export.
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


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # f1: a+b=c
        f1 = Tex(r"a+b=c")
        f1_g = _glyphs(f1, [
            (-2.2174, -0.1158, 0.5894, 0.5832), (-1.0972, -0.0713, 0.8561, 0.8574), (-0.0127, 0.0463, 0.4736, 0.9075), (1.0999, -0.0713, 0.8561, 0.3013),
            (2.2617, -0.1158, 0.5008, 0.5832),
        ])
        f1.move_to([0, 2, 0])
        f1.set_z_index(3)

        # f2: a: 3
        f2 = Tex(r"a: 3")
        f2_g = _glyphs(f2, [
            (-0.96, -0.1549, 0.6656, 0.6586), (0.0231, -0.1549, 0.1541, 0.6265), (0.9912, 0, 0.6032, 1),
        ])
        f2.move_to([-4, -1, 0])
        f2.set_z_index(2)

        # f3: b: 1
        f3 = Tex(r"b: 1")
        f3_g = _glyphs(f3, [
            (-0.8981, 0, 0.5219, 1), (-0.026, -0.1788, 0.1503, 0.6113), (0.925, -0.012, 0.4681, 0.9448),
        ])
        f3.move_to([0, -1, 0])
        f3.set_z_index(1)

        # f4: c: 4
        f4 = Tex(r"c: 4")
        f4_g = _glyphs(f4, [
            (-0.95, -0.1707, 0.5656, 0.6587), (-0.0576, -0.1707, 0.1541, 0.6266), (0.9108, 0.008, 0.6441, 0.9841),
        ])
        f4.move_to([4, -1, 0])

        # 0 s – 1 s: f1 write
        self.play(Write(VGroup(*f1_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        # 1.5 s – 2.5 s: f1 → f2, f2 fade_in
        self.play(TransformFromCopy(f1_g[0], f2_g[0]), FadeIn(VGroup(f2_g[1], f2_g[2])), run_time=1)
        # 2.5 s – 3.5 s: f1 → f3, f3 fade_in
        self.play(TransformFromCopy(f1_g[2], f3_g[0]), FadeIn(VGroup(f3_g[1], f3_g[2])), run_time=1)
        # 3.5 s – 4.5 s: f1 → f4, f4 fade_in
        self.play(TransformFromCopy(f1_g[4], f4_g[0]), FadeIn(VGroup(f4_g[1], f4_g[2])), run_time=1)
        # 4.5 s – 5 s
        self.wait(0.5)
        # 5 s – 6 s: f1 fade_out, f2 fade_out, f3 fade_out, f4 fade_out
        self.play(FadeOut(f1), FadeOut(f2), FadeOut(f3), FadeOut(f4), run_time=1)
