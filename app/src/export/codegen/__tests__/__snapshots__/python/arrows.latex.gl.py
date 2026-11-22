# Arrows — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 294 frames, like the editor's video export.
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


def _pose(start, end, t):
    """Matrix and centre of a formula placement blended from `start` to `end` at t, as
    the editor does it: position, scale and flips linearly (a flip passes through zero),
    the rotation as a true rotation. A placement is (x, y, scale, degrees, sx, sy) with
    sx, sy = -1 for a flipped axis."""
    x, y, s, deg, sx, sy = (a + (b - a) * t for a, b in zip(start, end))
    c, si = np.cos(deg * DEGREES), np.sin(deg * DEGREES)
    return np.array([[c, -si], [si, c]]) @ np.diag([s * sx, s * sy]), np.array([x, y, 0.0])


def _mix(a, b, t):
    """Blend two '#RRGGBB' colours component-wise in RGB, as a Transform does."""
    a, b = (np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)]) for c in (a, b))
    return "#%02X%02X%02X" % tuple(int(v) for v in np.round(a + (b - a) * t))


class _Tween(Animation):
    """Moves `glyphs` from one placement of their formula to another (see _pose): the
    rotation turns about the formula centre instead of cutting across. The submobjects of
    `glyphs` are the glyphs; `colors` holds a (from, to) pair or None for each of them, in
    that order, `opacity` a (from, to) pair of fill opacities, one such pair per glyph, or
    None, and `stroke` a (from, to) pair of stroke opacities (a stroked shape) or None."""

    def __init__(self, glyphs, start, end, colors=None, opacity=None, stroke=None, **kwargs):
        super().__init__(glyphs, **kwargs)
        self.start, self.end, self.colors = start, end, colors
        self.opacity, self.stroke = opacity, stroke

    def begin(self):
        self.glyphs = list(self.mobject.submobjects)
        self.origins = [g.copy() for g in self.glyphs]
        matrix, centre = _pose(self.start, self.start, 0)
        self.inverse, self.centre = np.linalg.inv(matrix), centre
        super().begin()

    def interpolate_mobject(self, alpha):
        t = self.rate_func(min(max(alpha, 0), 1))
        matrix, centre = _pose(self.start, self.end, t)
        for i, (glyph, origin) in enumerate(zip(self.glyphs, self.origins)):
            glyph.match_points(origin)
            glyph.apply_matrix(matrix @ self.inverse, about_point=self.centre)
            glyph.shift(centre - self.centre)
            pair = self.colors[i] if self.colors else None
            fill = _mix(*pair, t) if pair else None
            fade = self.opacity[i] if isinstance(self.opacity, list) else self.opacity
            o = fade[0] + (fade[1] - fade[0]) * t if fade else None
            if fill or o is not None:
                glyph.set_fill(fill, o)
            if self.stroke:
                glyph.set_stroke(fill, opacity=self.stroke[0] + (self.stroke[1] - self.stroke[0]) * t)


def _arrow(line, tip=0.35, end="triangle", start=None):
    """Put a tip `tip` long at the end of a line, and one at its start when `start` names
    its shape, as ManimCE's Arrow and DoubleArrow put theirs: each with its point on the end of
    the line and along the line there, the line then running between their bases. The shapes:
    "triangle", "stealth" (ManimCE's StealthTip) and "dot"."""
    if tip <= 0:
        return line

    def make(shape, at_start=False):
        if shape == "dot":  # ManimGL makes its dot half as wide as it is asked
            return line.create_tip(at_start, length=2 * tip, tip_style=2)
        mob = line.create_tip(at_start, length=tip, width=tip)
        if shape == "stealth":
            corners = [[2, 0, 0], [-1.2, 1.6, 0], [0, 0, 0], [-1.2, -1.6, 0], [2, 0, 0]]
            mob.set_points_as_corners(tip / 3.2 * np.array(corners))
            mob.set_stroke(width=3.0)
            line.position_tip(mob, at_start)
        return mob

    first, last = line.get_start(), line.get_end()
    front = make(end)
    line.put_start_and_end_on(first, front.get_base())
    tips = [front]
    if start:
        # ManimCE makes the second tip on the line the first one has shortened, and turns
        # the first one with the line when the second shortens it.
        back = make(start, True)
        turn = angle_of_vector(last - back.get_base()) - angle_of_vector(last - first)
        front.rotate(turn, about_point=last)
        line.put_start_and_end_on(back.get_base(), front.get_base())
        line.start_tip = back
        tips.append(back)
    line.tip = front
    for mob in tips:
        mob.set_color(line.get_stroke_color())
        line.add(mob)
    return line


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


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # poly: x^2+bx+c
        poly = Tex(r"x^2+bx+c")
        poly[3].set_color("#FFFF00")
        poly.move_to([-3.5, 1.5, 0])
        poly.set_z_index(2)

        # slope: y=mx
        slope = Tex(r"y=mx", font_size=60)
        slope.set_color("#58C4DD")
        slope.move_to([3, -0.5, 0])
        slope.set_z_index(1)

        # free: line
        free = Line([-5.75, -1.125, 0], [-3.25, -1.875, 0], color="#FFFFFF", stroke_width=8)
        free.set_z_index(7)

        # short: arrow
        short = Line([5.2, -3.15, 0], [5.8, -2.85, 0], stroke_width=3.354102, color="#FFFFFF").add_tip(length=0.167705, width=0.167705)
        short.set_z_index(6)

        # tiny: double arrow
        tiny = _arrow(Line([4.25, -3.25, 0], [4.75, -3.25, 0], stroke_width=1.25, color="#FFFF00"), tip=0.125, start="triangle")
        tiny.set_opacity(0.5)
        tiny.set_z_index(3)

        # twice: dashed
        twice = DashedLine([-1.249244, -1.249748, 0], [0.250756, -0.749748, 0], color="#FFFFFF")
        twice.set_z_index(5)

        # both: double arrow, built on poly and slope where its clip starts

        # dashes: dashed, built on slope where its clip starts

        # points: arrow, built on poly and slope where its clip starts

        # under: line, built on poly and poly where its clip starts

        # ahead: arrow, built on late where its clip starts

        # late: z
        late = Tex(r"z", font_size=72)
        late.move_to([0, -3, 0])

        # twice: dashed
        twice_2 = DashedLine([-1.249244, -2.249748, 0], [0.250756, -1.749748, 0], color="#FFFFFF")
        twice_2.set_z_index(1)

        poly_in = Write(poly, stroke_color="#FFFFFF")
        slope_in = FadeIn(slope)
        # 0 s – 0.3 s: poly write, slope fade_in
        self.play(_Part(poly_in, 0, 0.375), _Part(slope_in, 0, 0.6), run_time=0.3)
        free_in = Write(free, stroke_color="#FFFFFF")
        # 0.3 s – 0.5 s: poly write, slope fade_in, free write
        self.play(
            _Part(poly_in, 0.375, 0.625),
            _Part(slope_in, 0.6, 1),
            _Part(free_in, 0, 0.4),
            run_time=0.2,
        )
        self.add(short)
        self.add(twice)
        tiny_in = ShowCreation(tiny)
        # 0.5 s – 0.8 s: poly write, free write, tiny create
        self.play(
            _Part(poly_in, 0.625, 1),
            _Part(free_in, 0.4, 1),
            _Part(tiny_in, 0, 0.6),
            run_time=0.3,
        )
        # 0.8 s – 1 s: tiny create
        self.play(_Part(tiny_in, 0.6, 1), run_time=0.2)
        both = _arrow(Line(poly[6], slope[0], buff=0.25, stroke_width=6, color="#83C167"), tip=0.35, start="triangle")
        both.set_z_index(9)
        both_in = FadeIn(both)
        # 1 s – 1.3 s: both fade_in
        self.play(_Part(both_in, 0, 0.6), run_time=0.3)
        free_move = free.animate.move_to([-4, -2.25, 0]).set_opacity(0.4).build()
        # 1.3 s – 1.5 s: both fade_in, free tween
        self.play(_Part(both_in, 0.6, 1), _Part(free_move, 0, 0.2), run_time=0.2)
        dashes = DashedLine([5.5, 3, 0], slope.get_corner(UR), buff=0.1, dash_length=0.1, color="#FFFF00")
        dashes.set_z_index(8)
        dashes_in = ShowCreation(dashes)
        # 1.5 s – 2 s: free tween, dashes create
        self.play(_Part(free_move, 0.2, 0.7), _Part(dashes_in, 0, 0.5), run_time=0.5)
        poly_move = _Tween(poly, (-3.5, 1.5, 1, 0, 1, 1), (-3, 2.25, 1.2, 15, 1, 1))
        # 2 s – 2.3 s: free tween, dashes create, poly tween
        self.play(
            _Part(free_move, 0.7, 1),
            _Part(dashes_in, 0.5, 0.8),
            _Part(poly_move, 0, 0.3),
            run_time=0.3,
        )
        # 2.3 s – 2.5 s: dashes create, poly tween
        self.play(_Part(dashes_in, 0.8, 1), _Part(poly_move, 0.3, 0.5), run_time=0.2)
        # 2.5 s – 2.8 s: poly tween
        self.play(_Part(poly_move, 0.5, 0.8), run_time=0.3)
        both_out = FadeOut(both)
        # 2.8 s – 3 s: poly tween, both fade_out
        self.play(_Part(poly_move, 0.8, 1), _Part(both_out, 0, 0.4), run_time=0.2)
        # 3 s – 3.3 s: both fade_out
        self.play(_Part(both_out, 0.4, 1), run_time=0.3)
        # 3.3 s – 3.5 s
        self.wait(0.2)
        points = Line(poly[:2], slope, buff=0.25, stroke_width=6, color="#FFFFFF").add_tip(length=0.35, width=0.35)
        points.set_z_index(9)
        points_in = ShowCreation(points)
        # 3.5 s – 4 s: free unwrite, points create
        self.play(_Unwrite(free, stroke_color="#FFFFFF"), _Part(points_in, 0, 0.625), run_time=0.5)
        under = Line(poly[2].get_corner(DL), poly[5].get_bottom(), buff=0.05, color="#58C4DD", stroke_width=2)
        under.set_z_index(4)
        self.add(under)
        # 4 s – 4.3 s: points create
        self.play(_Part(points_in, 0.625, 1), run_time=0.3)
        ahead = Line([-5, -3, 0], late.get_left(), buff=0.3, stroke_width=6, color="#58C4DD").add_tip(length=0.25, width=0.25)
        ahead.set_z_index(7)
        # 4.3 s – 4.8 s: ahead write
        self.play(Write(ahead, stroke_color="#58C4DD"), run_time=0.5)
        # 4.8 s – 5 s
        self.wait(0.2)
        # 5 s – 5.5 s: late fade_in
        self.play(FadeIn(late), run_time=0.5)
        # 5.5 s – 6.5 s: points tween
        self.play(points.animate.move_to([0.5, 2.5, 0]).set_color("#FFFF00"), run_time=1)
        # 6.5 s – 7.2 s
        self.wait(0.7)
        # 7.2 s – 8 s: dashes uncreate
        self.play(Uncreate(dashes), run_time=0.8)
        # 8 s – 9 s
        self.wait(1)
        self.remove(poly)
        self.remove(slope)
        self.remove(late)
        self.remove(points)
        self.remove(under)
        self.remove(ahead)
        self.remove(short)
        self.remove(tiny)
        self.remove(twice)
        self.add(twice_2)
        # 9 s – 9.8 s
        self.wait(0.8)
