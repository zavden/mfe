# Pango line — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 960×540, 30 fps:
#     manim -r 960,540 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 90 frames, like the editor's video export.
from manim import *


def _mfe_text_contours(mob, target):
    contours = []
    for path in mob.get_subpaths():
        if len(path) < 3:
            continue
        contour = [float(path[0][0]), float(path[0][1])]
        if target == 'ce':
            for i in range(0, len(path), 4):
                curve = path[i:i + 4]
                if len(curve) != 4:
                    raise ValueError('Unexpected CE text contour topology.')
                contour.extend(float(v) for point in curve[1:] for v in point[:2])
        else:
            for i in range(0, len(path) - 2, 2):
                a, h, b = path[i:i + 3]
                contour.extend(float(v) for point in ((a + 2 * h) / 3, (2 * h + b) / 3, b)
                               for v in point[:2])
        if len(contour) > 2:
            contours.append(contour)
    return contours


def _mfe_verify_text(mob, name, target, count, expected=None):
    """Says, on stderr, when Manim has not built the text the editor showed, and keeps the
    scene running. `count` is the number of its glyphs there, `expected` the fingerprint of
    their outlines (none for a text the other library shaped). Other fonts, or other versions
    of Manim, Pango or the libraries under them, draw a text differently. With fewer glyphs
    here, empty ones are added: every glyph the scene names exists."""
    import hashlib
    import json
    import math
    import sys
    built = len(mob.submobjects)
    same = built == count
    if same and expected is not None:
        try:
            contours = [_mfe_text_contours(glyph, target) for glyph in mob.submobjects]
            quantized = [[[math.floor(v * 1000000 + 0.5) for v in path] for path in glyph]
                         for glyph in contours]
            same = expected == hashlib.sha256(
                json.dumps(quantized, separators=(',', ':')).encode()).hexdigest()
        except Exception:
            same = False
    if built < count:
        mob.add(*[VMobject() for _ in range(count - built)])
    if same:
        return
    if built == count:
        glyphs = ('It may look different, and colours or animations of single glyphs may fall '
                  'on other glyphs.')
    else:
        glyphs = (f'It has {built} glyphs here and {count} there, so colours and animations of '
                  'single glyphs fall on other glyphs.')
    try:
        # On a line of its own: ManimGL leaves a progress bar open on stderr.
        print(f'\nWarning: the text {name!r} is not drawn here as in the editor (other fonts, or '
              f'other versions of Manim or Pango). {glyphs} To match it again, shape the text '
              'again in the editor, on this machine and for this library, and export again.',
              file=sys.stderr)
    except Exception:
        pass


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


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # p1: AV office é
        with tempconfig({'pixel_width': 1920, 'pixel_height': 1080}):
            p1 = Text(r"AV office é", font=r"Noto Serif", font_size=48, weight=r"NORMAL", slant=r"NORMAL", disable_ligatures=False)
        _mfe_verify_text(p1, r"p1", "ce", 9, "0000000000000000000000000000000000000000000000000000000000000000")
        p1.set_color("#FFFFFF")
        p1[0].set_color("#FC6255")
        p1[3].set_color("#58C4DD")
        p1.move_to([-1, 1, 0])
        p1.set_z_index(1)

        # p2: ÁV {{x}}
        with tempconfig({'pixel_width': 1920, 'pixel_height': 1080}):
            p2 = Text(r"ÁV {{x}}", font=r"Noto Sans", font_size=36, weight=r"BOLD", slant=r"ITALIC", disable_ligatures=False)
        _mfe_verify_text(p2, r"p2", "ce", 7, "0000000000000000000000000000000000000000000000000000000000000000")
        p2.set_color("#83C167")
        p2.move_to([0, -1.5, 0])

        # 0 s – 0.5 s: p1 fade_in, p2 fade_in
        self.play(FadeIn(p1, rate_func=linear), FadeIn(p2, rate_func=linear), run_time=0.5)
        # 0.5 s – 0.8 s
        self.wait(0.3)
        p1_part = p1[3].animate(rate_func=linear).set_color("#FFFF00").build()
        # 0.8 s – 1 s: p1 part
        self.play(_Part(p1_part, 0, 0.4), run_time=0.2)
        p2_move = p2.animate(rate_func=linear).scale(1.2).set_opacity(0.7).build()
        # 1 s – 1.3 s: p1 part, p2 tween
        self.play(_Part(p1_part, 0.4, 1), _Part(p2_move, 0, 0.6), run_time=0.3)
        # 1.3 s – 1.5 s: p2 tween
        self.play(_Part(p2_move, 0.6, 1), run_time=0.2)
        # 1.5 s – 2 s: p1 tween
        self.play(
            _Tween(p1, (-1, 1, 1, 0, 1, 1), (0.5, 1, 1, 10, 1, 1), rate_func=linear),
            run_time=0.5,
        )
        # 2 s – 2.5 s
        self.wait(0.5)
        # 2.5 s – 3 s: p1 fade_out
        self.play(FadeOut(p1, rate_func=linear), run_time=0.5)
