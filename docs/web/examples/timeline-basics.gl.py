# Timeline basics — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl TimelineBasics.py TimelineBasics -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 630 frames, like the editor's video export.
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


class TimelineBasics(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # title: \text{Solving } x + 3 = 5
        title = Tex(r"\text{Solving } x + 3 = 5", font_size=65.9925)
        title_g = _glyphs(title, [
            (-3.8546, 0.101, 0.4885, 0.798), (-3.275, -0.0335, 0.4863, 0.5027), (-2.8414, 0.1074, 0.2602, 0.7625), (-2.4056, -0.0434, 0.5368, 0.4852),
            (-1.961, 0.0933, 0.2514, 0.7344), (-1.4989, -0.0309, 0.5675, 0.4859), (-0.9177, -0.1383, 0.5005, 0.7234), (-0.0708, -0.0373, 0.5346, 0.4973),
            (0.9223, 0.0011, 0.7311, 0.73), (1.8671, 0.079, 0.4555, 0.7541), (2.874, 0.0005, 0.7311, 0.2569), (3.8798, 0.0796, 0.438, 0.7552),
        ])
        title.move_to([0, 3, 0])
        title.set_z_index(2)

        # step1: x + 3 = 5
        step1 = Tex(r"x + 3 = 5", font_size=98.9888)
        step1_g = _glyphs(step1, [
            (-2.3763, -0.1023, 0.6511, 0.6056), (-1.1668, -0.0555, 0.8904, 0.889), (-0.0162, 0.0394, 0.5548, 0.9184), (1.2102, -0.0561, 0.8904, 0.3128),
            (2.4352, 0.0401, 0.5334, 0.9198),
        ])
        step1_g[2].set_color("#F4C867")
        step1.move_to([-0.8631, 0, 0])
        step1.set_z_index(1)

        # step2: x = 5 - 3
        step2 = Tex(r"x = 5 - 3", font_size=98.9888)
        step2_g = _glyphs(step2, [
            (-2.5894, -0.1548, 0.7078, 0.6584), (-1.1936, -0.1047, 0.968, 0.3401), (0.1382, 0, 0.5799, 1), (1.3907, -0.1047, 0.8866, 0.0581),
            (2.6417, -0.0007, 0.6032, 0.9985),
        ])
        step2_g[4].set_color("#F4C867")
        step2.move_to([0.8671, 0, 0])

        # step3: x = 2
        step3 = Tex(r"x = 2", font_size=98.9888)
        step3_g = _glyphs(step3, [
            (-1.3535, -0.1654, 0.7194, 0.6691), (0.065, -0.1145, 0.9838, 0.3456), (1.4185, 0.0081, 0.5894, 0.9838),
        ])
        step3.set_z_index(1)

        title_in = Write(VGroup(*title_g[:]), stroke_color="#FFFFFF")
        # 0 s – 1 s: step1 write, title write
        self.play(
            Write(VGroup(*step1_g[:]), stroke_color="#FFFFFF"),
            _Part(title_in, 0, 5 / 6),
            run_time=1,
        )
        # 1 s – 1.2 s: title write
        self.play(_Part(title_in, 5 / 6, 1), run_time=0.2)
        # 1.2 s – 3.5 s
        self.wait(2.3)
        # 3.5 s – 4.5 s: step1 fade_out, step1 → step2, step2 fade_in
        self.play(
            FadeOut(VGroup(step1_g[1])),
            ReplacementTransform(step1_g[0], step2_g[0]),
            ReplacementTransform(step1_g[3], step2_g[1]),
            ReplacementTransform(step1_g[4], step2_g[2]),
            ReplacementTransform(step1_g[2], step2_g[4]),
            FadeIn(VGroup(step2_g[3])),
            run_time=1,
        )
        # 4.5 s – 7 s
        self.wait(2.5)
        step2_g[0].set_z_index(1)
        step2_g[1].set_z_index(1)
        step2_g[2].set_z_index(1)
        step2_g[3].set_z_index(1)
        step2_g[4].set_z_index(1)
        # 7 s – 8 s: step2 → step3
        self.play(
            ReplacementTransform(step2_g[0], step3_g[0]),
            ReplacementTransform(step2_g[1], step3_g[1]),
            FadeTransform(step2_g[2], step3_g[2]),
            FadeTransform(step2_g[3], step3_g[2]),
            FadeTransform(step2_g[4], step3_g[2]),
            run_time=1,
        )
        # 8 s – 8.6 s
        self.wait(0.6)
        step3_indicate = Indicate(step3_g[2])
        # 8.6 s – 9.5 s: step3 indicate
        self.play(_Part(step3_indicate, 0, 0.9), run_time=0.9)
        title_out = FadeOut(title)
        # 9.5 s – 9.6 s: step3 indicate, title fade_out
        self.play(_Part(step3_indicate, 0.9, 1), _Part(title_out, 0, 0.1), run_time=0.1)
        # 9.6 s – 10.5 s: title fade_out
        self.play(_Part(title_out, 0.1, 1), run_time=0.9)
