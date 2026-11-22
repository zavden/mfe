# Shape paints — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 240 frames, like the editor's video export.
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
    None, and `stroke` a (from, to) pair of stroke opacities, one pair per glyph, or None.
    `width` is a (from, to) pair of stroke widths or None, and `fills` a (from, to) pair of
    colours for the fill when it is not the stroke's, or None."""

    def __init__(self, glyphs, start, end, colors=None, opacity=None, stroke=None, width=None, fills=None, **kwargs):
        super().__init__(glyphs, **kwargs)
        self.start, self.end, self.colors = start, end, colors
        self.opacity, self.stroke = opacity, stroke
        self.width, self.fills = width, fills

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
            inside = _mix(*self.fills, t) if self.fills else fill
            if inside or o is not None:
                glyph.set_fill(inside, o)
            stroke = self.stroke[i] if isinstance(self.stroke, list) else self.stroke
            s = stroke[0] + (stroke[1] - stroke[0]) * t if stroke else None
            w = self.width[0] + (self.width[1] - self.width[0]) * t if self.width else None
            if fill or s is not None or w is not None:
                glyph.set_stroke(fill, width=w, opacity=s)


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # poly: x^2+bx+c
        poly = Tex(r"x^2+bx+c")
        poly_g = _glyphs(poly, [
            (-2.625, 0, 0.6875, 1), (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1),
            (0.875, 0, 0.6875, 1), (1.75, 0, 0.6875, 1), (2.625, 0, 0.6875, 1),
        ])
        poly.move_to([0, 2.4, 0])
        poly.set_z_index(6)

        # disc: circle
        disc = Circle(radius=0.7, stroke_color="#FC6255", fill_color="#FC6255", fill_opacity=0.5).set_fill("#FFFF00")
        disc.move_to([3.5, 0, 0])
        disc.set_z_index(4)

        # ring: circle
        ring = Circle(radius=0.6, stroke_color="#FFFF00").set_fill("#FFFF00")
        ring.move_to([-4.5, -2, 0])
        ring.set_z_index(3)

        # tile: box
        tile = Rectangle(width=1.6, height=1, color="#83C167", stroke_width=6, fill_opacity=0.4, stroke_opacity=0.8).set_fill("#FC6255")
        tile.move_to([0, -2.4, 0])

        # box: box, built on poly where its clip starts

        # line: underline, built on poly where its clip starts

        # cross: cross, built on poly where its clip starts

        poly_in = Write(VGroup(*poly_g[:]), stroke_color="#FFFFFF")
        # 0 s – 0.5 s: poly write
        self.play(_Part(poly_in, 0, 0.5), run_time=0.5)
        self.add(disc)
        self.add(ring)
        tile_in = DrawBorderThenFill(tile)
        # 0.5 s – 1 s: poly write, tile draw_border_then_fill
        self.play(_Part(poly_in, 0.5, 1), _Part(tile_in, 0, 0.5), run_time=0.5)
        # 1 s – 1.5 s: tile draw_border_then_fill
        self.play(_Part(tile_in, 0.5, 1), run_time=0.5)
        box = SurroundingRectangle(VGroup(*poly_g[3:6]), buff=0.15, color="#FFFF00").round_corners(0.15).set_fill("#FFFF00")
        box.set_z_index(5)
        line = Underline(poly, buff=0.2, stroke_color="#58C4DD", stroke_width=4, stretch_factor=1)
        line.set_z_index(2)
        cross = Cross(VGroup(poly_g[5], poly_g[6]), stroke_color="#FC6255", stroke_width=6)
        cross.set_z_index(1)
        self.add(box)
        self.add(line)
        self.add(cross)
        disc_move = _Tween(VGroup(disc), (3.5, 0, 1, 0, 1, 1), (3.5, 0, 1.5, 90, 1, 1), colors=[("#FC6255", "#58C4DD")], width=(4, 10), fills=("#FFFF00", "#83C167"), rate_func=linear)
        ring_move = ring.animate(rate_func=linear).set_fill(opacity=0.7).build()
        # 1.5 s – 2 s: disc tween, ring tween
        self.play(_Part(disc_move, 0, 1 / 3), _Part(ring_move, 0, 0.5), run_time=0.5)
        box_move = box.animate(rate_func=linear).scale(1.2).move_to([-3, 0.6, 0]).set_fill(color="#58C4DD", opacity=0.6).set_stroke(width=8, opacity=0.5).build()
        # 2 s – 2.5 s: disc tween, ring tween, box tween
        self.play(
            _Part(disc_move, 1 / 3, 2 / 3),
            _Part(ring_move, 0.5, 1),
            _Part(box_move, 0, 0.5),
            run_time=0.5,
        )
        line_move = line.animate(rate_func=linear).set_stroke(width=10, opacity=0.5).build()
        # 2.5 s – 3 s: disc tween, box tween, line tween
        self.play(
            _Part(disc_move, 2 / 3, 1),
            _Part(box_move, 0.5, 1),
            _Part(line_move, 0, 0.5),
            run_time=0.5,
        )
        ring_move_2 = ring.animate(rate_func=linear).set_color("#FC6255").build()
        cross_move = _Tween(cross, (0.7, 2.4, 1, 0, 1, 1), (0.7, 2.4, 1, 30, 1, 1), colors=[("#FC6255", "#FFFF00"), ("#FC6255", "#FFFF00")], width=(6, 2), rate_func=linear)
        # 3 s – 3.5 s: line tween, ring tween, cross tween
        self.play(
            _Part(line_move, 0.5, 1),
            _Part(ring_move_2, 0, 0.5),
            _Part(cross_move, 0, 0.5),
            run_time=0.5,
        )
        box_move_2 = box.animate.set_fill(opacity=0.2).set_stroke(color="#83C167").build()
        disc_move_2 = _Tween(VGroup(disc), (3.5, 0, 1.5, 90, 1, 1), (3.5, 0, 1.5, 180, 1, 1), opacity=(0.5, 0.6), stroke=(1, 0.18))
        # 3.5 s – 4 s: ring tween, cross tween, box tween, disc tween
        self.play(
            _Part(ring_move_2, 0.5, 1),
            _Part(cross_move, 0.5, 1),
            _Part(box_move_2, 0, 0.5),
            _Part(disc_move_2, 0, 0.5),
            run_time=0.5,
        )
        # 4 s – 4.5 s: box tween, disc tween
        self.play(_Part(box_move_2, 0.5, 1), _Part(disc_move_2, 0.5, 1), run_time=0.5)
        ring_move_3 = ring.animate(rate_func=there_and_back).set_fill(color="#58C4DD").set_stroke(width=12).build()
        # 4.5 s – 5 s: ring tween
        self.play(_Part(ring_move_3, 0, 1 / 3), run_time=0.5)
        # 5 s – 6 s: ring tween, box tween
        self.play(
            _Part(ring_move_3, 1 / 3, 1),
            box.animate.set_fill(opacity=0.08).set_stroke(width=2, opacity=0.2),
            run_time=1,
        )
        # 6 s – 7.5 s
        self.wait(1.5)
        # 7.5 s – 8 s: tile fade_out
        self.play(FadeOut(tile), run_time=0.5)
