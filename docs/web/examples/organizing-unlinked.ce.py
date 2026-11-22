# Circles and triangles, one clip unlinked — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 CirclesAndTrianglesOneClipUnlinked.py CirclesAndTrianglesOneClipUnlinked
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 840 frames, like the editor's video export.
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


class CirclesAndTrianglesOneClipUnlinked(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # title: Circles and right triangles
        title = Tex(r"Circles and right triangles", font_size=56)
        title_g = _glyphs(title, [
            (-5.7404, 0.1015, 0.6696, 0.7969), (-5.1899, 0.0933, 0.2514, 0.7344), (-4.8282, -0.0309, 0.3776, 0.4859), (-4.3622, -0.0344, 0.4182, 0.5046),
            (-3.9627, 0.1074, 0.2602, 0.7625), (-3.573, -0.034, 0.4248, 0.5038), (-3.1136, -0.034, 0.3578, 0.5038), (-2.3326, -0.034, 0.5038, 0.5038),
            (-1.7618, -0.0309, 0.5675, 0.4859), (-1.1504, 0.1014, 0.5499, 0.7746), (-0.3672, -0.0309, 0.3776, 0.4859), (0.0066, 0.0933, 0.2514, 0.7344),
            (0.4396, -0.1383, 0.5005, 0.7234), (1.0176, 0.1074, 0.5675, 0.7625), (1.5093, 0.0582, 0.3458, 0.6861), (2.2108, 0.0582, 0.3458, 0.6861),
            (2.6559, -0.0309, 0.3776, 0.4859), (3.0296, 0.0933, 0.2514, 0.7344), (3.4698, -0.034, 0.5038, 0.5038), (4.0406, -0.0309, 0.5675, 0.4859),
            (4.6218, -0.1383, 0.5005, 0.7234), (5.0472, 0.1074, 0.2602, 0.7625), (5.4369, -0.034, 0.4248, 0.5038), (5.8963, -0.034, 0.3578, 0.5038),
        ])
        title.move_to([0, 2.9, 0])
        title.set_z_index(1)

        # pythagoras2: x^2 + y^2 = r^2
        pythagoras2 = MathTex(r"x^2 + y^2 = r^2", font_size=72)
        pythagoras2_g = _glyphs(pythagoras2, [
            (-2.1906, -0.1138, 0.4473, 0.416), (-1.7288, 0.2838, 0.2591, 0.4324), (-0.9588, -0.0817, 0.6116, 0.6107), (-0.1597, -0.2026, 0.4368, 0.5948),
            (0.2449, 0.2838, 0.2591, 0.4324), (1.0658, -0.0821, 0.6116, 0.2149), (1.8853, -0.1132, 0.3756, 0.4173), (2.2847, 0.2838, 0.2591, 0.4324),
        ])
        pythagoras2.move_to([0, -0.2, 0])

        # circle_area: A = \pi r^2
        circle_area = MathTex(r"A = \pi r^2", font_size=72)
        circle_area_g = _glyphs(circle_area, [
            (-1.5248, -0.0876, 0.7722, 0.8001), (-0.3668, -0.2083, 0.7442, 0.2615), (0.7091, -0.253, 0.6191, 0.4939), (1.2673, -0.2461, 0.4571, 0.5077),
            (1.7533, 0.2369, 0.3152, 0.5262),
        ])
        circle_area.move_to([0, -0.2, 0])

        # circle_length: C = 2 \pi r
        circle_length = MathTex(r"C = 2 \pi r", font_size=72)
        circle_length_g = _glyphs(circle_length, [
            (-1.9488, 0, 0.9766, 1), (-0.5433, -0.1259, 0.9161, 0.3219), (0.7171, -0.0117, 0.5488, 0.9161), (1.4688, -0.1809, 0.762, 0.608),
            (2.1558, -0.1724, 0.5626, 0.6249),
        ])
        circle_length.move_to([0, -0.2, 0])

        # pythagoras: a^2 + b^2 = c^2
        pythagoras = MathTex(r"a^2 + b^2 = c^2", font_size=72)
        pythagoras_g = _glyphs(pythagoras, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        pythagoras.move_to([0, -0.2, 0])

        title_in = Write(VGroup(*title_g[:]))
        # 0 s – 0.5 s: title write
        self.play(_Part(title_in, 0, 5 / 14), run_time=0.5)
        pythagoras2_in = Write(VGroup(*pythagoras2_g[:]))
        # 0.5 s – 1.4 s: title write, pythagoras2 write
        self.play(_Part(title_in, 5 / 14, 1), _Part(pythagoras2_in, 0, 9 / 14), run_time=0.9)
        # 1.4 s – 1.9 s: pythagoras2 write
        self.play(_Part(pythagoras2_in, 9 / 14, 1), run_time=0.5)
        # 1.9 s – 3.4 s
        self.wait(1.5)
        # 3.4 s – 4 s: pythagoras2 fade_out
        self.play(FadeOut(pythagoras2), run_time=0.6)
        # 4 s – 5.4 s: circle_area write
        self.play(Write(VGroup(*circle_area_g[:])), run_time=1.4)
        # 5.4 s – 6.9 s
        self.wait(1.5)
        # 6.9 s – 7.5 s: circle_area fade_out
        self.play(FadeOut(circle_area), run_time=0.6)
        # 7.5 s – 8.9 s: circle_length write
        self.play(Write(VGroup(*circle_length_g[:])), run_time=1.4)
        # 8.9 s – 10.4 s
        self.wait(1.5)
        # 10.4 s – 11 s: circle_length fade_out
        self.play(FadeOut(circle_length), run_time=0.6)
        # 11 s – 12.4 s: pythagoras write
        self.play(Write(VGroup(*pythagoras_g[:])), run_time=1.4)
        # 12.4 s – 13.4 s
        self.wait(1)
        # 13.4 s – 14 s: title fade_out, pythagoras fade_out
        self.play(FadeOut(title), FadeOut(pythagoras), run_time=0.6)
