# Blocks beside relations — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
from manimlib import *


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

        # sum: a+b=c
        sum = Tex(r"a+b=c")
        sum.move_to([0, 1.5, 0])
        sum.set_z_index(1)

        # swap: c=a+b
        swap = Tex(r"c=a+b")
        swap.move_to([0, -1, 0])

        # 0 s – 1 s: sum write
        self.play(Write(sum, stroke_color="#FFFFFF"), run_time=1)
        self.add(swap[1])
        sum_to_swap = [
            TransformFromCopy(sum[0], swap[2]),
            ReplacementTransform(sum[4], swap[0]),
        ]
        swap_appear = FadeIn(VGroup(swap[3]))
        # 1 s – 1.2 s: sum → swap, swap fade_in
        self.play(
            *(_Part(a, 0, 1 / 6) for a in sum_to_swap),
            _Part(swap_appear, 0, 0.4),
            run_time=0.2,
        )
        sum_disappear = _Unwrite(VGroup(sum[1], sum[3]), stroke_color="#FFFFFF", rate_func=smooth)
        # 1.2 s – 1.5 s: sum → swap, swap fade_in, sum unwrite
        self.play(
            *(_Part(a, 1 / 6, 5 / 12) for a in sum_to_swap),
            _Part(swap_appear, 0.4, 1),
            _Part(sum_disappear, 0, 0.5),
            run_time=0.3,
        )
        # 1.5 s – 1.8 s: sum → swap, sum unwrite
        self.play(
            *(_Part(a, 5 / 12, 2 / 3) for a in sum_to_swap),
            _Part(sum_disappear, 0.5, 1),
            run_time=0.3,
        )
        # 1.8 s – 2.2 s: sum → swap
        self.play(*(_Part(a, 2 / 3, 1) for a in sum_to_swap), run_time=0.4)
        # 2.2 s – 2.4 s
        self.wait(0.2)
        # 2.4 s – 2.9 s: sum write
        self.play(Write(VGroup(sum[1], sum[3]), stroke_color="#FFFFFF"), run_time=0.5)
        # 2.9 s – 3 s
        self.wait(0.1)
        sum_out = FadeOut(sum[:4])
        # 3 s – 3.2 s: sum fade_out
        self.play(_Part(sum_out, 0, 0.4), run_time=0.2)
        swap_out = ShrinkToCenter(swap[:4], remover=True)
        # 3.2 s – 3.4 s: sum fade_out, swap shrink_to_center
        self.play(_Part(sum_out, 0.4, 0.8), _Part(swap_out, 0, 0.25), run_time=0.2)
        swap_appear_2 = GrowFromCenter(VGroup(swap[4]))
        # 3.4 s – 3.5 s: sum fade_out, swap shrink_to_center, swap grow_from_center
        self.play(
            _Part(sum_out, 0.8, 1),
            _Part(swap_out, 0.25, 0.375),
            _Part(swap_appear_2, 0, 0.25),
            run_time=0.1,
        )
        # 3.5 s – 3.8 s: swap shrink_to_center, swap grow_from_center
        self.play(_Part(swap_out, 0.375, 0.75), _Part(swap_appear_2, 0.25, 1), run_time=0.3)
        # 3.8 s – 4 s: swap shrink_to_center
        self.play(_Part(swap_out, 0.75, 1), run_time=0.2)
        self.remove(swap[4])
        # 4 s – 5 s
        self.wait(1)
