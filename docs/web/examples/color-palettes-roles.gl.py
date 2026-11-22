# Solving 2x + 3 = 11 — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl Solving2x311.py Solving2x311 -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 474 frames, like the editor's video export.
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


class Solving2x311(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # step1: 2x + 3 = 11
        step1 = Tex(r"2x + 3 = 11", font_size=98.9888)
        step1_g = _glyphs(step1, [
            (-3.0789, 0.0548, 0.5334, 0.8904), (-2.3717, -0.1023, 0.6511, 0.6056), (-1.1622, -0.0555, 0.8904, 0.889), (-0.0115, 0.0394, 0.5548, 0.9184),
            (1.2148, -0.0561, 0.8904, 0.3128), (2.4472, 0.0548, 0.4599, 0.8904), (3.1156, 0.0548, 0.4599, 0.8904),
        ])
        VGroup(step1_g[0], step1_g[3], step1_g[5], step1_g[6]).set_color("#F0AC5F")
        step1_g[1].set_color("#58C4DD")
        step1.move_to([-0.8777, 0, 0])
        step1.set_z_index(1)

        # step2: 2x = 8
        step2 = Tex(r"2x = 8", font_size=98.9888)
        step2_g = _glyphs(step2, [
            (-1.7541, 0.016, 0.5799, 0.968), (-0.9852, -0.1548, 0.7078, 0.6584), (0.4106, -0.1047, 0.968, 0.3401), (1.7432, 0, 0.6017, 1),
        ])
        VGroup(step2_g[0], step2_g[3]).set_color("#F0AC5F")
        step2_g[1].set_color("#58C4DD")
        step2.move_to([-0.2501, 0, 0])

        # step3: x = 4
        step3 = Tex(r"x = 4", font_size=98.9888)
        step3_g = _glyphs(step3, [
            (-1.3478, -0.1708, 0.7078, 0.6584), (0.048, -0.1206, 0.968, 0.3401), (1.3798, 0.008, 0.6439, 0.984),
        ])
        step3_g[0].set_color("#58C4DD")
        step3_g[2].set_color("#83C167")
        step3.set_z_index(1)

        # 0 s – 1 s: step1 write
        self.play(Write(VGroup(*step1_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2.5 s
        self.wait(1.5)
        # 2.5 s – 3.7 s: step1 → step2
        self.play(
            ReplacementTransform(step1_g[0], step2_g[0]),
            ReplacementTransform(step1_g[1], step2_g[1]),
            ReplacementTransform(step1_g[4], step2_g[2]),
            ReplacementTransform(step1_g[2], step2_g[3]),
            ReplacementTransform(step1_g[3], step2_g[3]),
            ReplacementTransform(step1_g[5], step2_g[3]),
            ReplacementTransform(step1_g[6], step2_g[3]),
            run_time=1.2,
        )
        # 3.7 s – 5.2 s
        self.wait(1.5)
        step2_g[1].set_z_index(1)
        step2_g[2].set_z_index(1)
        step2_g[0].set_z_index(1)
        step2_g[3].set_z_index(1)
        # 5.2 s – 6.4 s: step2 → step3
        self.play(
            ReplacementTransform(step2_g[1], step3_g[0]),
            ReplacementTransform(step2_g[2], step3_g[1]),
            ReplacementTransform(step2_g[0], step3_g[2]),
            ReplacementTransform(step2_g[3], step3_g[2]),
            run_time=1.2,
        )
        # 6.4 s – 7.9 s
        self.wait(1.5)
