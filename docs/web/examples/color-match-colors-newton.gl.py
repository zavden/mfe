# Force, mass and acceleration — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl ForceMassAndAcceleration.py ForceMassAndAcceleration -w -r 1920x1080 --fps 60
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


class ForceMassAndAcceleration(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # law: F = ma
        law = Tex(r"F = ma", font_size=98.9888)
        law_g = _glyphs(law, [
            (-1.9664, 0.008, 1.0391, 0.9841), (-0.4819, -0.1223, 0.9638, 0.3386), (1.1184, -0.1717, 1.2098, 0.6565), (2.1437, -0.1722, 0.6845, 0.6527),
        ])
        law_g[0].set_color("#FC6255")
        law_g[2].set_color("#58C4DD")
        law_g[3].set_color("#83C167")
        law.move_to([0.2275, 0, 0])
        law.set_z_index(1)

        # acceleration: a = \frac{F}{m}
        acceleration = Tex(r"a = \frac{F}{m}", font_size=98.9888)
        acceleration_g = _glyphs(acceleration, [
            (-0.6222, -0.0555, 0.2304, 0.2197), (-0.171, -0.0387, 0.3244, 0.114), (0.4824, 0.3344, 0.3497, 0.3312), (0.4748, -0.3895, 0.4072, 0.221),
            (0.4748, -0.0387, 0.5251, 0.0292),
        ])
        acceleration_g[0].set_color("#83C167")
        acceleration_g[2].set_color("#FC6255")
        acceleration_g[3].set_color("#58C4DD")
        acceleration.move_to([0.2455, 0, 0])

        # mass: m = \frac{F}{a}
        mass = Tex(r"m = \frac{F}{a}", font_size=98.9888)
        mass_g = _glyphs(mass, [
            (-0.5905, -0.0556, 0.4074, 0.2211), (-0.0517, -0.039, 0.3246, 0.114), (0.5706, 0.3343, 0.3499, 0.3314), (0.5654, -0.3901, 0.2305, 0.2198),
            (0.563, -0.039, 0.4625, 0.0292),
        ])
        mass_g[0].set_color("#58C4DD")
        mass_g[2].set_color("#FC6255")
        mass_g[3].set_color("#83C167")
        mass.set_z_index(1)

        # 0 s – 1 s: law write
        self.play(Write(VGroup(*law_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2.5 s
        self.wait(1.5)
        # 2.5 s – 3.7 s: law → acceleration, acceleration fade_in
        self.play(
            ReplacementTransform(law_g[3], acceleration_g[0]),
            ReplacementTransform(law_g[1], acceleration_g[1]),
            ReplacementTransform(law_g[0], acceleration_g[2]),
            ReplacementTransform(law_g[2], acceleration_g[3]),
            FadeIn(VGroup(acceleration_g[4])),
            run_time=1.2,
        )
        # 3.7 s – 5.2 s
        self.wait(1.5)
        acceleration_g[3].set_z_index(1)
        acceleration_g[1].set_z_index(1)
        acceleration_g[2].set_z_index(1)
        acceleration_g[0].set_z_index(1)
        acceleration_g[4].set_z_index(1)
        # 5.2 s – 6.4 s: acceleration → mass
        self.play(
            ReplacementTransform(acceleration_g[3], mass_g[0]),
            ReplacementTransform(acceleration_g[1], mass_g[1]),
            ReplacementTransform(acceleration_g[2], mass_g[2]),
            ReplacementTransform(acceleration_g[0], mass_g[3]),
            ReplacementTransform(acceleration_g[4], mass_g[4]),
            run_time=1.2,
        )
        # 6.4 s – 7.9 s
        self.wait(1.5)
