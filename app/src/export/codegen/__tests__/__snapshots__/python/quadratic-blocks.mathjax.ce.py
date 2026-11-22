# Quadratic blocks — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
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

        # general: ax^2+bx+c=0
        general = MathTex(r"ax^2+bx+c=0")
        general_g = _glyphs(general, [
            (-3.9375, 0, 0.6875, 1), (-3.0625, 0, 0.6875, 1), (-2.1875, 0, 0.6875, 1), (-1.3125, 0, 0.6875, 1),
            (-0.4375, 0, 0.6875, 1), (0.4375, 0, 0.6875, 1), (1.3125, 0, 0.6875, 1), (2.1875, 0, 0.6875, 1),
            (3.0625, 0, 0.6875, 1), (3.9375, 0, 0.6875, 1),
        ])
        general.move_to([0, 1.5, 0])
        general.set_z_index(1)

        # moved: ax^2+bx=-c
        moved = MathTex(r"ax^2+bx=-c", color="#FFFF00")
        moved_g = _glyphs(moved, [
            (-3.5, 0, 0.6875, 1), (-2.625, 0, 0.6875, 1), (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1),
            (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1), (1.75, 0, 0.6875, 1), (2.625, 0, 0.6875, 1),
            (3.5, 0, 0.6875, 1),
        ])
        moved.move_to([0, -1, 0])

        # 0 s – 1 s: general write
        self.play(Write(VGroup(*general_g[:6], general_g[8], general_g[9])), run_time=1)
        # 1 s – 1.2 s
        self.wait(0.2)
        # 1.2 s – 1.8 s: general write
        self.play(Write(VGroup(general_g[6], general_g[7])), run_time=0.6)
        # 1.8 s – 2 s
        self.wait(0.2)
        # 2 s – 2.5 s: general unwrite
        self.play(Unwrite(VGroup(general_g[8], general_g[9])), run_time=0.5)
        # 2.5 s – 2.6 s
        self.wait(0.1)
        general_to_moved = [
            ReplacementTransform(VGroup(*general_g[:6]), VGroup(*moved_g[:6])),
            ReplacementTransform(general_g[7], moved_g[8]),
        ]
        # 2.6 s – 3.5 s: general → moved
        self.play(*(_Part(a, 0, 0.75) for a in general_to_moved), run_time=0.9)
        general_out = FadeOut(general_g[6])
        # 3.5 s – 3.8 s: general → moved, general fade_out
        self.play(
            *(_Part(a, 0.75, 1) for a in general_to_moved),
            _Part(general_out, 0, 0.6),
            run_time=0.3,
        )
        # 3.8 s – 3.9 s: general fade_out
        self.play(_Part(general_out, 0.6, 0.8), run_time=0.1)
        moved_appear = Write(VGroup(moved_g[6], moved_g[7]))
        # 3.9 s – 4 s: general fade_out, moved write
        self.play(_Part(general_out, 0.8, 1), _Part(moved_appear, 0, 1 / 6), run_time=0.1)
        # 4 s – 4.5 s: moved write
        self.play(_Part(moved_appear, 1 / 6, 1), run_time=0.5)
        # 4.5 s – 5 s: moved fade_out
        self.play(FadeOut(moved), run_time=0.5)
