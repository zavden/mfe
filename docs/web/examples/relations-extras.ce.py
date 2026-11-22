# Two sources, one target — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 TwoSourcesOneTarget.py TwoSourcesOneTarget
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 960 frames, like the editor's video export.
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


class TwoSourcesOneTarget(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # source: xx
        source = MathTex(r"xx", font_size=192)
        source_g = _glyphs(source, [
            (-0.6313, 0, 1.0751, 1), (0.6313, 0, 1.0751, 1),
        ])
        source_g[0].set_color("#F4C867")
        source_g[1].set_color("#58C4DD")
        source.move_to([0, 1.9, 0])
        source.set_z_index(1)

        # target: x^2
        target = MathTex(r"x^2", font_size=192)
        target_g = _glyphs(target, [
            (-0.2237, -0.2469, 0.5442, 0.5062), (0.3382, 0.2369, 0.3152, 0.5262),
        ])
        target_g[0].set_color("#F4C867")
        target.move_to([0, -1.9, 0])

        # source: xx
        source_2 = MathTex(r"xx", font_size=192)
        source_2_g = _glyphs(source_2, [
            (-0.6313, 0, 1.0751, 1), (0.6313, 0, 1.0751, 1),
        ])
        source_2_g[0].set_color("#F4C867")
        source_2_g[1].set_color("#58C4DD")
        source_2.move_to([0, 1.9, 0])
        source_2.set_z_index(1)

        # target: x^2
        target_2 = MathTex(r"x^2", font_size=192)
        target_2_g = _glyphs(target_2, [
            (-0.2237, -0.2469, 0.5442, 0.5062), (0.3382, 0.2369, 0.3152, 0.5262),
        ])
        target_2_g[0].set_color("#F4C867")
        target_2.move_to([0, -1.9, 0])

        # source: xx
        source_3 = MathTex(r"xx", font_size=192)
        source_3_g = _glyphs(source_3, [
            (-0.6313, 0, 1.0751, 1), (0.6313, 0, 1.0751, 1),
        ])
        source_3_g[0].set_color("#F4C867")
        source_3_g[1].set_color("#58C4DD")
        source_3.move_to([0, 1.9, 0])
        source_3.set_z_index(1)

        # target: x^2
        target_3 = MathTex(r"x^2", font_size=192)
        target_3_g = _glyphs(target_3, [
            (-0.2237, -0.2469, 0.5442, 0.5062), (0.3382, 0.2369, 0.3152, 0.5262),
        ])
        target_3_g[0].set_color("#F4C867")
        target_3.move_to([0, -1.9, 0])

        # 0 s – 0.8 s: source write
        self.play(Write(VGroup(source_g[0], source_g[1])), run_time=0.8)
        # 0.8 s – 1.6 s
        self.wait(0.8)
        # 1.6 s – 3.2 s: source → target, target fade_in
        self.play(
            ReplacementTransform(source_g[0], target_g[0]),
            Transform(source_g[1], target_g[0], remover=True),
            FadeIn(target_g[1]),
            run_time=1.6,
        )
        # 3.2 s – 4.4 s
        self.wait(1.2)
        # 4.4 s – 4.8 s: target fade_out
        self.play(FadeOut(target), run_time=0.4)
        # 4.8 s – 5.6 s
        self.wait(0.8)
        # 5.6 s – 6.4 s: source_2 write
        self.play(Write(VGroup(source_2_g[0], source_2_g[1])), run_time=0.8)
        # 6.4 s – 7.2 s
        self.wait(0.8)
        # 7.2 s – 8.8 s: source_2 → target_2, target_2 fade_in
        self.play(
            ReplacementTransform(VGroup(source_2_g[0], source_2_g[1]), VGroup(target_2_g[0])),
            FadeIn(target_2_g[1]),
            run_time=1.6,
        )
        # 8.8 s – 10 s
        self.wait(1.2)
        # 10 s – 10.4 s: target_2 fade_out
        self.play(FadeOut(target_2), run_time=0.4)
        # 10.4 s – 11.2 s
        self.wait(0.8)
        # 11.2 s – 12 s: source_3 write
        self.play(Write(VGroup(source_3_g[0], source_3_g[1])), run_time=0.8)
        # 12 s – 12.8 s
        self.wait(0.8)
        # 12.8 s – 14.4 s: source_3 → target_3, target_3 fade_in
        self.play(
            ReplacementTransform(source_3_g[0], target_3_g[0]),
            Transform(source_3_g[1].copy(), target_3_g[0], remover=True),
            FadeIn(target_3_g[1]),
            run_time=1.6,
        )
        # 14.4 s – 15 s
        self.wait(0.6)
        source_3_out = FadeOut(source_3_g[1])
        # 15 s – 15.6 s: source_3 fade_out
        self.play(_Part(source_3_out, 0, 0.75), run_time=0.6)
        target_3_out = FadeOut(target_3)
        # 15.6 s – 15.8 s: source_3 fade_out, target_3 fade_out
        self.play(_Part(source_3_out, 0.75, 1), _Part(target_3_out, 0, 0.5), run_time=0.2)
        # 15.8 s – 16 s: target_3 fade_out
        self.play(_Part(target_3_out, 0.5, 1), run_time=0.2)
