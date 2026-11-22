# The square of a sum — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl TheSquareOfASum.py TheSquareOfASum -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 672 frames, like the editor's video export.
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


class _Circumscribe(ShowPassingFlash):
    """ManimCE's Circumscribe for both libraries: a rectangle around the mobject as it is when the
    animation is made, traced and untraced in one pass, on the layer `z_index` names."""

    def __init__(self, mobject, buff=0.1, color="#FFFF00", stroke_width=4, time_width=0.3,
                 z_index=0, **kwargs):
        frame = SurroundingRectangle(mobject, buff=buff, color=color, stroke_width=stroke_width)
        frame.set_z_index(z_index)
        super().__init__(frame, time_width=time_width, **kwargs)


class TheSquareOfASum(Scene):
    default_camera_config = dict(background_color="#070B15")

    def construct(self):

        # step1: (a+b)^2
        step1 = Tex(r"(a+b)^2", font_size=98.9888)
        step1_g = _glyphs(step1, [
            (-1.3123, -0.059, 0.2108, 0.8819), (-0.9198, -0.0895, 0.4172, 0.3978), (-0.1519, -0.0586, 0.5874, 0.5865), (0.5909, 0.0217, 0.3369, 0.6218),
            (0.9194, -0.059, 0.2108, 0.8819), (1.2933, 0.2924, 0.2488, 0.4153),
        ])
        step1_g[1].set_color("#43EECA")
        step1_g[3].set_color("#F4C867")
        step1.move_to([-3.5417, 0, 0])
        step1.set_z_index(1)

        # step2: (a+b)^2 = a^2
        step2 = Tex(r"(a+b)^2 = a^2", font_size=98.9888)
        step2_g = _glyphs(step2, [
            (-2.3261, -0.059, 0.2108, 0.8819), (-1.9337, -0.0895, 0.4172, 0.3978), (-1.1658, -0.0586, 0.5874, 0.5865), (-0.423, 0.0217, 0.3369, 0.6218),
            (-0.0945, -0.059, 0.2108, 0.8819), (0.2794, 0.2924, 0.2488, 0.4153), (1.0678, -0.059, 0.5874, 0.2064), (1.8936, -0.0895, 0.4172, 0.3978),
            (2.3071, 0.2924, 0.2488, 0.4153),
        ])
        VGroup(step2_g[1], step2_g[7]).set_color("#43EECA")
        step2_g[3].set_color("#F4C867")
        step2.move_to([-2.3895, 0, 0])

        # step3: (a+b)^2 = a^2 + 2ab
        step3 = Tex(r"(a+b)^2 = a^2 + 2ab", font_size=98.9888)
        step3_g = _glyphs(step3, [
            (-3.543, -0.059, 0.2108, 0.8819), (-3.1506, -0.0895, 0.4172, 0.3978), (-2.3827, -0.0586, 0.5874, 0.5865), (-1.6399, 0.0217, 0.3369, 0.6218),
            (-1.3114, -0.059, 0.2108, 0.8819), (-0.9375, 0.2924, 0.2488, 0.4153), (-0.149, -0.059, 0.5874, 0.2064), (0.6767, -0.0895, 0.4172, 0.3978),
            (1.0903, 0.2924, 0.2488, 0.4153), (1.8296, -0.0586, 0.5874, 0.5865), (2.5888, 0.0142, 0.3519, 0.5874), (3.0474, -0.0895, 0.4172, 0.3978),
            (3.48, 0.0217, 0.3369, 0.6218),
        ])
        VGroup(step3_g[1], step3_g[7], step3_g[11]).set_color("#43EECA")
        VGroup(step3_g[3], step3_g[12]).set_color("#F4C867")
        step3.move_to([-1.0067, 0, 0])
        step3.set_z_index(1)

        # step4: (a+b)^2 = a^2 + 2ab + b^2
        step4 = Tex(r"(a+b)^2 = a^2 + 2ab + b^2", font_size=98.9888)
        step4_g = _glyphs(step4, [
            (-4.4289, -0.059, 0.2108, 0.8819), (-4.0364, -0.0895, 0.4172, 0.3978), (-3.2685, -0.0586, 0.5874, 0.5865), (-2.5257, 0.0217, 0.3369, 0.6218),
            (-2.1972, -0.059, 0.2108, 0.8819), (-1.8233, 0.2924, 0.2488, 0.4153), (-1.0349, -0.059, 0.5874, 0.2064), (-0.2091, -0.0895, 0.4172, 0.3978),
            (0.2044, 0.2924, 0.2488, 0.4153), (0.9437, -0.0586, 0.5874, 0.5865), (1.7029, 0.0142, 0.3519, 0.5874), (2.1615, -0.0895, 0.4172, 0.3978),
            (2.5941, 0.0217, 0.3369, 0.6218), (3.3078, -0.0586, 0.5874, 0.5865), (4.0506, 0.0217, 0.3369, 0.6218), (4.4099, 0.2924, 0.2488, 0.4153),
        ])
        VGroup(step4_g[1], step4_g[7], step4_g[11]).set_color("#43EECA")
        VGroup(step4_g[3], step4_g[12], step4_g[14]).set_color("#F4C867")

        # 0 s – 1.5 s: step1 write
        self.play(Write(VGroup(*step1_g[:]), stroke_color="#FFFFFF"), run_time=1.5)
        # 1.5 s – 2.3 s
        self.wait(0.8)
        # 2.3 s – 3.5 s: step1 → step2, step2 fade_in
        self.play(
            ReplacementTransform(step1_g[0], step2_g[0], path_arc=-70 * DEGREES),
            ReplacementTransform(step1_g[1], step2_g[1], path_arc=-70 * DEGREES),
            ReplacementTransform(step1_g[2], step2_g[2], path_arc=-70 * DEGREES),
            ReplacementTransform(step1_g[3], step2_g[3], path_arc=-70 * DEGREES),
            ReplacementTransform(step1_g[4], step2_g[4], path_arc=-70 * DEGREES),
            ReplacementTransform(step1_g[5], step2_g[5], path_arc=-70 * DEGREES),
            TransformFromCopy(step1_g[1], step2_g[7], path_arc=-70 * DEGREES),
            TransformFromCopy(step1_g[5], step2_g[8], path_arc=-70 * DEGREES),
            FadeIn(VGroup(step2_g[6])),
            run_time=1.2,
        )
        # 3.5 s – 4.3 s
        self.wait(0.8)
        step2_g[0].set_z_index(1)
        step2_g[1].set_z_index(1)
        step2_g[2].set_z_index(1)
        step2_g[3].set_z_index(1)
        step2_g[4].set_z_index(1)
        step2_g[5].set_z_index(1)
        step2_g[6].set_z_index(1)
        step2_g[7].set_z_index(1)
        step2_g[8].set_z_index(1)
        # 4.3 s – 5.5 s: step2 → step3, step3 fade_in
        self.play(
            ReplacementTransform(step2_g[0], step3_g[0], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[1], step3_g[1], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[2], step3_g[2], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[3], step3_g[3], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[4], step3_g[4], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[5], step3_g[5], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[6], step3_g[6], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[7], step3_g[7], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[8], step3_g[8], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[5].copy().set_z_index(1), step3_g[10], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[1].copy().set_z_index(1), step3_g[11], path_arc=-70 * DEGREES),
            ReplacementTransform(step2_g[3].copy().set_z_index(1), step3_g[12], path_arc=-70 * DEGREES),
            FadeIn(VGroup(step3_g[9])),
            run_time=1.2,
        )
        # 5.5 s – 6.3 s
        self.wait(0.8)
        # 6.3 s – 7.5 s: step3 → step4, step4 fade_in
        self.play(
            ReplacementTransform(step3_g[0], step4_g[0], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[1], step4_g[1], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[2], step4_g[2], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[3], step4_g[3], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[4], step4_g[4], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[5], step4_g[5], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[6], step4_g[6], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[7], step4_g[7], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[8], step4_g[8], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[9], step4_g[9], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[10], step4_g[10], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[11], step4_g[11], path_arc=-70 * DEGREES),
            ReplacementTransform(step3_g[12], step4_g[12], path_arc=-70 * DEGREES),
            TransformFromCopy(step3_g[3], step4_g[14], path_arc=-70 * DEGREES),
            TransformFromCopy(step3_g[5], step4_g[15], path_arc=-70 * DEGREES),
            FadeIn(VGroup(step4_g[13])),
            run_time=1.2,
        )
        # 7.5 s – 8.6 s
        self.wait(1.1)
        # 8.6 s – 10 s: step4 circumscribe
        self.play(_Circumscribe(VGroup(*step4_g[7:]), buff=0.15, color="#7BF4E6"), run_time=1.4)
        # 10 s – 11.2 s
        self.wait(1.2)
