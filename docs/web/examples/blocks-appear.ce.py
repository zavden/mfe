# Appear blocks — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 AppearBlocks.py AppearBlocks
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 1200 frames, like the editor's video export.
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


class AppearBlocks(Scene):
    def construct(self):
        self.camera.background_color = "#070B15"

        # eq: y = ax^2 + bx + c
        eq = MathTex(r"y = ax^2 + bx + c", font_size=132)
        eq_g = _glyphs(eq, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])

        # eq: y = ax^2 + bx + c
        eq_2 = MathTex(r"y = ax^2 + bx + c", font_size=132)
        eq_2_g = _glyphs(eq_2, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])

        # eq: y = ax^2 + bx + c
        eq_3 = MathTex(r"y = ax^2 + bx + c", font_size=132)
        eq_3_g = _glyphs(eq_3, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])

        # eq: y = ax^2 + bx + c
        eq_4 = MathTex(r"y = ax^2 + bx + c", font_size=132)
        eq_4_g = _glyphs(eq_4, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])

        # eq: y = ax^2 + bx + c
        eq_5 = MathTex(r"y = ax^2 + bx + c", font_size=132)
        eq_5_g = _glyphs(eq_5, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])

        self.add(eq_g[0], eq_g[1])
        # 0 s – 0.5 s
        self.wait(0.5)
        # 0.5 s – 1.5 s: eq write
        self.play(Write(VGroup(*eq_g[2:])), run_time=1)
        # 1.5 s – 4 s
        self.wait(2.5)
        self.remove(eq)
        self.add(eq_2_g[0], eq_2_g[1])
        # 4 s – 4.5 s
        self.wait(0.5)
        # 4.5 s – 5.5 s: eq_2 create
        self.play(Create(VGroup(*eq_2_g[2:])), run_time=1)
        # 5.5 s – 8 s
        self.wait(2.5)
        self.remove(eq_2)
        self.add(eq_3_g[0], eq_3_g[1])
        # 8 s – 8.5 s
        self.wait(0.5)
        # 8.5 s – 9.5 s: eq_3 fade_in
        self.play(FadeIn(VGroup(*eq_3_g[2:])), run_time=1)
        # 9.5 s – 12 s
        self.wait(2.5)
        self.remove(eq_3)
        self.add(eq_4_g[0], eq_4_g[1])
        # 12 s – 12.5 s
        self.wait(0.5)
        # 12.5 s – 13.5 s: eq_4 grow_from_center
        self.play(GrowFromCenter(VGroup(*eq_4_g[2:])), run_time=1)
        # 13.5 s – 16 s
        self.wait(2.5)
        self.remove(eq_4)
        self.add(eq_5_g[0], eq_5_g[1])
        # 16 s – 16.5 s
        self.wait(0.5)
        # 16.5 s – 18.5 s: eq_5 draw_border_then_fill
        self.play(DrawBorderThenFill(VGroup(*eq_5_g[2:])), run_time=2)
        # 18.5 s – 20 s
        self.wait(1.5)
