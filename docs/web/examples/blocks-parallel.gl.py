# Blocks in parallel — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl BlocksInParallel.py BlocksInParallel -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 420 frames, like the editor's video export.
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


class _Wiggle(Animation):
    """ManimCE's Wiggle about a pivot fixed when it begins: Manim reads the centre again while it
    moves the glyphs one by one, which drifts it, and ManimGL's WiggleOutThenIn refuses an
    array pivot."""

    def __init__(self, mobject, scale_value=1.1, rotation_angle=0.01 * TAU, n_wiggles=6, **kwargs):
        self.scale_value, self.rotation_angle, self.n_wiggles = scale_value, rotation_angle, n_wiggles
        super().__init__(mobject, **kwargs)

    def begin(self):
        # A copy: ManimGL's get_center() is a view into the bounding box, which scale and
        # rotate rewrite in place.
        self.pivot = np.array(self.mobject.get_center())
        super().begin()

    def interpolate_submobject(self, submob, start, alpha):
        submob.match_points(start)
        submob.scale(interpolate(1, self.scale_value, there_and_back(alpha)), about_point=self.pivot)
        submob.rotate(wiggle(alpha, self.n_wiggles) * self.rotation_angle, about_point=self.pivot)


class BlocksInParallel(Scene):
    default_camera_config = dict(background_color="#070B15")

    def construct(self):

        # eq: x^2 + 5x + 6 = 0
        eq = Tex(r"x^2 + 5x + 6 = 0", font_size=98.9888)
        eq_g = _glyphs(eq, [
            (-3.2598, -0.192, 0.5042, 0.469), (-2.7391, 0.2562, 0.2921, 0.4875), (-1.8711, -0.1557, 0.6895, 0.6885), (-0.98, -0.0817, 0.4131, 0.7123),
            (-0.4323, -0.192, 0.5042, 0.469), (0.5044, -0.1557, 0.6895, 0.6885), (1.3947, -0.0817, 0.4293, 0.7123), (2.3453, -0.1563, 0.6895, 0.2423),
            (3.2939, -0.0817, 0.4359, 0.7123),
        ])

        # 0 s – 1 s: eq write
        self.play(Write(VGroup(*eq_g[:7]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.6 s
        self.wait(0.6)
        eq_indicate = Indicate(VGroup(eq_g[0], eq_g[1]))
        eq_appear = Write(VGroup(eq_g[7], eq_g[8]), stroke_color="#FFFFFF")
        # 1.6 s – 2.2 s: eq indicate, eq write
        self.play(_Part(eq_indicate, 0, 0.6), _Part(eq_appear, 0, 0.6), run_time=0.6)
        eq_wiggle = _Wiggle(VGroup(eq_g[3], eq_g[4]))
        # 2.2 s – 2.6 s: eq indicate, eq write, eq wiggle
        self.play(
            _Part(eq_indicate, 0.6, 1),
            _Part(eq_appear, 0.6, 1),
            _Part(eq_wiggle, 0, 0.2),
            run_time=0.4,
        )
        # 2.6 s – 4.2 s: eq wiggle
        self.play(_Part(eq_wiggle, 0.2, 1), run_time=1.6)
        # 4.2 s – 5 s
        self.wait(0.8)
        # 5 s – 6 s: eq part
        self.play(VGroup(eq_g[3], eq_g[4]).animate.set_color("#F4C867"), run_time=1)
        # 6 s – 6.4 s
        self.wait(0.4)
        # 6.4 s – 7 s: eq fade_out
        self.play(FadeOut(eq), run_time=0.6)
