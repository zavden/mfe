# Arcs and a spline — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 ArcsAndASpline.py ArcsAndASpline
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


def _spline(line, curves):
    """Bend a straight line into a curve: `curves` gives, for each stretch of it, its two
    handles and the point it ends at, in the frame of the line's two ends — u along the line
    from its start (0) to its end (1), v across it to the left, as fractions of its length.
    An arrow keeps its tips, put on the curve."""
    tips = [type(tip) for tip in line.pop_tips()] if isinstance(line, Arrow) else []
    start, end = line.get_start(), line.get_end()
    along = end - start
    across = np.array([-along[1], along[0], 0.0])
    points = [start]
    for stretch in curves:
        points += [points[-1], *(start + u * along + v * across for u, v in stretch)]
    line.set_points(np.array(points[1:]))
    for shape, at_start in zip(tips, (False, True)):
        line.add_tip(tip_shape=shape, at_start=at_start)
        if not at_start:
            width = line.max_stroke_width_to_length_ratio * line.get_length()
            line.set_stroke(width=min(line.initial_stroke_width, width), family=False)
    return line


class _TraceArrow(Animation):
    """A bent arrow drawn along its own way, from its start (Manim's GrowArrow scales the
    arrow about that point): its tip leads the stroke and turns with it, grown out of the
    start over the first quarter of the way; the tip at the start of a double arrow grows
    where it is."""

    def __init__(self, arrow, **kwargs):
        super().__init__(arrow, introducer=True, **kwargs)

    def along(self, alpha):
        """The point of the shaft at that part of its curves, and the way it runs there."""
        points = self.starting_mobject.points
        index, t = integer_interpolate(0, len(points) // 4, alpha)
        curve = points[4 * index:4 * index + 4]
        return bezier(curve)(t), bezier(curve[1:] - curve[:-1])(t)

    def interpolate_submobject(self, submob, start, alpha):
        if submob is self.mobject:
            submob.pointwise_become_partial(start, 0, alpha)
            return
        base = start.base
        submob.set_points(start.points)
        if submob is self.mobject.tip:
            (at, way), (_, ahead) = self.along(alpha), self.along(1)
            if min(np.linalg.norm(way), np.linalg.norm(ahead)) > 1e-8:
                submob.rotate(angle_of_vector(way) - angle_of_vector(ahead), about_point=base)
            submob.shift(at - base)
            base = at
        submob.scale(min(1, 4 * alpha), about_point=base)


class ArcsAndASpline(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # a: A
        a = MathTex(r"A", font_size=144)
        a_g = _glyphs(a, [
            (0, 0, 0.9651, 1),
        ])
        a.move_to([-4.8, 0, 0])

        # b: B
        b = MathTex(r"B", font_size=144)
        b_g = _glyphs(b, [
            (0, 0, 1.0556, 1),
        ])
        b.move_to([4.8, 0, 0])
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
        l1 = Arrow(a.get_corner(UR), b.get_corner(UL), path_arc=-50 * DEGREES, color="#83C167")
        l1.set_z_index(4)
        # 1.8 s – 2.8 s: l1 grow_arrow
        self.play(_TraceArrow(l1), run_time=1)
        # 2.8 s – 3 s
        self.wait(0.2)
        l2 = _spline(Arrow(a.get_right(), b.get_left(), color="#FFFF00"), [((0.1, 0.08), (0.23, 0.07), (0.33, 0.07)), ((0.43, 0.07), (0.57, -0.07), (0.67, -0.07)), ((0.77, -0.07), (0.9, -0.08), (1, 0))])
        l2.set_z_index(3)
        # 3 s – 4 s: l2 grow_arrow
        self.play(_TraceArrow(l2), run_time=1)
        # 4 s – 4.2 s
        self.wait(0.2)
        l3 = Arrow(a.get_corner(DR), b.get_corner(DL), path_arc=50 * DEGREES, color="#58C4DD")
        l3.set_z_index(2)
        # 4.2 s – 5.2 s: l3 grow_arrow
        self.play(_TraceArrow(l3), run_time=1)
        # 5.2 s – 7.4 s
        self.wait(2.2)
        # 7.4 s – 8 s: a fade_out, l1 fade_out, l2 fade_out, l3 fade_out, b fade_out
        self.play(FadeOut(a), FadeOut(l1), FadeOut(l2), FadeOut(l3), FadeOut(b), run_time=0.6)
