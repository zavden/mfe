# Placing things in the Preview — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 PlacingThingsInThePreview.py PlacingThingsInThePreview
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 600 frames, like the editor's video export.
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


class PlacingThingsInThePreview(Scene):
    def construct(self):
        self.camera.background_color = "#070B15"

        # pythagoras: a^2 + b^2 = c^2
        pythagoras = MathTex(r"a^2 + b^2 = c^2", font_size=72, color="#58C4DD")
        pythagoras_g = _glyphs(pythagoras, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        pythagoras.move_to([-4.2, 2.2, 0])
        pythagoras.set_z_index(3)

        # euler: e^{i\pi} + 1 = 0
        euler = MathTex(r"e^{i\pi} + 1 = 0", font_size=72, color="#83C167")
        euler_g = _glyphs(euler, [
            (-2.225, -0.1905, 0.406, 0.4714), (-1.8313, 0.2531, 0.2064, 0.4937), (-1.479, 0.1687, 0.407, 0.3247), (-0.5905, -0.1545, 0.6921, 0.691),
            (0.3096, -0.0688, 0.3575, 0.6921), (1.2571, -0.155, 0.6921, 0.2432), (2.2092, -0.0802, 0.4375, 0.7149),
        ])
        euler.move_to([3.7, 2.55, 0])
        euler.set_z_index(2)

        # circle: A = \pi r^2
        circle = MathTex(r"A = \pi r^2", font_size=72, color="#F4C867")
        circle_g = _glyphs(circle, [
            (-1.5248, -0.0876, 0.7722, 0.8001), (-0.3668, -0.2083, 0.7442, 0.2615), (0.7091, -0.253, 0.6191, 0.4939), (1.2673, -0.2461, 0.4571, 0.5077),
            (1.7533, 0.2369, 0.3152, 0.5262),
        ])
        circle.move_to([-4.6, -1.3, 0])
        circle.set_z_index(1)

        # quadratic: x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
        quadratic = MathTex(r"x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}", font_size=72, color="#FC6255")
        quadratic_g = _glyphs(quadratic, [
            (-1.8732, -0.1, 0.2137, 0.1988), (-1.4517, -0.0848, 0.2923, 0.1027), (-0.8918, 0.2119, 0.2677, 0.0176), (-0.6197, 0.252, 0.1677, 0.3094),
            (-0.2645, 0.2483, 0.2923, 0.2923), (0.4795, 0.252, 0.1677, 0.3094), (0.6583, 0.3323, 0.1238, 0.2067), (1.0262, 0.2119, 0.2677, 0.0176),
            (1.404, 0.2507, 0.1944, 0.2971), (1.6322, 0.1967, 0.2076, 0.1979), (1.8479, 0.1964, 0.1737, 0.1994), (0.2066, 0.2806, 0.3431, 0.4389),
            (1.1571, 0.4868, 1.558, 0.0263), (0.3205, -0.3495, 0.1751, 0.2923), (0.5487, -0.401, 0.2076, 0.1979), (0.4368, -0.0848, 3.0864, 0.0263),
        ])
        quadratic.move_to([2.2, -1.5, 0])

        pythagoras_in = Write(VGroup(*pythagoras_g[:]))
        # 0 s – 0.6 s: pythagoras write
        self.play(_Part(pythagoras_in, 0, 0.6), run_time=0.6)
        euler_in = Write(VGroup(*euler_g[:]))
        # 0.6 s – 1 s: pythagoras write, euler write
        self.play(_Part(pythagoras_in, 0.6, 1), _Part(euler_in, 0, 0.4), run_time=0.4)
        # 1 s – 1.2 s: euler write
        self.play(_Part(euler_in, 0.4, 0.6), run_time=0.2)
        circle_in = Write(VGroup(*circle_g[:]))
        # 1.2 s – 1.6 s: euler write, circle write
        self.play(_Part(euler_in, 0.6, 1), _Part(circle_in, 0, 0.4), run_time=0.4)
        # 1.6 s – 1.8 s: circle write
        self.play(_Part(circle_in, 0.4, 0.6), run_time=0.2)
        quadratic_in = Write(VGroup(*quadratic_g[:]))
        # 1.8 s – 2.2 s: circle write, quadratic write
        self.play(_Part(circle_in, 0.6, 1), _Part(quadratic_in, 0, 2 / 7), run_time=0.4)
        # 2.2 s – 3.2 s: quadratic write
        self.play(_Part(quadratic_in, 2 / 7, 1), run_time=1)
        # 3.2 s – 10 s
        self.wait(6.8)
