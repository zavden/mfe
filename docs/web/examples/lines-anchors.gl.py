# Where an end is on a formula — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl WhereAnEndIsOnAFormula.py WhereAnEndIsOnAFormula -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 420 frames, like the editor's video export.
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


class WhereAnEndIsOnAFormula(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # a: A
        a = Tex(r"A", font_size=148.4832)
        a_g = _glyphs(a, [
            (0, 0, 0.9651, 1),
        ])
        a.move_to([-4.2, 0, 0])

        # b: B
        b = Tex(r"B", font_size=148.4832)
        b_g = _glyphs(b, [
            (0, 0, 1.0556, 1),
        ])
        b.move_to([4.2, 0, 0])
        b.set_z_index(1)

        # l1: arrow, built on a and b where its clip starts

        # l2: arrow, built on a and b where its clip starts

        # l3: arrow, built on a and b where its clip starts

        a_in = FadeIn(a)
        # 0 s – 0.3 s: a fade_in
        self.play(_Part(a_in, 0, 0.375), run_time=0.3)
        b_in = FadeIn(b)
        # 0.3 s – 0.8 s: a fade_in, b fade_in
        self.play(_Part(a_in, 0.375, 1), _Part(b_in, 0, 0.625), run_time=0.5)
        # 0.8 s – 1.1 s: b fade_in
        self.play(_Part(b_in, 0.625, 1), run_time=0.3)
        # 1.1 s – 1.8 s
        self.wait(0.7)
        l1 = Line(a.get_corner(UR), b.get_corner(UL), buff=0.25, stroke_width=6, color="#83C167").add_tip(length=0.35, width=0.35)
        l1.set_z_index(4)
        # 1.8 s – 2.6 s: l1 grow_arrow
        self.play(GrowArrow(l1), run_time=0.8)
        l2 = Line(a, b, buff=0.25, stroke_width=6, color="#FFFFFF").add_tip(length=0.35, width=0.35)
        l2.set_z_index(3)
        # 2.6 s – 3.4 s: l2 grow_arrow
        self.play(GrowArrow(l2), run_time=0.8)
        l3 = Line(a.get_corner(DR), b.get_corner(DL), buff=0.25, stroke_width=6, color="#58C4DD").add_tip(length=0.35, width=0.35)
        l3.set_z_index(2)
        # 3.4 s – 4.2 s: l3 grow_arrow
        self.play(GrowArrow(l3), run_time=0.8)
        # 4.2 s – 6.4 s
        self.wait(2.2)
        # 6.4 s – 7 s: a fade_out, l1 fade_out, l2 fade_out, l3 fade_out, b fade_out
        self.play(FadeOut(a), FadeOut(l1), FadeOut(l2), FadeOut(l3), FadeOut(b), run_time=0.6)
