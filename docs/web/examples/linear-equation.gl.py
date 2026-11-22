# Solving a linear equation — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl SolvingALinearEquation.py SolvingALinearEquation -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 960 frames, like the editor's video export.
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


class SolvingALinearEquation(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # equation: 2x + 3 = 11
        equation = Tex(r"2x + 3 = 11", font_size=98.9888)
        equation_g = _glyphs(equation, [
            (-3.0789, 0.0548, 0.5334, 0.8904), (-2.3717, -0.1023, 0.6511, 0.6056), (-1.1622, -0.0555, 0.8904, 0.889), (-0.0115, 0.0394, 0.5548, 0.9184),
            (1.2148, -0.0561, 0.8904, 0.3128), (2.4472, 0.0548, 0.4599, 0.8904), (3.1156, 0.0548, 0.4599, 0.8904),
        ])
        equation_g[3].set_color("#F0AC5F")
        equation.set_z_index(1)

        # subtract: 2x = 11 - 3
        subtract = Tex(r"2x = 11 - 3", font_size=98.9888)
        subtract_g = _glyphs(subtract, [
            (-3.3692, 0.016, 0.5799, 0.968), (-2.6003, -0.1548, 0.7078, 0.6584), (-1.2045, -0.1047, 0.968, 0.3401), (0.1353, 0.016, 0.5, 0.968),
            (0.8621, 0.016, 0.5, 0.968), (2.1065, -0.1047, 0.8866, 0.0581), (3.3576, -0.0007, 0.6032, 0.9985),
        ])
        subtract_g[6].set_color("#F0AC5F")

        # simplify: 2x = 8
        simplify = Tex(r"2x = 8", font_size=98.9888)
        simplify_g = _glyphs(simplify, [
            (-1.7541, 0.016, 0.5799, 0.968), (-0.9852, -0.1548, 0.7078, 0.6584), (0.4106, -0.1047, 0.968, 0.3401), (1.7432, 0, 0.6017, 1),
        ])
        simplify_g[0].set_color("#58C4DD")
        simplify.set_z_index(1)

        # divide: x = \frac{8}{2}
        divide = Tex(r"x = \frac{8}{2}", font_size=98.9888)
        divide_g = _glyphs(divide, [
            (-0.5433, -0.0555, 0.2401, 0.2234), (-0.0698, -0.0385, 0.3284, 0.1154), (0.4908, 0.3304, 0.2041, 0.3393), (0.4905, -0.3358, 0.1967, 0.3284),
            (0.4908, -0.0385, 0.3452, 0.0296),
        ])
        divide_g[3].set_color("#58C4DD")

        # answer: x = 4
        answer = Tex(r"x = 4", font_size=98.9888)
        answer_g = _glyphs(answer, [
            (-1.3478, -0.1708, 0.7078, 0.6584), (0.048, -0.1206, 0.968, 0.3401), (1.3798, 0.008, 0.6439, 0.984),
        ])
        answer.set_z_index(1)

        # 0 s – 1 s: equation write
        self.play(Write(VGroup(*equation_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 3 s
        self.wait(2)
        # 3 s – 4 s: equation fade_out, equation → subtract, subtract write
        self.play(
            FadeOut(VGroup(equation_g[2])),
            ReplacementTransform(equation_g[0], subtract_g[0]),
            ReplacementTransform(equation_g[1], subtract_g[1]),
            ReplacementTransform(equation_g[4], subtract_g[2]),
            ReplacementTransform(equation_g[5], subtract_g[3]),
            ReplacementTransform(equation_g[6], subtract_g[4]),
            ReplacementTransform(equation_g[3], subtract_g[6]),
            Write(VGroup(subtract_g[5]), stroke_color="#FFFFFF"),
            run_time=1,
        )
        # 4 s – 6 s
        self.wait(2)
        subtract_g[0].set_z_index(1)
        subtract_g[1].set_z_index(1)
        subtract_g[2].set_z_index(1)
        subtract_g[3].set_z_index(1)
        subtract_g[4].set_z_index(1)
        subtract_g[5].set_z_index(1)
        subtract_g[6].set_z_index(1)
        # 6 s – 7 s: subtract → simplify
        self.play(
            ReplacementTransform(subtract_g[0], simplify_g[0]),
            ReplacementTransform(subtract_g[1], simplify_g[1]),
            ReplacementTransform(subtract_g[2], simplify_g[2]),
            FadeTransform(subtract_g[3], simplify_g[3]),
            FadeTransform(subtract_g[4], simplify_g[3]),
            FadeTransform(subtract_g[5], simplify_g[3]),
            FadeTransform(subtract_g[6], simplify_g[3]),
            run_time=1,
        )
        # 7 s – 9 s
        self.wait(2)
        # 9 s – 10 s: simplify → divide, divide write
        self.play(
            ReplacementTransform(simplify_g[1], divide_g[0]),
            ReplacementTransform(simplify_g[2], divide_g[1]),
            ReplacementTransform(simplify_g[3], divide_g[2]),
            ReplacementTransform(simplify_g[0], divide_g[3]),
            Write(VGroup(divide_g[4]), stroke_color="#FFFFFF"),
            run_time=1,
        )
        # 10 s – 12 s
        self.wait(2)
        divide_g[0].set_z_index(1)
        divide_g[1].set_z_index(1)
        divide_g[2].set_z_index(1)
        divide_g[3].set_z_index(1)
        divide_g[4].set_z_index(1)
        # 12 s – 13 s: divide → answer
        self.play(
            ReplacementTransform(divide_g[0], answer_g[0]),
            ReplacementTransform(divide_g[1], answer_g[1]),
            FadeTransform(divide_g[2], answer_g[2]),
            FadeTransform(divide_g[3], answer_g[2]),
            FadeTransform(divide_g[4], answer_g[2]),
            run_time=1,
        )
        # 13 s – 16 s
        self.wait(3)
