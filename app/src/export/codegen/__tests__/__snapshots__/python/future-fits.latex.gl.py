# Future fits — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 180 frames, like the editor's video export.
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


def _circle_around(mobject, buff=0.1, color=WHITE, **kwargs):
    """A circle through the corners of the mobject's box, `buff` further out, centred on it."""
    radius = np.hypot(mobject.get_width(), mobject.get_height()) / 2 + buff
    return Circle(radius=radius, stroke_color=color, fill_color=color, **kwargs).move_to(mobject)


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # poly: x^2+bx+c
        poly = Tex(r"x^2+bx+c")
        poly.move_to([-2.5, 1.5, 0])
        poly.set_z_index(10)

        # first: box
        first = Rectangle(width=1, height=0.6, color="#FFFF00")
        first.move_to([-5, -2.5, 0])
        first.set_z_index(5)

        # second: circle
        second = Circle(radius=0.5, stroke_color="#FC6255")
        second.move_to([5, 2.5, 0])
        second.set_z_index(4)

        # third: box
        third = Rectangle(width=1, height=0.6, color="#FFFF00")
        third.move_to([-5, 2.5, 0])
        third.set_z_index(3)

        # fourth: circle
        fourth = Circle(radius=0.5, stroke_color="#FC6255")
        fourth.move_to([5, -2.5, 0])
        fourth.set_z_index(2)

        # fifth: box
        fifth = Rectangle(width=1, height=0.6, color="#FFFF00")
        fifth.move_to([0, -3, 0])
        fifth.set_z_index(1)

        # sixth: circle
        sixth = Circle(radius=0.5, stroke_color="#FC6255")
        sixth.move_to([0, 3, 0])

        # late: box, built on poly where its clip starts
        late = Rectangle(width=0.9, height=0.72, color="#83C167")
        late.move_to([0.3, 0.5, 0])
        late.set_z_index(9)

        # note: y=2
        note = Tex(r"y=2")
        note.set_color("#58C4DD")
        note.scale(0.8).move_to([1.28, 1.26439, 0]).rotate(-15 * DEGREES)
        note.set_z_index(8)

        # under: brace, built on poly where its clip starts
        under = Brace(Line(ORIGIN, 1.9 * RIGHT), DOWN, buff=0)
        under.set_color("#FC6255")
        under.move_to([1, 0.007633, 0])
        under.set_z_index(7)

        # total: s
        total = Tex(r"s")
        total.move_to([0.994564, -0.384734, 0])
        total.set_z_index(6)

        self.add(poly)
        self.add(first)
        self.add(second)
        self.add(third)
        self.add(fourth)
        self.add(fifth)
        self.add(sixth)
        # 0 s – 1 s
        self.wait(1)
        first_to = SurroundingRectangle(late, buff=0.1, color="#FFFF00")
        first_move = Transform(first, first_to, rate_func=linear)
        # 1 s – 1.2 s: first tween
        self.play(_Part(first_move, 0, 0.2), run_time=0.2)
        second_to = _circle_around(note[:2], buff=0.1, color="#FC6255")
        second_move = Transform(second, second_to, rate_func=linear)
        # 1.2 s – 1.4 s: first tween, second tween
        self.play(_Part(first_move, 0.2, 0.4), _Part(second_move, 0, 0.2), run_time=0.2)
        third_to = SurroundingRectangle(under, buff=0.1, color="#FFFF00")
        third_move = Transform(third, third_to, rate_func=linear)
        # 1.4 s – 1.6 s: first tween, second tween, third tween
        self.play(
            _Part(first_move, 0.4, 0.6),
            _Part(second_move, 0.2, 0.4),
            _Part(third_move, 0, 0.2),
            run_time=0.2,
        )
        fourth_to = _circle_around(total, buff=0.1, color="#FC6255")
        fourth_move = Transform(fourth, fourth_to, rate_func=linear)
        # 1.6 s – 1.8 s: first tween, second tween, third tween, fourth tween
        self.play(
            _Part(first_move, 0.6, 0.8),
            _Part(second_move, 0.4, 0.6),
            _Part(third_move, 0.2, 0.4),
            _Part(fourth_move, 0, 0.2),
            run_time=0.2,
        )
        fifth_to = SurroundingRectangle(VGroup(late, note[2]), buff=0.1, color="#FFFF00")
        fifth_move = Transform(fifth, fifth_to, rate_func=linear)
        # 1.8 s – 2 s: first tween, second tween, third tween, fourth tween, fifth tween
        self.play(
            _Part(first_move, 0.8, 1),
            _Part(second_move, 0.6, 0.8),
            _Part(third_move, 0.4, 0.6),
            _Part(fourth_move, 0.2, 0.4),
            _Part(fifth_move, 0, 0.2),
            run_time=0.2,
        )
        poly_move = poly.animate.move_to([1, 0.5, 0]).build()
        # 2 s – 2.2 s: second tween, third tween, fourth tween, fifth tween, poly tween
        self.play(
            _Part(second_move, 0.8, 1),
            _Part(third_move, 0.6, 0.8),
            _Part(fourth_move, 0.4, 0.6),
            _Part(fifth_move, 0.2, 0.4),
            _Part(poly_move, 0, 0.2),
            run_time=0.2,
        )
        # 2.2 s – 2.4 s: third tween, fourth tween, fifth tween, poly tween
        self.play(
            _Part(third_move, 0.8, 1),
            _Part(fourth_move, 0.6, 0.8),
            _Part(fifth_move, 0.4, 0.6),
            _Part(poly_move, 0.2, 0.4),
            run_time=0.2,
        )
        # 2.4 s – 2.6 s: fourth tween, fifth tween, poly tween
        self.play(
            _Part(fourth_move, 0.8, 1),
            _Part(fifth_move, 0.6, 0.8),
            _Part(poly_move, 0.4, 0.6),
            run_time=0.2,
        )
        # 2.6 s – 2.8 s: fifth tween, poly tween
        self.play(_Part(fifth_move, 0.8, 1), _Part(poly_move, 0.6, 0.8), run_time=0.2)
        # 2.8 s – 3 s: poly tween
        self.play(_Part(poly_move, 0.8, 1), run_time=0.2)
        late = SurroundingRectangle(poly[:2], buff=0.2, color="#83C167")
        late.set_z_index(9)
        note.next_to(poly[3:6], UP, buff=0.4)
        self.add(late)
        self.add(note)
        sixth_to = _circle_around(note, buff=0.1, color="#FC6255")
        # 3 s – 4 s: sixth tween
        self.play(Transform(sixth, sixth_to, rate_func=linear), run_time=1)
        under = Brace(poly, DOWN, buff=0.2)
        under.set_color("#FC6255")
        under.set_z_index(7)
        self.add(under)
        # 4 s – 4.5 s
        self.wait(0.5)
        under.put_at_tip(total, buff=0.1)
        self.add(total)
        # 4.5 s – 6 s
        self.wait(1.5)
