# Line anchors — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl LineAnchors.py LineAnchors -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 300 frames, like the editor's video export.
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


class LineAnchors(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # sum: a^2+b^2
        sum = Tex(r"a^2+b^2", font_size=98.9888)
        sum_g = _glyphs(sum, [
            (-1.2742, -0.192, 0.4897, 0.4669), (-0.7888, 0.2562, 0.2921, 0.4875), (0.0793, -0.1557, 0.6895, 0.6885), (0.9513, -0.0615, 0.3955, 0.7299),
            (1.373, 0.2562, 0.2921, 0.4875),
        ])
        sum.move_to([-3.3, 1.5, 0])
        sum.set_z_index(1)

        # square: c^2
        square = Tex(r"c^2", font_size=123.736)
        square_g = _glyphs(square, [
            (-0.1974, -0.2465, 0.4415, 0.507), (0.2607, 0.2373, 0.3148, 0.5254),
        ])
        square.move_to([3.5, -1.5, 0])

        # arrow: arrow, built on sum and square where its clip starts

        sum_in = Write(VGroup(*sum_g[:]), stroke_color="#FFFFFF")
        # 0 s – 0.3 s: sum write
        self.play(_Part(sum_in, 0, 0.3), run_time=0.3)
        square_in = Write(VGroup(square_g[0], square_g[1]), stroke_color="#FFFFFF")
        # 0.3 s – 1 s: sum write, square write
        self.play(_Part(sum_in, 0.3, 1), _Part(square_in, 0, 0.7), run_time=0.7)
        # 1 s – 1.3 s: square write
        self.play(_Part(square_in, 0.7, 1), run_time=0.3)
        # 1.3 s – 1.5 s
        self.wait(0.2)
        arrow = Line(sum.get_right(), square.get_left(), buff=0.2, stroke_width=6, color="#F4C867").add_tip(length=0.35, width=0.35)
        arrow.set_z_index(2)
        # 1.5 s – 2.5 s: arrow grow_arrow
        self.play(GrowArrow(arrow), run_time=1)
        # 2.5 s – 5 s
        self.wait(2.5)
