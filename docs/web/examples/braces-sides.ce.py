# Braces on four sides — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 BracesOnFourSides.py BracesOnFourSides
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 540 frames, like the editor's video export.
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


class BracesOnFourSides(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # system: \begin{aligned} x + y &= 6 \\ x - y &= 2 \end{aligned}
        system = MathTex(r"\begin{aligned} x + y &= 6 \\ x - y &= 2 \end{aligned}", font_size=96)
        system_g = _glyphs(system, [
            (-0.8181, 0.2925, 0.2243, 0.2087), (-0.4013, 0.3086, 0.3068, 0.3063), (-0.0006, 0.248, 0.2191, 0.2983), (0.413, 0.3084, 0.3068, 0.1078),
            (0.8347, 0.3415, 0.191, 0.3169), (-0.8181, -0.3063, 0.2243, 0.2087), (-0.4013, -0.2904, 0.281, 0.0184), (-0.0006, -0.3508, 0.2191, 0.2983),
            (0.413, -0.2904, 0.3068, 0.1078), (0.8351, -0.2522, 0.1838, 0.3068),
        ])

        # below: brace, built on system where its clip starts

        # above: brace, built on system where its clip starts

        # left: brace, built on system where its clip starts

        # right: brace, built on system where its clip starts

        # 0 s – 1.4 s: system write
        self.play(Write(VGroup(*system_g[:])), run_time=1.4)
        # 1.4 s – 2 s
        self.wait(0.6)
        below = Brace(system, DOWN, buff=0.2, color="#58C4DD")
        below.set_z_index(1)
        # 2 s – 2.7 s: below grow_from_center
        self.play(GrowFromCenter(below), run_time=0.7)
        # 2.7 s – 3.4 s
        self.wait(0.7)
        above = Brace(system, UP, buff=0.2, color="#83C167")
        above.set_z_index(2)
        # 3.4 s – 4.1 s: above grow_from_center
        self.play(GrowFromCenter(above), run_time=0.7)
        # 4.1 s – 4.8 s
        self.wait(0.7)
        left = Brace(system, LEFT, buff=0.2, color="#FFFF00")
        left.set_z_index(3)
        # 4.8 s – 5.5 s: left grow_from_center
        self.play(GrowFromCenter(left), run_time=0.7)
        # 5.5 s – 6.2 s
        self.wait(0.7)
        right = Brace(system, RIGHT, buff=0.2, color="#FC6255")
        right.set_z_index(4)
        # 6.2 s – 6.9 s: right grow_from_center
        self.play(GrowFromCenter(right), run_time=0.7)
        # 6.9 s – 8.2 s
        self.wait(1.3)
        # 8.2 s – 9 s: above fade_out, below fade_out, left fade_out, right fade_out, system fade_out
        self.play(
            FadeOut(above),
            FadeOut(below),
            FadeOut(left),
            FadeOut(right),
            FadeOut(system),
            run_time=0.8,
        )
