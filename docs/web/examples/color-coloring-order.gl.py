# A line, coloured in order — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl ALineColouredInOrder.py ALineColouredInOrder -w -r 1920x1080 --fps 60
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


class ALineColouredInOrder(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # step1: y = mx + b
        step1 = Tex(r"y = mx + b", font_size=98.9888)
        step1_g = _glyphs(step1, [
            (-2.459, -0.1398, 0.5291, 0.7204), (-1.4602, 0.0061, 0.7408, 0.2603), (-0.2301, -0.0319, 0.9299, 0.5046), (0.568, -0.0323, 0.5417, 0.5039),
            (1.5743, 0.0067, 0.7408, 0.7397), (2.5111, 0.1079, 0.4249, 0.7842),
        ])
        step1_g[2].set_color("#58C4DD")
        step1_g[5].set_color("#F0AC5F")
        step1.move_to([0.1869, 0, 0])
        step1.set_z_index(1)

        # step2: y = 2x + 1
        step2 = Tex(r"y = 2x + 1", font_size=98.9888)
        step2_g = _glyphs(step2, [
            (-2.324, -0.1282, 0.5461, 0.7436), (-1.293, 0.0224, 0.7646, 0.2687), (-0.241, 0.1177, 0.4581, 0.7646), (0.3664, -0.0172, 0.5591, 0.5201),
            (1.4051, 0.023, 0.7646, 0.7635), (2.3995, 0.1177, 0.3949, 0.7646),
        ])
        step2_g[2].set_color("#58C4DD")
        step2_g[5].set_color("#F0AC5F")

        # 0 s – 1 s: step1 write
        self.play(Write(VGroup(*step1_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2.5 s
        self.wait(1.5)
        # 2.5 s – 3.5 s: step1 → step2
        self.play(
            ReplacementTransform(step1_g[0], step2_g[0]),
            ReplacementTransform(step1_g[1], step2_g[1]),
            ReplacementTransform(step1_g[2], step2_g[2]),
            ReplacementTransform(step1_g[3], step2_g[3]),
            ReplacementTransform(step1_g[4], step2_g[4]),
            ReplacementTransform(step1_g[5], step2_g[5]),
            run_time=1,
        )
        # 3.5 s – 5 s
        self.wait(1.5)
