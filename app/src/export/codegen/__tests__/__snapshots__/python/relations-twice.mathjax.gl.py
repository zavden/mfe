# Relations twice — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 210 frames, like the editor's video export.
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


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # sum: a+b=c
        sum = Tex(r"a+b=c")
        sum_g = _glyphs(sum, [
            (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
            (1.75, 0, 0.6875, 1),
        ])
        sum.move_to([0, 1.5, 0])
        sum.set_z_index(1)

        # swap: c=a+b
        swap = Tex(r"c=a+b")
        swap.set_color("#83C167")
        swap_g = _glyphs(swap, [
            (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
            (1.75, 0, 0.6875, 1),
        ])
        swap.move_to([0, -1, 0])

        # 0 s – 1 s: sum write
        self.play(Write(VGroup(*sum_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        sum_to_swap = ReplacementTransform(sum_g[0], swap_g[2])
        # 1.5 s – 2 s: sum → swap
        self.play(_Part(sum_to_swap, 0, 0.5), run_time=0.5)
        sum_to_swap_2 = [
            ReplacementTransform(sum_g[4], swap_g[0]),
            TransformFromCopy(sum_g[2], swap_g[4]),
        ]
        # 2 s – 2.5 s: sum → swap, sum → swap
        self.play(
            _Part(sum_to_swap, 0.5, 1),
            *(_Part(a, 0, 0.5) for a in sum_to_swap_2),
            run_time=0.5,
        )
        # 2.5 s – 3 s: sum → swap
        self.play(*(_Part(a, 0.5, 1) for a in sum_to_swap_2), run_time=0.5)
        # 3 s – 4 s
        self.wait(1)
        # 4 s – 4.6 s: sum → swap
        self.play(
            ReplacementTransform(sum_g[3], swap_g[1], path_arc=90 * DEGREES),
            FadeTransform(sum_g[1], swap_g[3], path_arc=90 * DEGREES),
            run_time=0.6,
        )
        # 4.6 s – 5.5 s
        self.wait(0.9)
        # 5.5 s – 6 s: sum fade_out
        self.play(FadeOut(VGroup(sum_g[2])), run_time=0.5)
        # 6 s – 6.5 s
        self.wait(0.5)
        # 6.5 s – 7 s: swap fade_out
        self.play(FadeOut(swap), run_time=0.5)
