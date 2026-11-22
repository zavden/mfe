# Unpaired glyphs — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl UnpairedGlyphs.py UnpairedGlyphs -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 744 frames, like the editor's video export.
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


class UnpairedGlyphs(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # source: a+b=c
        source = Tex(r"a+b=c", font_size=148.4832)
        source_g = _glyphs(source, [
            (-2.215, -0.1166, 0.6095, 0.5812), (-1.093, -0.0715, 0.8582, 0.857), (-0.0076, 0.0457, 0.4923, 0.9085), (1.1068, -0.0722, 0.8582, 0.3015),
            (2.2648, -0.1175, 0.5099, 0.5855),
        ])
        source_g[0].set_color("#F4C867")
        source_g[2].set_color("#58C4DD")
        source_g[4].set_color("#FC6255")
        source.set_z_index(1)

        # target: a=c-b
        target = Tex(r"a=c-b", font_size=148.4832)
        target_g = _glyphs(target, [
            (-2.4309, -0.1774, 0.6697, 0.6385), (-1.1194, -0.1286, 0.9429, 0.3313), (0.1528, -0.1784, 0.5602, 0.6432), (1.3029, -0.1286, 0.8636, 0.0566),
            (2.4953, 0.0009, 0.5408, 0.9981),
        ])
        target_g[0].set_color("#F4C867")
        target_g[2].set_color("#FC6255")
        target_g[4].set_color("#58C4DD")

        # source: a+b=c
        source_2 = Tex(r"a+b=c", font_size=148.4832)
        source_2_g = _glyphs(source_2, [
            (-2.215, -0.1166, 0.6095, 0.5812), (-1.093, -0.0715, 0.8582, 0.857), (-0.0076, 0.0457, 0.4923, 0.9085), (1.1068, -0.0722, 0.8582, 0.3015),
            (2.2648, -0.1175, 0.5099, 0.5855),
        ])
        source_2_g[0].set_color("#F4C867")
        source_2_g[2].set_color("#58C4DD")
        source_2_g[4].set_color("#FC6255")
        source_2.set_z_index(1)

        # target: a=c-b
        target_2 = Tex(r"a=c-b", font_size=148.4832)
        target_2_g = _glyphs(target_2, [
            (-2.4309, -0.1774, 0.6697, 0.6385), (-1.1194, -0.1286, 0.9429, 0.3313), (0.1528, -0.1784, 0.5602, 0.6432), (1.3029, -0.1286, 0.8636, 0.0566),
            (2.4953, 0.0009, 0.5408, 0.9981),
        ])
        target_2_g[0].set_color("#F4C867")
        target_2_g[2].set_color("#FC6255")
        target_2_g[4].set_color("#58C4DD")

        # 0 s – 1 s: source write
        self.play(Write(VGroup(*source_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.8 s
        self.wait(0.8)
        # 1.8 s – 3.3 s: source → target, target fade_in
        self.play(
            ReplacementTransform(source_g[0], target_g[0]),
            ReplacementTransform(source_g[4], target_g[2]),
            ReplacementTransform(source_g[2], target_g[4]),
            ReplacementTransform(source_g[3], target_g[1]),
            FadeIn(VGroup(target_g[3])),
            run_time=1.5,
        )
        # 3.3 s – 5 s
        self.wait(1.7)
        source_out = FadeOut(VGroup(source_g[1]))
        # 5 s – 5.4 s: source fade_out
        self.play(_Part(source_out, 0, 0.4), run_time=0.4)
        # 5.4 s – 6 s: source fade_out, target fade_out
        self.play(_Part(source_out, 0.4, 1), FadeOut(target), run_time=0.6)
        # 6 s – 7 s
        self.wait(1)
        # 7 s – 8 s: source_2 write
        self.play(Write(VGroup(*source_2_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 8 s – 8.8 s
        self.wait(0.8)
        # 8.8 s – 10.3 s: source_2 fade_out, source_2 → target_2, target_2 fade_in
        self.play(
            FadeOut(VGroup(source_2_g[1])),
            ReplacementTransform(source_2_g[0], target_2_g[0]),
            ReplacementTransform(source_2_g[4], target_2_g[2]),
            ReplacementTransform(source_2_g[2], target_2_g[4]),
            ReplacementTransform(source_2_g[3], target_2_g[1]),
            FadeIn(VGroup(target_2_g[3])),
            run_time=1.5,
        )
        # 10.3 s – 11.8 s
        self.wait(1.5)
        # 11.8 s – 12.4 s: target_2 fade_out
        self.play(FadeOut(target_2), run_time=0.6)
