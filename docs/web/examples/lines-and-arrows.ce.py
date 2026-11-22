# Lines and arrows — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 LinesAndArrows.py LinesAndArrows
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 1380 frames, like the editor's video export.
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


class LinesAndArrows(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # title1: \text{Four kinds of line}
        title1 = MathTex(r"\text{Four kinds of line}", font_size=60, color="#5CD0B3")
        title1_g = _glyphs(title1, [
            (-4.8087, -0.0098, 0.817, 0.9497), (-3.9916, -0.1788, 0.6187, 0.6397), (-3.2458, -0.1832, 0.7221, 0.6336), (-2.5971, -0.1755, 0.4804, 0.6182),
            (-1.5978, 0.0005, 0.6858, 0.9702), (-1.0349, -0.0175, 0.3198, 0.9344), (-0.4469, -0.1755, 0.7221, 0.6182), (0.331, -0.0072, 0.6997, 0.9856),
            (0.9839, -0.1795, 0.4553, 0.6411), (1.9581, -0.1788, 0.6187, 0.6397), (2.5859, 0.0077, 0.4832, 0.9846), (3.2863, 0.0005, 0.331, 0.9702),
            (3.669, -0.0175, 0.3198, 0.9344), (4.257, -0.1755, 0.7221, 0.6182), (4.9469, -0.1795, 0.5405, 0.6411),
        ])
        title1.move_to([0, 3.3, 0])

        # kind1: \text{Line}
        kind1 = MathTex(r"\text{Line}", font_size=50)
        kind1_g = _glyphs(kind1, [
            (-0.9308, 0.0079, 0.8026, 0.9841), (-0.2651, -0.0022, 0.33, 0.964), (0.3415, -0.1652, 0.745, 0.6378), (1.0533, -0.1693, 0.5576, 0.6614),
        ])
        kind1.move_to([-4.4, 1.9, 0])
        kind1.set_z_index(1)

        # l1: line
        l1 = Line([-2, 1.9, 0], [5, 1.9, 0])
        l1.set_z_index(8)

        # kind2: \text{Dashed line}
        kind2 = MathTex(r"\text{Dashed line}", font_size=50)
        kind2_g = _glyphs(kind2, [
            (-3.0347, -0.0005, 0.965, 0.9679), (-2.0994, -0.1748, 0.6504, 0.6504), (-1.4865, -0.1748, 0.462, 0.6504), (-0.8042, 0.0078, 0.7326, 0.9844),
            (-0.1042, -0.1748, 0.5484, 0.6504), (0.6143, 0, 0.71, 1), (1.5581, 0.0078, 0.3359, 0.9844), (1.9464, -0.0104, 0.3245, 0.948),
            (2.543, -0.1708, 0.7326, 0.6273), (3.243, -0.1748, 0.5484, 0.6504),
        ])
        kind2.move_to([-4.4, 0.6, 0])
        kind2.set_z_index(2)

        # l2: dashed
        l2 = DashedLine([-2, 0.6, 0], [5, 0.6, 0], dash_length=0.15, color="#58C4DD")
        l2.set_z_index(9)

        # kind3: \text{Arrow}
        kind3 = MathTex(r"\text{Arrow}", font_size=50)
        kind3_g = _glyphs(kind3, [
            (-1.3893, 0.0076, 0.9422, 0.9849), (-0.6087, -0.1804, 0.4732, 0.6089), (-0.0695, -0.1804, 0.4732, 0.6089), (0.5488, -0.1836, 0.6094, 0.63),
            (1.3893, -0.196, 0.9422, 0.608),
        ])
        kind3.move_to([-4.4, -0.7, 0])
        kind3.set_z_index(3)

        # l3: arrow
        l3 = Arrow([-2, -0.7, 0], [5, -0.7, 0], buff=0, color="#83C167")
        l3.set_z_index(10)

        # kind4: \text{Double arrow}
        kind4 = MathTex(r"\text{Double arrow}", font_size=50)
        kind4_g = _glyphs(kind4, [
            (-3.6327, -0.0005, 0.965, 0.9679), (-2.7173, -0.1741, 0.6278, 0.649), (-1.9606, -0.1786, 0.7326, 0.6429), (-1.1904, 0, 0.7114, 1),
            (-0.5817, 0.0078, 0.3359, 0.9844), (-0.0786, -0.1748, 0.5484, 0.6504), (0.9643, -0.1748, 0.6504, 0.6504), (1.5716, -0.1708, 0.4875, 0.6273),
            (2.1271, -0.1708, 0.4875, 0.6273), (2.7641, -0.1741, 0.6278, 0.649), (3.6299, -0.1868, 0.9707, 0.6264),
        ])
        kind4.move_to([-4.4, -2, 0])
        kind4.set_z_index(4)

        # l4: double arrow
        l4 = DoubleArrow([-2, -2, 0], [5, -2, 0], buff=0, color="#FFFF00", tip_length=0.45, tip_shape_end=ArrowCircleFilledTip, tip_shape_start=StealthTip)
        l4.set_z_index(11)

        # title2: \text{Ends on a formula}
        title2 = MathTex(r"\text{Ends on a formula}", font_size=60, color="#5CD0B3")
        title2_g = _glyphs(title2, [
            (-5.0272, -0.0098, 0.8757, 0.9497), (-4.1529, -0.1755, 0.7221, 0.6182), (-3.375, -0.0072, 0.6997, 0.9856), (-2.7221, -0.1795, 0.4553, 0.6411),
            (-1.7479, -0.1788, 0.6187, 0.6397), (-1.0021, -0.1755, 0.7221, 0.6182), (0.0957, -0.1795, 0.6411, 0.6411), (1.0531, 0.0077, 0.4832, 0.9846),
            (1.551, -0.1788, 0.6187, 0.6397), (2.169, -0.1755, 0.4804, 0.6182), (3.0377, -0.1755, 1.1089, 0.6182), (4.0077, -0.1832, 0.7221, 0.6336),
            (4.5901, 0.0005, 0.331, 0.9702), (5.1446, -0.1795, 0.6411, 0.6411),
        ])
        title2.move_to([0, 3.3, 0])

        # letter_a: A
        letter_a = MathTex(r"A", font_size=144)
        letter_a_g = _glyphs(letter_a, [
            (0, 0, 0.9651, 1),
        ])
        letter_a.move_to([-4.4, 0, 0])
        letter_a.set_z_index(5)

        # letter_b: B
        letter_b = MathTex(r"B", font_size=144)
        letter_b_g = _glyphs(letter_b, [
            (0, 0, 1.0556, 1),
        ])
        letter_b.move_to([4.4, 0, 0])
        letter_b.set_z_index(6)

        # l5: arrow, built on letter_a and letter_b where its clip starts

        # l6: arrow, built on letter_a and letter_b where its clip starts

        # l7: arrow, built on letter_a and letter_b where its clip starts

        # title3: \text{Curves and moving ends}
        title3 = MathTex(r"\text{Curves and moving ends}", font_size=60, color="#5CD0B3")
        title3_g = _glyphs(title3, [
            (-5.4018, 0.1015, 0.6696, 0.7969), (-4.6943, -0.037, 0.5675, 0.498), (-4.1844, -0.0309, 0.3776, 0.4859), (-3.6756, -0.0434, 0.5368, 0.4852),
            (-3.1422, -0.034, 0.4248, 0.5038), (-2.6828, -0.034, 0.3578, 0.5038), (-1.9018, -0.034, 0.5038, 0.5038), (-1.331, -0.0309, 0.5675, 0.4859),
            (-0.7195, 0.1014, 0.5499, 0.7746), (0.3161, -0.0309, 0.8716, 0.4859), (1.0412, -0.0335, 0.4863, 0.5027), (1.6054, -0.0434, 0.5368, 0.4852),
            (2.0499, 0.0933, 0.2514, 0.7344), (2.5121, -0.0309, 0.5675, 0.4859), (3.0933, -0.1383, 0.5005, 0.7234), (3.8776, -0.034, 0.4248, 0.5038),
            (4.433, -0.0309, 0.5675, 0.4859), (5.0445, 0.1014, 0.5499, 0.7746), (5.5576, -0.034, 0.3578, 0.5038),
        ])
        title3.move_to([0, 3.3, 0])

        # letter_a3: A
        letter_a3 = MathTex(r"A", font_size=144)
        letter_a3_g = _glyphs(letter_a3, [
            (0, 0, 0.9651, 1),
        ])
        letter_a3.move_to([-5.2, -1.6, 0])
        letter_a3.set_z_index(5)

        # letter_b3: B
        letter_b3 = MathTex(r"B", font_size=144)
        letter_b3_g = _glyphs(letter_b3, [
            (0, 0, 1.0556, 1),
        ])
        letter_b3.move_to([5.2, -1.6, 0])
        letter_b3.set_z_index(6)

        # letter_c3: C
        letter_c3 = MathTex(r"C", font_size=144)
        letter_c3_g = _glyphs(letter_c3, [
            (0, 0, 0.9766, 1),
        ])
        letter_c3.move_to([0, 1.4, 0])
        letter_c3.set_z_index(7)

        # l8: arrow, built on letter_a3 and letter_b3 where its clip starts

        # l9: arrow
        l9 = _spline(Arrow([-5.505426, -3.060557, 0], [5.494574, -3.060557, 0], buff=0, color="#9A72AC", tip_length=0.4, tip_shape=ArrowCircleFilledTip), [((0.1, 0.05), (0.23, 0.045), (0.33, 0.045)), ((0.43, 0.045), (0.57, -0.045), (0.67, -0.045)), ((0.77, -0.045), (0.9, -0.05), (1, 0))])
        l9.set_z_index(9)

        title1_in = FadeIn(title1)
        # 0 s – 0.3 s: title1 fade_in
        self.play(_Part(title1_in, 0, 0.75), run_time=0.3)
        kind1_in = FadeIn(kind1)
        # 0.3 s – 0.4 s: title1 fade_in, kind1 fade_in
        self.play(_Part(title1_in, 0.75, 1), _Part(kind1_in, 0, 0.25), run_time=0.1)
        # 0.4 s – 0.7 s: kind1 fade_in
        self.play(_Part(kind1_in, 0.25, 1), run_time=0.3)
        # 0.7 s – 0.9 s
        self.wait(0.2)
        l1_in = Create(l1)
        # 0.9 s – 1.1 s: l1 create
        self.play(_Part(l1_in, 0, 0.25), run_time=0.2)
        # 1.1 s – 1.5 s: l1 create, kind2 fade_in
        self.play(_Part(l1_in, 0.25, 0.75), FadeIn(kind2), run_time=0.4)
        # 1.5 s – 1.7 s: l1 create
        self.play(_Part(l1_in, 0.75, 1), run_time=0.2)
        l2_in = Create(l2)
        # 1.7 s – 1.9 s: l2 create
        self.play(_Part(l2_in, 0, 0.25), run_time=0.2)
        # 1.9 s – 2.3 s: l2 create, kind3 fade_in
        self.play(_Part(l2_in, 0.25, 0.75), FadeIn(kind3), run_time=0.4)
        # 2.3 s – 2.5 s: l2 create
        self.play(_Part(l2_in, 0.75, 1), run_time=0.2)
        l3_in = GrowArrow(l3)
        # 2.5 s – 2.7 s: l3 grow_arrow
        self.play(_Part(l3_in, 0, 0.25), run_time=0.2)
        # 2.7 s – 3.1 s: l3 grow_arrow, kind4 fade_in
        self.play(_Part(l3_in, 0.25, 0.75), FadeIn(kind4), run_time=0.4)
        # 3.1 s – 3.3 s: l3 grow_arrow
        self.play(_Part(l3_in, 0.75, 1), run_time=0.2)
        # 3.3 s – 4.1 s: l4 grow_arrow
        self.play(GrowArrow(l4), run_time=0.8)
        # 4.1 s – 6.7 s
        self.wait(2.6)
        # 6.7 s – 7.2 s: l1 fade_out, l2 fade_out, l3 fade_out, l4 fade_out, kind1 fade_out, kind2 fade_out, kind3 fade_out, kind4 fade_out, title1 fade_out
        self.play(
            FadeOut(l1),
            FadeOut(l2),
            FadeOut(l3),
            FadeOut(l4),
            FadeOut(kind1),
            FadeOut(kind2),
            FadeOut(kind3),
            FadeOut(kind4),
            FadeOut(title1),
            run_time=0.5,
        )
        letter_a_in = FadeIn(letter_a)
        title2_in = FadeIn(title2)
        # 7.2 s – 7.5 s: letter_a fade_in, title2 fade_in
        self.play(_Part(letter_a_in, 0, 3 / 7), _Part(title2_in, 0, 0.75), run_time=0.3)
        letter_b_in = FadeIn(letter_b)
        # 7.5 s – 7.6 s: letter_a fade_in, title2 fade_in, letter_b fade_in
        self.play(
            _Part(letter_a_in, 3 / 7, 4 / 7),
            _Part(title2_in, 0.75, 1),
            _Part(letter_b_in, 0, 1 / 7),
            run_time=0.1,
        )
        # 7.6 s – 7.9 s: letter_a fade_in, letter_b fade_in
        self.play(_Part(letter_a_in, 4 / 7, 1), _Part(letter_b_in, 1 / 7, 4 / 7), run_time=0.3)
        # 7.9 s – 8.2 s: letter_b fade_in
        self.play(_Part(letter_b_in, 4 / 7, 1), run_time=0.3)
        # 8.2 s – 8.5 s
        self.wait(0.3)
        l5 = Arrow(letter_a.get_corner(UR), letter_b.get_corner(UL), path_arc=-50 * DEGREES, color="#83C167")
        l5.set_z_index(8)
        # 8.5 s – 9.3 s: l5 grow_arrow
        self.play(_TraceArrow(l5), run_time=0.8)
        l6 = Arrow(letter_a.get_right(), letter_b.get_left())
        l6.set_z_index(9)
        # 9.3 s – 10.1 s: l6 grow_arrow
        self.play(GrowArrow(l6), run_time=0.8)
        l7 = Arrow(letter_a.get_corner(DR), letter_b.get_corner(DL), path_arc=50 * DEGREES, color="#58C4DD")
        l7.set_z_index(10)
        # 10.1 s – 10.9 s: l7 grow_arrow
        self.play(_TraceArrow(l7), run_time=0.8)
        # 10.9 s – 13.9 s
        self.wait(3)
        # 13.9 s – 14.4 s: letter_a fade_out, l5 fade_out, l6 fade_out, l7 fade_out, letter_b fade_out, title2 fade_out
        self.play(
            FadeOut(letter_a),
            FadeOut(l5),
            FadeOut(l6),
            FadeOut(l7),
            FadeOut(letter_b),
            FadeOut(title2),
            run_time=0.5,
        )
        letter_a3_in = FadeIn(letter_a3)
        title3_in = FadeIn(title3)
        # 14.4 s – 14.7 s: letter_a3 fade_in, title3 fade_in
        self.play(_Part(letter_a3_in, 0, 3 / 7), _Part(title3_in, 0, 0.75), run_time=0.3)
        letter_b3_in = FadeIn(letter_b3)
        # 14.7 s – 14.8 s: letter_a3 fade_in, title3 fade_in, letter_b3 fade_in
        self.play(
            _Part(letter_a3_in, 3 / 7, 4 / 7),
            _Part(title3_in, 0.75, 1),
            _Part(letter_b3_in, 0, 1 / 7),
            run_time=0.1,
        )
        # 14.8 s – 15 s: letter_a3 fade_in, letter_b3 fade_in
        self.play(
            _Part(letter_a3_in, 4 / 7, 6 / 7),
            _Part(letter_b3_in, 1 / 7, 3 / 7),
            run_time=0.2,
        )
        letter_c3_in = FadeIn(letter_c3)
        # 15 s – 15.1 s: letter_a3 fade_in, letter_b3 fade_in, letter_c3 fade_in
        self.play(
            _Part(letter_a3_in, 6 / 7, 1),
            _Part(letter_b3_in, 3 / 7, 4 / 7),
            _Part(letter_c3_in, 0, 1 / 7),
            run_time=0.1,
        )
        # 15.1 s – 15.4 s: letter_b3 fade_in, letter_c3 fade_in
        self.play(_Part(letter_b3_in, 4 / 7, 1), _Part(letter_c3_in, 1 / 7, 4 / 7), run_time=0.3)
        # 15.4 s – 15.7 s: letter_c3 fade_in
        self.play(_Part(letter_c3_in, 4 / 7, 1), run_time=0.3)
        # 15.7 s – 15.9 s
        self.wait(0.2)
        l8 = Arrow(letter_a3.get_corner(UR), letter_b3.get_corner(UL), path_arc=-35 * DEGREES, color="#FF862F", tip_shape=StealthTip)
        l8.set_z_index(8)
        # 15.9 s – 17.1 s: l8 grow_arrow
        self.play(_TraceArrow(l8), run_time=1.2)
        # 17.1 s – 18.6 s
        self.wait(1.5)
        l8_to = Arrow(letter_a3.get_corner(UR), letter_c3.get_corner(DL), path_arc=-35 * DEGREES, color="#FF862F", tip_shape=StealthTip)
        # 18.6 s – 20 s: l8 tween
        self.play(Transform(l8, l8_to), run_time=1.4)
        # 20 s – 20.6 s
        self.wait(0.6)
        # 20.6 s – 22 s: l9 grow_arrow
        self.play(_TraceArrow(l9), run_time=1.4)
        # 22 s – 22.5 s
        self.wait(0.5)
        # 22.5 s – 23 s: letter_a3 fade_out, letter_b3 fade_out, letter_c3 fade_out, l8 fade_out, title3 fade_out, l9 fade_out
        self.play(
            FadeOut(letter_a3),
            FadeOut(letter_b3),
            FadeOut(letter_c3),
            FadeOut(l8),
            FadeOut(title3),
            FadeOut(l9),
            run_time=0.5,
        )
