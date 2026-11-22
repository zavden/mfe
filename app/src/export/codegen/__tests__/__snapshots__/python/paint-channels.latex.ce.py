# Paint channels — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 960×540, 30 fps:
#     manim -r 960,540 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
from manim import *


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
    None, and `stroke` a (from, to) pair of stroke opacities, one pair per glyph, or None."""

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
            stroke = self.stroke[i] if isinstance(self.stroke, list) else self.stroke
            s = stroke[0] + (stroke[1] - stroke[0]) * t if stroke else None
            if fill or s is not None:
                glyph.set_stroke(fill, opacity=s)


class _Unwrite(Write):
    """Unwrite (with its rate function) that gives the glyphs back their shape once they
    are off screen, so that they can come back later."""

    def __init__(self, vmobject, **kwargs):
        super().__init__(vmobject, reverse=True, reverse_rate_function=True, remover=True, **kwargs)

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        # Write(reverse=True) puts the group back in order when it finishes, but its starting
        # copy is still reversed: reverse the group around the restoring interpolate.
        self.reverse_submobjects()
        self.interpolate(0)
        self.reverse_submobjects()


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # hollow: box
        hollow = Rectangle(width=1.4, height=0.8, color="#FC6255")
        hollow.move_to([-4.5, 1.5, 0])
        hollow.set_z_index(7)

        # future: box
        future = Rectangle(width=1.4, height=0.8, color="#58C4DD", fill_opacity=0.35, stroke_opacity=0.7)
        future.move_to([-1.5, 1.5, 0])
        future.set_z_index(6)

        # turn: box
        turn = Rectangle(width=1.4, height=0.8, color="#FC6255")
        turn.move_to([1.5, 1.5, 0])
        turn.set_z_index(5)

        # part: box
        part = Rectangle(width=1.4, height=0.8, color="#FC6255", fill_opacity=0.3, stroke_opacity=0.7)
        part.move_to([4.5, 1.5, 0])
        part.set_z_index(4)

        # lines: cross
        lines = Cross(Rectangle(width=1.4, height=0.8), stroke_color="#58C4DD")
        lines.move_to([-4.5, -1.5, 0])
        lines.set_z_index(3)

        # erase: cross
        erase = Cross(Rectangle(width=1.4, height=0.8), stroke_color="#58C4DD")
        erase.move_to([-1.5, -1.5, 0])
        erase.set_z_index(2)

        # returning: cross
        returning = Cross(Rectangle(width=1.4, height=0.8), stroke_color="#58C4DD")
        returning.move_to([1.5, -1.5, 0])
        returning.set_z_index(1)

        # Circle: circle
        Circle_ = Circle(radius=0.4, stroke_color="#FC6255")
        Circle_.move_to([4.5, -1.5, 0])

        self.add(hollow)
        self.add(turn)
        self.add(part)
        self.add(lines)
        self.add(erase)
        self.add(returning)
        # 0 s – 0.5 s
        self.wait(0.5)
        future.set_fill(opacity=0.175).set_stroke(opacity=0.35)
        turn_move = _Tween(VGroup(turn), (1.5, 1.5, 1, 0, 1, 1), (1.5, 1.5, 1, 90, 1, 1), colors=[("#FC6255", "#83C167")], rate_func=linear)
        part_pivot = part.get_center()
        part_part = _Tween(VGroup(part), (part_pivot[0], part_pivot[1], 1, 0, 1, 1), (part_pivot[0], part_pivot[1], 1, 90, 1, 1), colors=[("#FC6255", "#83C167")], rate_func=linear)
        # 0.5 s – 1 s: future tween, turn tween, hollow part, part part, lines part
        self.play(
            _Part(turn_move, 0, 0.5),
            hollow.animate(rate_func=linear).set_stroke(opacity=0.2),
            _Part(part_part, 0, 0.5),
            lines[0].animate(rate_func=linear).set_stroke(opacity=0.2),
            run_time=0.5,
        )
        # 1 s – 1.5 s: turn tween, part part
        self.play(_Part(turn_move, 0.5, 1), _Part(part_part, 0.5, 1), run_time=0.5)
        hollow.set_stroke(opacity=1)
        lines_pivot = lines[:].get_center()
        lines_part = _Tween(VGroup(lines[0], lines[1]), (lines_pivot[0], lines_pivot[1], 1, 0, 1, 1), (lines_pivot[0], lines_pivot[1], 1, 90, 1, 1), stroke=[(0.2, 0.6), (1, 0.6)], rate_func=there_and_back)
        # 1.5 s – 2 s: hollow tween, lines part
        self.play(
            hollow.animate(rate_func=linear).set_stroke(opacity=0.5),
            _Part(lines_part, 0, 0.5),
            run_time=0.5,
        )
        # 2 s – 2.5 s: lines part, future fade_in
        self.play(_Part(lines_part, 0.5, 1), FadeIn(future, rate_func=linear), run_time=0.5)
        erase_out = Unwrite(VGroup(*erase))
        returning_disappear = _Unwrite(VGroup(*returning))
        # 2.5 s – 3 s: erase unwrite, returning unwrite
        self.play(_Part(erase_out, 0, 0.5), _Part(returning_disappear, 0, 0.5), run_time=0.5)
        self.add(Circle_)
        # 3 s – 3.5 s: erase unwrite, returning unwrite
        self.play(_Part(erase_out, 0.5, 1), _Part(returning_disappear, 0.5, 1), run_time=0.5)
        # 3.5 s – 4 s
        self.wait(0.5)
        # 4 s – 4.5 s: returning fade_in
        self.play(FadeIn(returning, rate_func=linear), run_time=0.5)
        # 4.5 s – 5 s
        self.wait(0.5)
