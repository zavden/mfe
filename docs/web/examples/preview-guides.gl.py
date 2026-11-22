# Snapping guides — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl SnappingGuides.py SnappingGuides -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 600 frames, like the editor's video export.
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


class SnappingGuides(Scene):
    default_camera_config = dict(background_color="#070B15")

    def construct(self):

        # one: x + 1
        one = Tex(r"x + 1", font_size=98.9888)
        one.set_color("#58C4DD")
        one_g = _glyphs(one, [
            (-1.136, -0.1023, 0.6511, 0.6056), (0.0735, -0.0555, 0.8904, 0.889), (1.2316, 0.0548, 0.4599, 0.8904),
        ])
        one.move_to([-4.9, 1.4, 0])
        one.set_z_index(2)

        # two: y + 2
        two = Tex(r"y + 2", font_size=98.9888)
        two.set_color("#83C167")
        two_g = _glyphs(two, [
            (-0.9556, -0.1282, 0.5461, 0.7436), (0.0115, 0.023, 0.7646, 0.7635), (0.9997, 0.1177, 0.4581, 0.7646),
        ])
        two.move_to([3.4, 1.4, 0])
        two.set_z_index(1)

        # three: z + 3
        three = Tex(r"z + 3", font_size=98.9888)
        three.set_color("#F4C867")
        three_g = _glyphs(three, [
            (-1.1221, -0.1017, 0.5797, 0.6064), (-0.0181, -0.0549, 0.8916, 0.8902), (1.1341, 0.0402, 0.5556, 0.9197),
        ])
        three.move_to([1, -1.8, 0])

        one_in = Write(VGroup(*one_g[:]), stroke_color="#58C4DD")
        # 0 s – 0.4 s: one write
        self.play(_Part(one_in, 0, 0.5), run_time=0.4)
        two_in = Write(VGroup(*two_g[:]), stroke_color="#83C167")
        # 0.4 s – 0.8 s: one write, two write
        self.play(_Part(one_in, 0.5, 1), _Part(two_in, 0, 0.5), run_time=0.4)
        three_in = Write(VGroup(*three_g[:]), stroke_color="#F4C867")
        # 0.8 s – 1.2 s: two write, three write
        self.play(_Part(two_in, 0.5, 1), _Part(three_in, 0, 0.5), run_time=0.4)
        # 1.2 s – 1.6 s: three write
        self.play(_Part(three_in, 0.5, 1), run_time=0.4)
        # 1.6 s – 10 s
        self.wait(8.4)
