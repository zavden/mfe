# Tween outline — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 120 frames, like the editor's video export.
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

        # ab: ab
        ab = MathTex(r"ab")
        ab.scale(2).move_to([-3, 1.5, 0])
        ab.set_z_index(3)

        # cd: cd
        cd = MathTex(r"cd")
        cd.scale(2).move_to([3, 1.5, 0])
        cd.set_z_index(2)

        # ef: ef
        ef = MathTex(r"ef")
        ef.scale(2).move_to([-3, -1.5, 0])
        ef.set_z_index(1)

        # ghi: ghi
        ghi = MathTex(r"ghi")
        ghi.scale(2).move_to([3, -1.5, 0])

        self.add(ab)
        self.add(cd)
        self.add(ef)
        self.add(ghi)
        # 0 s – 0.5 s
        self.wait(0.5)
        cd_move = _Tween(cd[0], (3, 1.5, 2, 0, 1, 1), (3, 1.5, 2, -30, 1, 1), opacity=(1, 0.5), stroke=(1, 0.5))
        ef_move = _Tween(ef[0], (-3, -1.5, 2, 0, 1, 1), (-3, -1.5, 2, 45, 1, 1), colors=[("#FFFFFF", "#FC6255"), ("#FFFFFF", "#FC6255")])
        ghi_pivot = ghi[0][:2].get_center()
        ghi_part = _Tween(VGroup(ghi[0][0], ghi[0][1]), (ghi_pivot[0], ghi_pivot[1], 1, 0, 1, 1), (ghi_pivot[0], ghi_pivot[1], 1, 90, 1, 1), opacity=(1, 0.5), stroke=(1, 0.5))
        # 0.5 s – 1 s: ab tween, cd tween, ef tween, ghi part
        self.play(
            ab.animate.set_opacity(0.4),
            _Part(cd_move, 0, 5 / 6),
            _Part(ef_move, 0, 5 / 6),
            _Part(ghi_part, 0, 5 / 6),
            run_time=0.5,
        )
        # 1 s – 1.1 s: cd tween, ef tween, ghi part
        self.play(
            _Part(cd_move, 5 / 6, 1),
            _Part(ef_move, 5 / 6, 1),
            _Part(ghi_part, 5 / 6, 1),
            run_time=0.1,
        )
        # 1.1 s – 1.2 s
        self.wait(0.1)
        ab_move = _Tween(ab[0], (-3, 1.5, 2, 0, 1, 1), (-3, 1.5, 2, 30, 1, 1), opacity=(0.4, 1), stroke=(0.4, 1))
        # 1.2 s – 1.4 s: ab tween
        self.play(_Part(ab_move, 0, 1 / 3), run_time=0.2)
        ghi_disappear = _Unwrite(ghi[0][:2])
        # 1.4 s – 1.8 s: ab tween, ghi unwrite
        self.play(_Part(ab_move, 1 / 3, 1), _Part(ghi_disappear, 0, 0.5), run_time=0.4)
        # 1.8 s – 2.2 s: ghi unwrite
        self.play(_Part(ghi_disappear, 0.5, 1), run_time=0.4)
        # 2.2 s – 2.4 s
        self.wait(0.2)
        ghi_appear = Write(ghi[0][:2])
        # 2.4 s – 3 s: ghi write
        self.play(_Part(ghi_appear, 0, 0.75), run_time=0.6)
        ab_out = Unwrite(VGroup(*ab[0]))
        cd_out = Unwrite(VGroup(*cd[0]))
        ef_out = Uncreate(ef)
        # 3 s – 3.2 s: ghi write, ab unwrite, cd unwrite, ef uncreate
        self.play(
            _Part(ghi_appear, 0.75, 1),
            _Part(ab_out, 0, 0.2),
            _Part(cd_out, 0, 0.2),
            _Part(ef_out, 0, 0.2),
            run_time=0.2,
        )
        # 3.2 s – 3.5 s: ab unwrite, cd unwrite, ef uncreate
        self.play(
            _Part(ab_out, 0.2, 0.5),
            _Part(cd_out, 0.2, 0.5),
            _Part(ef_out, 0.2, 0.5),
            run_time=0.3,
        )
        # 3.5 s – 4 s: ab unwrite, cd unwrite, ef uncreate, ghi fade_out
        self.play(
            _Part(ab_out, 0.5, 1),
            _Part(cd_out, 0.5, 1),
            _Part(ef_out, 0.5, 1),
            FadeOut(ghi),
            run_time=0.5,
        )
