# Fraction bars — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
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


class _Unwrite(Write):
    """ManimGL's missing Unwrite: Write over the glyphs in reverse order, played backwards.
    Write restyles a glyph as its outline only when it first crosses into the fill stage, so
    going backwards a glyph would keep the last fill it was drawn with while its outline is
    taken back; here it goes back to the outline style. A glyph that holds others (an arrow's
    line, its tips) goes before them, and they go from the last, as in ManimCE's Unwrite."""

    def __init__(self, vmobject, rate_func=linear, **kwargs):
        glyphs = vmobject.family_members_with_points()
        held = [g for g in glyphs if not any(p in glyphs for p in g.parents)]
        self.holders = [g for g in held if g.submobjects]
        super().__init__(VGroup(*reversed(held)), rate_func=lambda t: rate_func(1 - t), remover=True, **kwargs)

    def begin(self):
        for holder in self.holders:
            holder.reverse_submobjects()
        super().begin()

    def finish(self):
        super().finish()
        for holder in self.holders:
            holder.reverse_submobjects()

    def interpolate_submobject(self, submob, start, outline, alpha):
        super().interpolate_submobject(submob, start, outline, alpha)
        if alpha < 0.5:
            submob.match_style(outline)

    def clean_up_from_scene(self, scene):
        # Off screen, the glyphs get their shape back: some come back later.
        super().clean_up_from_scene(scene)
        self.interpolate(0)


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # ratio: \frac{a}{b}+c
        ratio = Tex(r"\frac{a}{b}+c")
        ratio_g = _glyphs(ratio, [
            (-1.75, 0.375, 1.25, 0.0625), (-0.5937, 0, 0.6875, 1), (0.2812, 0, 0.6875, 1), (1.1563, 0, 0.6875, 1),
            (2.0313, 0, 0.6875, 1),
        ])
        ratio.move_to([-2, 1, 0])
        ratio.set_z_index(2)

        # flipped: c=\frac{b}{a}+d
        flipped = Tex(r"c=\frac{b}{a}+d")
        flipped.set_color("#58C4DD")
        flipped_g = _glyphs(flipped, [
            (-2.9063, 0, 0.6875, 1), (-2.0313, 0, 0.6875, 1), (-0.875, 0.375, 1.25, 0.0625), (0.2812, 0, 0.6875, 1),
            (1.1563, 0, 0.6875, 1), (2.0313, 0, 0.6875, 1), (2.9063, 0, 0.6875, 1),
        ])
        flipped.move_to([0, -0.5, 0])
        flipped.set_z_index(1)

        # xy: \frac{x}{y}=z
        xy = Tex(r"\frac{x}{y}=z")
        xy_g = _glyphs(xy, [
            (-1.75, 0.375, 1.25, 0.0625), (-0.5937, 0, 0.6875, 1), (0.2812, 0, 0.6875, 1), (1.1563, 0, 0.6875, 1),
            (2.0313, 0, 0.6875, 1),
        ])
        xy.move_to([2.5, 1, 0])

        # 0 s – 1 s: ratio write
        self.play(Write(VGroup(*ratio_g[:]), stroke_color="#FFFFFF"), run_time=1)
        flipped_in = FadeIn(VGroup(flipped_g[5], flipped_g[6]))
        # 1 s – 1.2 s: flipped fade_in
        self.play(_Part(flipped_in, 0, 0.4), run_time=0.2)
        ratio_to_flipped = [
            TransformFromCopy(ratio_g[0], flipped_g[4]),
            TransformFromCopy(ratio_g[1], flipped_g[3]),
            TransformFromCopy(ratio_g[2], flipped_g[2]),
            TransformFromCopy(ratio_g[3], flipped_g[1]),
            TransformFromCopy(ratio_g[4], flipped_g[0]),
        ]
        # 1.2 s – 1.5 s: flipped fade_in, ratio → flipped
        self.play(
            _Part(flipped_in, 0.4, 1),
            *(_Part(a, 0, 0.3) for a in ratio_to_flipped),
            run_time=0.3,
        )
        # 1.5 s – 2.2 s: ratio → flipped
        self.play(*(_Part(a, 0.3, 1) for a in ratio_to_flipped), run_time=0.7)
        # 2.2 s – 2.4 s
        self.wait(0.2)
        ratio_out = _Unwrite(VGroup(*ratio_g[:]), stroke_color="#FFFFFF")
        # 2.4 s – 2.5 s: ratio unwrite
        self.play(_Part(ratio_out, 0, 1 / 6), run_time=0.1)
        flipped_to_xy = [
            ReplacementTransform(flipped_g[0], xy_g[1]),
            ReplacementTransform(flipped_g[4], xy_g[0]),
            ReplacementTransform(flipped_g[2], xy_g[2]),
        ]
        xy_in = ShowCreation(VGroup(xy_g[3], xy_g[4]))
        # 2.5 s – 3 s: ratio unwrite, flipped → xy, xy create
        self.play(
            _Part(ratio_out, 1 / 6, 1),
            *(_Part(a, 0, 0.5) for a in flipped_to_xy),
            _Part(xy_in, 0, 5 / 6),
            run_time=0.5,
        )
        # 3 s – 3.1 s: flipped → xy, xy create
        self.play(
            *(_Part(a, 0.5, 0.6) for a in flipped_to_xy),
            _Part(xy_in, 5 / 6, 1),
            run_time=0.1,
        )
        # 3.1 s – 3.5 s: flipped → xy
        self.play(*(_Part(a, 0.6, 1) for a in flipped_to_xy), run_time=0.4)
        # 3.5 s – 3.7 s
        self.wait(0.2)
        xy_disappear = _Unwrite(VGroup(xy_g[1]), stroke_color="#FFFFFF")
        # 3.7 s – 3.9 s: xy unwrite
        self.play(_Part(xy_disappear, 0, 0.4), run_time=0.2)
        flipped_out = Uncreate(VGroup(flipped_g[1], flipped_g[3], flipped_g[5], flipped_g[6]))
        # 3.9 s – 4.2 s: xy unwrite, flipped uncreate
        self.play(_Part(xy_disappear, 0.4, 1), _Part(flipped_out, 0, 0.5), run_time=0.3)
        # 4.2 s – 4.3 s: flipped uncreate
        self.play(_Part(flipped_out, 0.5, 2 / 3), run_time=0.1)
        xy_appear = Write(VGroup(xy_g[1]), stroke_color="#FFFFFF")
        # 4.3 s – 4.5 s: flipped uncreate, xy write
        self.play(_Part(flipped_out, 2 / 3, 1), _Part(xy_appear, 0, 0.5), run_time=0.2)
        # 4.5 s – 4.7 s: xy write
        self.play(_Part(xy_appear, 0.5, 1), run_time=0.2)
        # 4.7 s – 5 s: xy shrink_to_center
        self.play(ShrinkToCenter(xy, remover=True), run_time=0.3)
