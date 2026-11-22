# Braces — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 480 frames, like the editor's video export.
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


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # sum: 1+2+3+4+5+6
        sum = MathTex(r"1+2+3+4+5+6", font_size=60)
        sum_g = _glyphs(sum, [
            (-5.6902, 0.0474, 0.4342, 0.8763), (-4.5629, -0.0618, 0.875, 0.8763), (-3.43, 0.0474, 0.525, 0.8763), (-2.2968, -0.0618, 0.875, 0.8763),
            (-1.164, 0.0329, 0.5461, 0.9053), (-0.0308, -0.0618, 0.875, 0.8763), (1.1021, 0.0546, 0.5829, 0.8908), (2.2353, -0.0618, 0.875, 0.8763),
            (3.3682, 0.0329, 0.525, 0.9053), (4.5014, -0.0618, 0.875, 0.8763), (5.6343, 0.0329, 0.5461, 0.9053),
        ])
        sum.move_to([0, 0.3, 0])

        # first: brace, built on sum where its clip starts

        # six: 6
        six = MathTex(r"6", color="#58C4DD")
        six_g = _glyphs(six, [
            (0, 0, 0.6032, 1),
        ])
        six.set_z_index(2)

        # second: brace, built on sum where its clip starts

        # fifteen: 15
        fifteen = MathTex(r"15", color="#83C167")
        fifteen_g = _glyphs(fifteen, [
            (-0.3852, 0.016, 0.4797, 0.968), (0.335, 0, 0.5799, 1),
        ])
        fifteen.set_z_index(4)

        # whole: brace, built on sum where its clip starts

        # total: 6+15=21
        total = MathTex(r"6+15=21")
        total_g = _glyphs(total, [
            (-3.0157, 0.0407, 0.5541, 0.9186), (-1.8659, -0.0554, 0.8879, 0.8892), (-0.7104, 0.0554, 0.4406, 0.8892), (-0.0488, 0.0407, 0.5327, 0.9186),
            (1.1752, -0.0554, 0.8879, 0.3124), (2.3989, 0.0554, 0.5327, 0.8892), (3.0725, 0.0554, 0.4406, 0.8892),
        ])
        total_g[0].set_color("#58C4DD")
        VGroup(total_g[2], total_g[3]).set_color("#83C167")
        VGroup(total_g[5], total_g[6]).set_color("#FFFF00")
        total.set_z_index(6)

        # 0 s – 1.5 s: sum write
        self.play(Write(VGroup(*sum_g[:])), run_time=1.5)
        # 1.5 s – 2 s
        self.wait(0.5)
        first = Brace(VGroup(*sum_g[:5]), DOWN, buff=0.2, color="#58C4DD")
        first.set_z_index(1)
        first.put_at_tip(six, buff=0.25)
        # 2 s – 2.6 s: first grow_from_center, six fade_in
        self.play(GrowFromCenter(first), FadeIn(six), run_time=0.6)
        # 2.6 s – 3.2 s
        self.wait(0.6)
        second = Brace(VGroup(*sum_g[6:]), DOWN, buff=0.2, color="#83C167")
        second.set_z_index(3)
        second.put_at_tip(fifteen, buff=0.25)
        # 3.2 s – 3.8 s: fifteen fade_in, second grow_from_center
        self.play(FadeIn(fifteen), GrowFromCenter(second), run_time=0.6)
        # 3.8 s – 4.6 s
        self.wait(0.8)
        whole = Brace(sum, UP, buff=0.25, color="#FFFF00")
        whole.set_z_index(5)
        whole.put_at_tip(total, buff=0.3)
        fifteen_to_total = ReplacementTransform(VGroup(fifteen_g[0], fifteen_g[1]).copy().set_z_index(6), VGroup(total_g[2], total_g[3]), path_arc=45 * DEGREES)
        six_to_total = ReplacementTransform(six_g[0].copy().set_z_index(6), total_g[0], path_arc=-45 * DEGREES)
        total_in = FadeIn(VGroup(total_g[1], *total_g[4:]))
        # 4.6 s – 5.2 s: fifteen → total, six → total, total fade_in, whole grow_from_center
        self.play(
            _Part(fifteen_to_total, 0, 0.5),
            _Part(six_to_total, 0, 0.5),
            _Part(total_in, 0, 0.6),
            GrowFromCenter(whole),
            run_time=0.6,
        )
        # 5.2 s – 5.6 s: fifteen → total, six → total, total fade_in
        self.play(
            _Part(fifteen_to_total, 0.5, 5 / 6),
            _Part(six_to_total, 0.5, 5 / 6),
            _Part(total_in, 0.6, 1),
            run_time=0.4,
        )
        # 5.6 s – 5.8 s: fifteen → total, six → total
        self.play(_Part(fifteen_to_total, 5 / 6, 1), _Part(six_to_total, 5 / 6, 1), run_time=0.2)
        # 5.8 s – 7.2 s
        self.wait(1.4)
        # 7.2 s – 8 s: fifteen fade_out, first fade_out, second fade_out, six fade_out, sum fade_out, total fade_out, whole fade_out
        self.play(
            FadeOut(fifteen),
            FadeOut(first),
            FadeOut(second),
            FadeOut(six),
            FadeOut(sum),
            FadeOut(total),
            FadeOut(whole),
            run_time=0.8,
        )
