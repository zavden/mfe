# Align by symbol across time — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 AlignBySymbolAcrossTime.py AlignBySymbolAcrossTime
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 396 frames, like the editor's video export.
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


class AlignBySymbolAcrossTime(Scene):
    def construct(self):
        self.camera.background_color = "#070B15"

        # step1: x + 3 = 5
        step1 = MathTex(r"x + 3 = 5", font_size=96)
        step1_g = _glyphs(step1, [
            (-2.3763, -0.1023, 0.6511, 0.6056), (-1.1668, -0.0555, 0.8904, 0.889), (-0.0162, 0.0394, 0.5548, 0.9184), (1.2102, -0.0561, 0.8904, 0.3128),
            (2.4352, 0.0401, 0.5334, 0.9198),
        ])
        step1.move_to([0, 1.2, 0])
        step1.set_z_index(1)

        # step2: x = 5 - 3
        step2 = MathTex(r"x = 5 - 3", font_size=96)
        step2_g = _glyphs(step2, [
            (-2.5894, -0.1548, 0.7078, 0.6584), (-1.1936, -0.1047, 0.968, 0.3401), (0.1382, 0, 0.5799, 1), (1.3907, -0.1047, 0.8866, 0.0581),
            (2.6417, -0.0007, 0.6032, 0.9985),
        ])
        step2.move_to([1.730267, 0, 0])

        # step3: x = 2
        step3 = MathTex(r"x = 2", font_size=96)
        step3_g = _glyphs(step3, [
            (-1.3535, -0.1654, 0.7194, 0.6691), (0.065, -0.1145, 0.9838, 0.3456), (1.4185, 0.0081, 0.5894, 0.9838),
        ])
        step3.move_to([0.863129, -1.2, 0])
        step3.set_z_index(1)

        # 0 s – 1 s: step1 write
        self.play(Write(VGroup(*step1_g[:])), run_time=1)
        # 1 s – 2.2 s
        self.wait(1.2)
        # 2.2 s – 3.2 s: step1 fade_out, step1 → step2, step2 fade_in
        self.play(
            FadeOut(step1_g[1]),
            ReplacementTransform(step1_g[0], step2_g[0]),
            ReplacementTransform(step1_g[3], step2_g[1]),
            ReplacementTransform(step1_g[4], step2_g[2]),
            ReplacementTransform(step1_g[2], step2_g[4]),
            FadeIn(step2_g[3]),
            run_time=1,
        )
        # 3.2 s – 4.4 s
        self.wait(1.2)
        step2_g[0].set_z_index(1)
        step2_g[1].set_z_index(1)
        # 4.4 s – 5.4 s: step2 fade_out, step2 → step3, step3 fade_in
        self.play(
            FadeOut(VGroup(*step2_g[2:])),
            ReplacementTransform(step2_g[0], step3_g[0]),
            ReplacementTransform(step2_g[1], step3_g[1]),
            FadeIn(step3_g[2]),
            run_time=1,
        )
        # 5.4 s – 6.6 s
        self.wait(1.2)
