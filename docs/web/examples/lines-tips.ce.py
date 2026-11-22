# The shapes of a tip — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 TheShapesOfATip.py TheShapesOfATip
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 432 frames, like the editor's video export.
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


class TheShapesOfATip(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # label1: \text{Triangle}
        label1 = MathTex(r"\text{Triangle}", font_size=54)
        label1_g = _glyphs(label1, [
            (-1.641, 0.1046, 0.7206, 0.7517), (-1.0265, -0.0255, 0.3819, 0.4915), (-0.6484, 0.1001, 0.2543, 0.7428), (-0.2032, -0.0287, 0.5096, 0.5096),
            (0.3742, -0.0255, 0.574, 0.4915), (0.9621, -0.1342, 0.5063, 0.7317), (1.3923, 0.1144, 0.2631, 0.7713), (1.7865, -0.0287, 0.4297, 0.5096),
        ])
        label1.move_to([-4.4, 2.1, 0])
        label1.set_z_index(7)

        # l1: arrow
        l1 = Arrow([-2, 2.1, 0], [5, 2.1, 0], buff=0, tip_length=0.5)
        l1.set_z_index(6)

        # label2: \text{Stealth}
        label2 = MathTex(r"\text{Stealth}", font_size=54)
        label2_g = _glyphs(label2, [
            (-1.7868, 0, 0.6121, 1), (-1.1623, -0.0536, 0.4333, 0.8597), (-0.564, -0.1692, 0.5323, 0.6314), (0.1045, -0.1692, 0.6314, 0.6314),
            (0.6286, 0.008, 0.326, 0.9555), (1.0536, -0.0536, 0.4333, 0.8597), (1.7373, 0.008, 0.7111, 0.9555),
        ])
        label2.move_to([-4.4, 0.7, 0])
        label2.set_z_index(5)

        # l2: arrow
        l2 = Arrow([-2, 0.7, 0], [5, 0.7, 0], buff=0, color="#58C4DD", tip_length=0.5, tip_shape=StealthTip)
        l2.set_z_index(4)

        # label3: \text{Dot}
        label3 = MathTex(r"\text{Dot}", font_size=54)
        label3_g = _glyphs(label3, [
            (-0.6414, 0.0072, 0.9827, 0.9856), (0.2908, -0.1696, 0.6392, 0.6609), (0.9055, -0.0491, 0.4545, 0.9019),
        ])
        label3.move_to([-4.4, -0.7, 0])
        label3.set_z_index(3)

        # l3: arrow
        l3 = Arrow([-2, -0.7, 0], [5, -0.7, 0], buff=0, color="#83C167", tip_length=0.5, tip_shape=ArrowCircleFilledTip)
        l3.set_z_index(2)

        # label4: \text{Stealth and dot}
        label4 = MathTex(r"\text{Stealth and dot}", font_size=54)
        label4_g = _glyphs(label4, [
            (-4.2043, 0, 0.6121, 1), (-3.5798, -0.0536, 0.4333, 0.8597), (-2.9814, -0.1692, 0.5323, 0.6314), (-2.3129, -0.1692, 0.6314, 0.6314),
            (-1.7889, 0.008, 0.326, 0.9555), (-1.3638, -0.0536, 0.4333, 0.8597), (-0.6802, 0.008, 0.7111, 0.9555), (0.401, -0.1692, 0.6314, 0.6314),
            (1.1162, -0.1653, 0.7111, 0.6089), (1.8824, 0.0005, 0.6891, 0.9707), (2.9911, 0.0005, 0.6891, 0.9707), (3.7077, -0.1685, 0.6094, 0.63),
            (4.2937, -0.0536, 0.4333, 0.8597),
        ])
        label4.move_to([-4.4, -2.1, 0])
        label4.set_z_index(1)

        # l4: double arrow
        l4 = DoubleArrow([-2, -2.1, 0], [5, -2.1, 0], buff=0, color="#FFFF00", tip_length=0.5, tip_shape_end=ArrowCircleFilledTip, tip_shape_start=StealthTip)

        # 0 s – 0.2 s
        self.wait(0.2)
        # 0.2 s – 0.6 s: label1 fade_in
        self.play(FadeIn(label1), run_time=0.4)
        # 0.6 s – 0.8 s
        self.wait(0.2)
        l1_in = GrowArrow(l1)
        # 0.8 s – 0.9 s: l1 grow_arrow
        self.play(_Part(l1_in, 0, 0.125), run_time=0.1)
        # 0.9 s – 1.3 s: l1 grow_arrow, label2 fade_in
        self.play(_Part(l1_in, 0.125, 0.625), FadeIn(label2), run_time=0.4)
        # 1.3 s – 1.5 s: l1 grow_arrow
        self.play(_Part(l1_in, 0.625, 0.875), run_time=0.2)
        l2_in = GrowArrow(l2)
        # 1.5 s – 1.6 s: l1 grow_arrow, l2 grow_arrow
        self.play(_Part(l1_in, 0.875, 1), _Part(l2_in, 0, 0.125), run_time=0.1)
        # 1.6 s – 2 s: l2 grow_arrow, label3 fade_in
        self.play(_Part(l2_in, 0.125, 0.625), FadeIn(label3), run_time=0.4)
        # 2 s – 2.2 s: l2 grow_arrow
        self.play(_Part(l2_in, 0.625, 0.875), run_time=0.2)
        l3_in = GrowArrow(l3)
        # 2.2 s – 2.3 s: l2 grow_arrow, l3 grow_arrow
        self.play(_Part(l2_in, 0.875, 1), _Part(l3_in, 0, 0.125), run_time=0.1)
        # 2.3 s – 2.7 s: l3 grow_arrow, label4 fade_in
        self.play(_Part(l3_in, 0.125, 0.625), FadeIn(label4), run_time=0.4)
        # 2.7 s – 2.9 s: l3 grow_arrow
        self.play(_Part(l3_in, 0.625, 0.875), run_time=0.2)
        l4_in = GrowArrow(l4)
        # 2.9 s – 3 s: l3 grow_arrow, l4 grow_arrow
        self.play(_Part(l3_in, 0.875, 1), _Part(l4_in, 0, 0.125), run_time=0.1)
        # 3 s – 3.7 s: l4 grow_arrow
        self.play(_Part(l4_in, 0.125, 1), run_time=0.7)
        # 3.7 s – 6.7 s
        self.wait(3)
        # 6.7 s – 7.2 s: label1 fade_out, label2 fade_out, label3 fade_out, label4 fade_out, l1 fade_out, l2 fade_out, l3 fade_out, l4 fade_out
        self.play(
            FadeOut(label1),
            FadeOut(label2),
            FadeOut(label3),
            FadeOut(label4),
            FadeOut(l1),
            FadeOut(l2),
            FadeOut(l3),
            FadeOut(l4),
            run_time=0.5,
        )
