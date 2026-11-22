# Off grid — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 25 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 25
# Every play and wait lasts a whole number of frames at 25 fps, so the video has
# exactly 83 frames, like the editor's video export.
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

        # p: p+q
        p = Tex(r"p+q")
        p_g = _glyphs(p, [
            (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
        ])
        p.set_z_index(1)

        # q: q+p
        q = Tex(r"q+p")
        q_g = _glyphs(q, [
            (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
        ])
        q.move_to([0, -1.5, 0])

        # 0 s – 0.8 s: p write
        self.play(Write(VGroup(*p_g[:]), stroke_color="#FFFFFF"), run_time=0.8)
        # 0.8 s – 1.08 s
        self.wait(0.279999)
        self.add(q_g[1])
        p_to_q = [
            ReplacementTransform(p_g[0], q_g[2]),
            ReplacementTransform(p_g[2], q_g[0]),
        ]
        # 1.08 s – 1.88 s: p → q
        self.play(*(_Part(a, 0, 20 / 23) for a in p_to_q), run_time=0.8)
        p_out = FadeOut(VGroup(p_g[1]))
        # 1.88 s – 2 s: p → q, p fade_out
        self.play(*(_Part(a, 20 / 23, 1) for a in p_to_q), _Part(p_out, 0, 0.25), run_time=0.12)
        # 2 s – 2.12 s: p fade_out
        self.play(_Part(p_out, 0.25, 0.5), run_time=0.12)
        q_move = q.animate.move_to([0, -2.5, 0]).build()
        # 2.12 s – 2.36 s: p fade_out, q tween
        self.play(_Part(p_out, 0.5, 1), _Part(q_move, 0, 0.6), run_time=0.24)
        # 2.36 s – 2.52 s: q tween
        self.play(_Part(q_move, 0.6, 1), run_time=0.16)
        # 2.52 s – 2.72 s
        self.wait(0.2)
        # 2.72 s – 3.32 s: q fade_out
        self.play(FadeOut(q), run_time=0.6)
