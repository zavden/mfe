# Linking glyphs — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 LinkingGlyphs.py LinkingGlyphs
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 312 frames, like the editor's video export.
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


class LinkingGlyphs(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # step1: 2(x+3)=10
        step1 = MathTex(r"2(x+3)=10", font_size=96)
        step1_g = _glyphs(step1, [
            (-2.7085, 0.083, 0.399, 0.666), (-2.2445, 0, 0.239, 1), (-1.7905, -0.0345, 0.487, 0.453), (-0.8858, 0.0005, 0.666, 0.665),
            (-0.0251, 0.0715, 0.415, 0.687), (0.3999, 0, 0.239, 1), (1.2812, 0, 0.666, 0.234), (2.203, 0.083, 0.344, 0.666),
            (2.6975, 0.072, 0.421, 0.688),
        ])
        step1.move_to([-0.39, 0, 0])
        step1.set_z_index(1)

        # step2: 2x+6=10
        step2 = MathTex(r"2x+6=10", font_size=96)
        step2_g = _glyphs(step2, [
            (-3.1009, 0.0548, 0.5334, 0.8904), (-2.3937, -0.1023, 0.6511, 0.6056), (-1.1842, -0.0555, 0.8904, 0.889), (-0.0347, 0.0401, 0.5544, 0.9198),
            (1.1928, -0.0561, 0.8904, 0.3128), (2.4251, 0.0548, 0.4599, 0.8904), (3.0862, 0.0401, 0.5628, 0.9198),
        ])

        # 0 s – 1 s: step1 write
        self.play(Write(VGroup(*step1_g[:])), run_time=1)
        # 1 s – 2.2 s
        self.wait(1.2)
        # 2.2 s – 3.2 s: step1 fade_out, step1 → step2
        self.play(
            FadeOut(VGroup(step1_g[1], step1_g[5])),
            ReplacementTransform(step1_g[0], step2_g[0]),
            ReplacementTransform(step1_g[2], step2_g[1]),
            ReplacementTransform(step1_g[3], step2_g[2]),
            ReplacementTransform(step1_g[4], step2_g[3]),
            ReplacementTransform(step1_g[6], step2_g[4]),
            ReplacementTransform(step1_g[7], step2_g[5]),
            ReplacementTransform(step1_g[8], step2_g[6]),
            run_time=1,
        )
        # 3.2 s – 5.2 s
        self.wait(2)
