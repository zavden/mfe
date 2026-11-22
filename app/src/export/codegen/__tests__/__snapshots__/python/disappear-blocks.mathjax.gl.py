# Disappear blocks — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 210 frames, like the editor's video export.
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

    def clean_up_from_scene(self, scene):
        # Off screen, the glyphs get their shape back: some come back later.
        super().clean_up_from_scene(scene)
        self.interpolate(0)


class _Uncreate(Uncreate):
    """Uncreate that gives the glyphs back their shape once they are off screen, so that
    they can come back later."""

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        self.interpolate(0)


class _ShrinkToCenter(ShrinkToCenter):
    """ShrinkToCenter that gives the glyphs back their size once they are off screen, so
    that they can come back later."""

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        self.interpolate(0)


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # letters: a+b+c+d+e
        letters = Tex(r"a+b+c+d+e")
        letters.set_color("#83C167")
        letters_g = _glyphs(letters, [
            (-3.5, 0, 0.6875, 1), (-2.625, 0, 0.6875, 1), (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1),
            (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1), (1.75, 0, 0.6875, 1), (2.625, 0, 0.6875, 1),
            (3.5, 0, 0.6875, 1),
        ])
        letters.move_to([0, 0.5, 0])

        self.add(letters)
        # 0 s – 0.3 s
        self.wait(0.3)
        letters_disappear = FadeOut(VGroup(letters_g[0]), shift=UP)
        # 0.3 s – 0.5 s: letters fade_out
        self.play(_Part(letters_disappear, 0, 1 / 3), run_time=0.2)
        letters_disappear_2 = _Uncreate(VGroup(letters_g[2]))
        # 0.5 s – 0.9 s: letters fade_out, letters uncreate
        self.play(
            _Part(letters_disappear, 1 / 3, 1),
            _Part(letters_disappear_2, 0, 2 / 3),
            run_time=0.4,
        )
        # 0.9 s – 1.1 s: letters uncreate
        self.play(_Part(letters_disappear_2, 2 / 3, 1), run_time=0.2)
        # 1.1 s – 1.3 s
        self.wait(0.2)
        letters_disappear_3 = _ShrinkToCenter(VGroup(letters_g[4]), remover=True)
        # 1.3 s – 1.5 s: letters shrink_to_center
        self.play(_Part(letters_disappear_3, 0, 1 / 3), run_time=0.2)
        letters_disappear_4 = _Unwrite(VGroup(letters_g[6], letters_g[8]), stroke_color="#83C167")
        # 1.5 s – 1.9 s: letters shrink_to_center, letters unwrite
        self.play(
            _Part(letters_disappear_3, 1 / 3, 1),
            _Part(letters_disappear_4, 0, 0.5),
            run_time=0.4,
        )
        # 1.9 s – 2.3 s: letters unwrite
        self.play(_Part(letters_disappear_4, 0.5, 1), run_time=0.4)
        # 2.3 s – 2.5 s
        self.wait(0.2)
        # 2.5 s – 3 s: letters uncreate
        self.play(
            Uncreate(VGroup(letters_g[1]), rate_func=lambda t: rush_into(1 - t)),
            run_time=0.5,
        )
        # 3 s – 3.2 s
        self.wait(0.2)
        VGroup(letters_g[0], letters_g[2], letters_g[4], letters_g[6], letters_g[8]).apply_matrix([[0.965926, -0.258819], [0.258819, 0.965926]], about_point=[0, 0.5, 0]).shift(np.array([0.5, -1, 0]))
        # 3.2 s – 3.8 s: letters tween
        self.play(
            _Tween(VGroup(letters_g[3], letters_g[5], letters_g[7]), (0, 0.5, 1, 0, 1, 1), (0.5, -0.5, 1, 15, 1, 1)),
            run_time=0.6,
        )
        # 3.8 s – 4 s
        self.wait(0.2)
        letters_appear = Write(VGroup(letters_g[0]), stroke_color="#83C167")
        # 4 s – 4.2 s: letters write
        self.play(_Part(letters_appear, 0, 1 / 3), run_time=0.2)
        letters_appear_2 = FadeIn(VGroup(letters_g[2]))
        # 4.2 s – 4.6 s: letters write, letters fade_in
        self.play(_Part(letters_appear, 1 / 3, 1), _Part(letters_appear_2, 0, 2 / 3), run_time=0.4)
        # 4.6 s – 4.8 s: letters fade_in
        self.play(_Part(letters_appear_2, 2 / 3, 1), run_time=0.2)
        # 4.8 s – 5 s
        self.wait(0.2)
        letters_appear_3 = GrowFromCenter(VGroup(letters_g[4]))
        # 5 s – 5.2 s: letters grow_from_center
        self.play(_Part(letters_appear_3, 0, 1 / 3), run_time=0.2)
        letters_appear_4 = ShowCreation(VGroup(letters_g[6], letters_g[8]))
        # 5.2 s – 5.6 s: letters grow_from_center, letters create
        self.play(
            _Part(letters_appear_3, 1 / 3, 1),
            _Part(letters_appear_4, 0, 2 / 3),
            run_time=0.4,
        )
        # 5.6 s – 5.8 s: letters create
        self.play(_Part(letters_appear_4, 2 / 3, 1), run_time=0.2)
        # 5.8 s – 6.3 s
        self.wait(0.5)
        # 6.3 s – 7 s: letters unwrite
        self.play(
            _Unwrite(VGroup(letters_g[0], *letters_g[2:]), stroke_color="#83C167"),
            run_time=0.7,
        )
