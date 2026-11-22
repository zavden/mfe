# The shapes, one by one — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 TheShapesOneByOne.py TheShapesOneByOne
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 672 frames, like the editor's video export.
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


class _Part(Animation):
    """Plays the stretch [a0, a1] of `anim` (fractions of its run time) inside one
    self.play, so that animations that overlap in time can start and end between plays.
    The animation begins in its part with a0 == 0 and finishes (and leaves or enters the
    scene) in its part with a1 == 1; it keeps its own rate function and lag throughout."""

    def __init__(self, anim, a0, a1):
        self.anim, self.a0, self.a1 = anim, a0, a1
        super().__init__(anim.mobject, rate_func=linear)

    def begin(self):
        if self.a0 == 0:
            self.anim.begin()

    def _setup_scene(self, scene):  # ManimCE: introducers add their mobject here
        if self.a0 == 0:
            self.anim._setup_scene(scene)

    def is_introducer(self):  # ManimCE
        return self.anim.is_introducer()

    def interpolate(self, alpha):
        self.anim.interpolate(self.a0 + (self.a1 - self.a0) * alpha)

    def update_mobjects(self, dt):  # ManimCE
        self.anim.update_mobjects(dt)

    def update_reference_mobjects(self, dt, **kwargs):  # ManimGL
        self.anim.update_reference_mobjects(dt, **kwargs)

    def finish(self):
        if self.a1 == 1:
            self.anim.finish()
        else:
            self.anim.interpolate(self.a1)

    def clean_up_from_scene(self, scene):
        if self.a1 == 1:
            self.anim.clean_up_from_scene(scene)


def _circle_around(mobject, buff=0.1, color=WHITE, **kwargs):
    """A circle through the corners of the mobject's box, `buff` further out, centred on it."""
    radius = np.hypot(mobject.get_width(), mobject.get_height()) / 2 + buff
    return Circle(radius=radius, stroke_color=color, fill_color=color, **kwargs).move_to(mobject)


def _cross_line(mobject, rising=True, **kwargs):
    """One line of a Cross over the mobject: from its lower left corner up to its upper right one,
    or (rising=False) from its upper left corner down to its lower right one."""
    falling, other = Cross(mobject)
    ends = (other.get_end(), other.get_start()) if rising else (falling.get_start(), falling.get_end())
    return Line(*ends, **kwargs)


class TheShapesOneByOne(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # formula: a + b = c
        formula = MathTex(r"a + b = c", font_size=96)
        formula_g = _glyphs(formula, [
            (-2.215, -0.1166, 0.6095, 0.5812), (-1.093, -0.0715, 0.8582, 0.857), (-0.0076, 0.0457, 0.4923, 0.9085), (1.1068, -0.0722, 0.8582, 0.3015),
            (2.2648, -0.1175, 0.5099, 0.5855),
        ])
        formula.move_to([0, 0.7, 0])
        formula.set_z_index(1)

        # s1: box, built on formula where its clip starts

        # box: \text{Box}
        box = MathTex(r"\text{Box}", font_size=60)
        box_g = _glyphs(box, [
            (-0.7742, 0.0072, 0.899, 0.9856), (0.1176, -0.1696, 0.6392, 0.6609), (0.8593, -0.1746, 0.7287, 0.6219),
        ])
        box.move_to([0, -1.5, 0])
        box.set_z_index(2)

        # s2: circle, built on formula where its clip starts

        # circle: \text{Circle}
        circle = MathTex(r"\text{Circle}", font_size=60)
        circle_g = _glyphs(circle, [
            (-1.2831, 0, 0.8402, 1), (-0.5923, -0.0103, 0.3154, 0.9215), (-0.1384, -0.1662, 0.4738, 0.6097), (0.4463, -0.1706, 0.5248, 0.6331),
            (0.9477, 0.0073, 0.3264, 0.9568), (1.4366, -0.1701, 0.5331, 0.6322),
        ])
        circle.move_to([0, -1.5, 0])
        circle.set_z_index(2)

        # s3: underline, built on formula where its clip starts

        # underline: \text{Underline}
        underline = MathTex(r"\text{Underline}", font_size=60)
        underline_g = _glyphs(underline, [
            (-2.4426, -0.0081, 0.9753, 0.9837), (-1.523, -0.1605, 0.7214, 0.6177), (-0.7458, 0.0077, 0.6991, 0.9847), (-0.0579, -0.1644, 0.54, 0.6405),
            (0.5205, -0.1605, 0.48, 0.6177), (1.0012, 0.0153, 0.3307, 0.9693), (1.3835, -0.0026, 0.3195, 0.9335), (1.9709, -0.1605, 0.7214, 0.6177),
            (2.6602, -0.1644, 0.54, 0.6405),
        ])
        underline.move_to([0, -1.5, 0])
        underline.set_z_index(2)

        # s4: cross, built on formula where its clip starts

        # cross: \text{Cross}
        cross = MathTex(r"\text{Cross}", font_size=60)
        cross_g = _glyphs(cross, [
            (-1.1715, 0, 0.8402, 1), (-0.4098, -0.1662, 0.4738, 0.6097), (0.2094, -0.1694, 0.6102, 0.6309), (0.8244, -0.1701, 0.449, 0.6322),
            (1.3671, -0.1701, 0.449, 0.6322),
        ])
        cross.move_to([0, -1.5, 0])
        cross.set_z_index(2)

        # s5: cross_line, built on formula where its clip starts

        # cross_line: \text{Cross line}
        cross_line = MathTex(r"\text{Cross line}", font_size=60)
        cross_line_g = _glyphs(cross_line, [
            (-2.4194, 0, 0.8402, 1), (-1.6577, -0.1662, 0.4738, 0.6097), (-1.0386, -0.1694, 0.6102, 0.6309), (-0.4236, -0.1701, 0.449, 0.6322),
            (0.1191, -0.1701, 0.449, 0.6322), (0.9353, 0.0073, 0.3264, 0.9568), (1.3127, -0.0103, 0.3154, 0.9215), (1.8926, -0.1662, 0.7121, 0.6097),
            (2.573, -0.1701, 0.5331, 0.6322),
        ])
        cross_line.move_to([0, -1.5, 0])
        cross_line.set_z_index(2)

        # s6: box, built on formula where its clip starts

        # highlight: \text{Highlight}
        highlight = MathTex(r"\text{Highlight}", font_size=60)
        highlight_g = _glyphs(highlight, [
            (-1.8348, 0.1079, 0.7761, 0.7583), (-1.2618, 0.1001, 0.2543, 0.7428), (-0.8238, -0.1342, 0.5063, 0.7317), (-0.2393, 0.1144, 0.574, 0.7713),
            (0.2237, 0.1144, 0.2631, 0.7713), (0.5279, 0.1001, 0.2543, 0.7428), (0.966, -0.1342, 0.5063, 0.7317), (1.5505, 0.1144, 0.574, 0.7713),
            (2.0479, 0.0646, 0.3497, 0.6939),
        ])
        highlight.move_to([0, -1.5, 0])
        highlight.set_z_index(2)

        # 0 s – 1 s: formula write
        self.play(Write(VGroup(*formula_g[:])), run_time=1)
        # 1 s – 1.2 s
        self.wait(0.2)
        s1 = SurroundingRectangle(VGroup(*formula_g[:3]), buff=0.1, color="#FFFF00")
        s1.set_z_index(3)
        s1_in = Create(s1)
        # 1.2 s – 1.5 s: s1 create, box fade_in
        self.play(_Part(s1_in, 0, 0.5), FadeIn(box), run_time=0.3)
        # 1.5 s – 1.8 s: s1 create
        self.play(_Part(s1_in, 0.5, 1), run_time=0.3)
        # 1.8 s – 2.4 s
        self.wait(0.6)
        # 2.4 s – 2.7 s: s1 fade_out, box fade_out
        self.play(FadeOut(s1), FadeOut(box), run_time=0.3)
        # 2.7 s – 2.8 s
        self.wait(0.1)
        s2 = _circle_around(formula_g[4], buff=0.1, color="#FC6255")
        s2.set_z_index(3)
        s2_in = Create(s2)
        # 2.8 s – 3.1 s: circle fade_in, s2 create
        self.play(FadeIn(circle), _Part(s2_in, 0, 0.5), run_time=0.3)
        # 3.1 s – 3.4 s: s2 create
        self.play(_Part(s2_in, 0.5, 1), run_time=0.3)
        # 3.4 s – 4 s
        self.wait(0.6)
        # 4 s – 4.3 s: circle fade_out, s2 fade_out
        self.play(FadeOut(circle), FadeOut(s2), run_time=0.3)
        # 4.3 s – 4.4 s
        self.wait(0.1)
        s3 = Underline(VGroup(*formula_g[:3]), buff=0.1, color="#FFFFFF")
        s3.set_z_index(3)
        s3_in = Create(s3)
        # 4.4 s – 4.7 s: underline fade_in, s3 create
        self.play(FadeIn(underline), _Part(s3_in, 0, 0.5), run_time=0.3)
        # 4.7 s – 5 s: s3 create
        self.play(_Part(s3_in, 0.5, 1), run_time=0.3)
        # 5 s – 5.6 s
        self.wait(0.6)
        # 5.6 s – 5.9 s: underline fade_out, s3 fade_out
        self.play(FadeOut(underline), FadeOut(s3), run_time=0.3)
        # 5.9 s – 6 s
        self.wait(0.1)
        s4 = Cross(formula_g[2], stroke_color="#FC6255")
        s4.set_z_index(3)
        s4_in = Create(s4)
        # 6 s – 6.3 s: cross fade_in, s4 create
        self.play(FadeIn(cross), _Part(s4_in, 0, 0.5), run_time=0.3)
        # 6.3 s – 6.6 s: s4 create
        self.play(_Part(s4_in, 0.5, 1), run_time=0.3)
        # 6.6 s – 7.2 s
        self.wait(0.6)
        # 7.2 s – 7.5 s: cross fade_out, s4 fade_out
        self.play(FadeOut(cross), FadeOut(s4), run_time=0.3)
        # 7.5 s – 7.6 s
        self.wait(0.1)
        s5 = _cross_line(formula_g[2], color="#FC6255", stroke_width=6)
        s5.set_z_index(3)
        s5_in = Create(s5)
        # 7.6 s – 7.9 s: cross_line fade_in, s5 create
        self.play(FadeIn(cross_line), _Part(s5_in, 0, 0.5), run_time=0.3)
        # 7.9 s – 8.2 s: s5 create
        self.play(_Part(s5_in, 0.5, 1), run_time=0.3)
        # 8.2 s – 8.8 s
        self.wait(0.6)
        # 8.8 s – 9.1 s: cross_line fade_out, s5 fade_out
        self.play(FadeOut(cross_line), FadeOut(s5), run_time=0.3)
        # 9.1 s – 9.2 s
        self.wait(0.1)
        s6 = SurroundingRectangle(VGroup(*formula_g[:3]), buff=0, color="#FFFF00", stroke_width=0, fill_opacity=0.3, stroke_opacity=0)
        self.add(s6)
        # 9.2 s – 9.5 s: highlight fade_in
        self.play(FadeIn(highlight), run_time=0.3)
        # 9.5 s – 10.4 s
        self.wait(0.9)
        highlight_out = FadeOut(highlight)
        s6_out = FadeOut(s6)
        # 10.4 s – 10.6 s: highlight fade_out, s6 fade_out
        self.play(_Part(highlight_out, 0, 2 / 3), _Part(s6_out, 0, 2 / 3), run_time=0.2)
        formula_out = FadeOut(formula)
        # 10.6 s – 10.7 s: highlight fade_out, s6 fade_out, formula fade_out
        self.play(
            _Part(highlight_out, 2 / 3, 1),
            _Part(s6_out, 2 / 3, 1),
            _Part(formula_out, 0, 1 / 6),
            run_time=0.1,
        )
        # 10.7 s – 11.2 s: formula fade_out
        self.play(_Part(formula_out, 1 / 6, 1), run_time=0.5)
