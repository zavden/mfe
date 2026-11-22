# Palette roles — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl PaletteRoles.py PaletteRoles -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 360 frames, like the editor's video export.
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


def _circle_around(mobject, buff=0.1, color=WHITE, **kwargs):
    """A circle through the corners of the mobject's box, `buff` further out, centred on it."""
    radius = np.hypot(mobject.get_width(), mobject.get_height()) / 2 + buff
    return Circle(radius=radius, stroke_color=color, fill_color=color, **kwargs).move_to(mobject)


class PaletteRoles(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # rule: f(x)=2x+1
        rule = Tex(r"f(x)=2x+1", font_size=86.6152)
        rule_g = _glyphs(rule, [
            (-2.7025, 0, 0.495, 0.91), (-2.2415, 0, 0.239, 1), (-1.7875, -0.0345, 0.487, 0.453), (-1.3195, 0, 0.239, 1),
            (-0.4382, 0, 0.666, 0.234), (0.4781, 0.083, 0.399, 0.666), (1.0071, -0.0345, 0.487, 0.453), (1.9118, 0.0005, 0.666, 0.665),
            (2.778, 0.083, 0.344, 0.666),
        ])
        VGroup(rule_g[2], rule_g[6]).set_color("#58C4DD")
        VGroup(rule_g[5], rule_g[8]).set_color("#F0AC5F")
        rule.move_to([0, 1.55, 0])

        # value: f(3)=7
        value = Tex(r"f(3)=7", font_size=86.6152)
        value_g = _glyphs(value, [
            (-1.5483, 0, 0.495, 0.91), (-1.0873, 0, 0.239, 1), (-0.6623, 0.0715, 0.415, 0.687), (-0.2373, 0, 0.239, 1),
            (0.644, 0, 0.666, 0.234), (1.5808, 0.077, 0.43, 0.698),
        ])
        value_g[2].set_color("#F0AC5F")
        value_g[5].set_color("#83C167")
        value.move_to([0, -1.55, 0])
        value.set_z_index(1)

        # brace: brace, built on rule where its clip starts

        # arrow: arrow, built on rule and value where its clip starts

        # note: Evaluate at $x=3$
        note = TexText(r"Evaluate at $x=3$", font_size=41.2453)
        note_g = _glyphs(note, [
            (-4.8667, 0.0051, 0.8749, 0.9488), (-4.0211, -0.1763, 0.6823, 0.6167), (-3.2844, -0.1644, 0.6405, 0.6405), (-2.7527, 0.0153, 0.3307, 0.9693),
            (-2.1709, -0.1681, 0.7214, 0.633), (-1.423, -0.1644, 0.6405, 0.6405), (-0.8481, -0.0472, 0.4395, 0.8721), (-0.2411, -0.1644, 0.54, 0.6405),
            (0.7859, -0.1644, 0.6405, 0.6405), (1.3607, -0.0472, 0.4395, 0.8721), (2.3961, -0.1686, 0.6795, 0.6321), (3.736, -0.1205, 0.9293, 0.3265),
            (5.0146, -0.0207, 0.5791, 0.9586),
        ])
        note.move_to([3.2, 0, 0])
        note.set_z_index(2)

        # box: box, built on value where its clip starts

        # circle: circle, built on value where its clip starts

        rule_in = Write(VGroup(*rule_g[:]), stroke_color="#FFFFFF")
        # 0 s – 0.4 s: rule write
        self.play(_Part(rule_in, 0, 0.4), run_time=0.4)
        value_in = Write(VGroup(*value_g[:]), stroke_color="#FFFFFF")
        # 0.4 s – 1 s: rule write, value write
        self.play(_Part(rule_in, 0.4, 1), _Part(value_in, 0, 0.6), run_time=0.6)
        # 1 s – 1.2 s: value write
        self.play(_Part(value_in, 0.6, 0.8), run_time=0.2)
        brace = Brace(VGroup(*rule_g[5:]), UP, buff=0.2)
        brace.set_z_index(3)
        brace_in = GrowFromCenter(brace)
        # 1.2 s – 1.4 s: value write, brace grow_from_center
        self.play(_Part(value_in, 0.8, 1), _Part(brace_in, 0, 1 / 3), run_time=0.2)
        arrow = Line(rule.get_bottom(), value.get_top(), buff=0.25, stroke_width=6, color="#FC6255").add_tip(length=0.35, width=0.35)
        arrow.set_z_index(4)
        arrow_in = GrowArrow(arrow)
        # 1.4 s – 1.6 s: brace grow_from_center, arrow grow_arrow
        self.play(_Part(brace_in, 1 / 3, 2 / 3), _Part(arrow_in, 0, 0.25), run_time=0.2)
        note_in = Write(VGroup(*note_g[:]), stroke_color="#FFFFFF")
        # 1.6 s – 1.8 s: brace grow_from_center, arrow grow_arrow, note write
        self.play(
            _Part(brace_in, 2 / 3, 1),
            _Part(arrow_in, 0.25, 0.5),
            _Part(note_in, 0, 0.25),
            run_time=0.2,
        )
        # 1.8 s – 2.2 s: arrow grow_arrow, note write
        self.play(_Part(arrow_in, 0.5, 1), _Part(note_in, 0.25, 0.75), run_time=0.4)
        # 2.2 s – 2.4 s: note write
        self.play(_Part(note_in, 0.75, 1), run_time=0.2)
        # 2.4 s – 3 s
        self.wait(0.6)
        box = SurroundingRectangle(value_g[5], buff=0.15, color="#FFFF00")
        box_g = _glyphs(box, [
            (0, 0, 0.7423, 1),
        ])
        box.set_z_index(5)
        box_in = ShowCreation(VGroup(box_g[0]))
        # 3 s – 3.2 s: box create
        self.play(_Part(box_in, 0, 1 / 3), run_time=0.2)
        circle = _circle_around(value_g[2], buff=0.08, color="#FC6255")
        circle_g = _glyphs(circle, [
            (0, 0, 1, 1),
        ])
        circle.set_z_index(6)
        circle_in = ShowCreation(VGroup(circle_g[0]))
        # 3.2 s – 3.6 s: box create, circle create
        self.play(_Part(box_in, 1 / 3, 1), _Part(circle_in, 0, 2 / 3), run_time=0.4)
        # 3.6 s – 3.8 s: circle create
        self.play(_Part(circle_in, 2 / 3, 1), run_time=0.2)
        # 3.8 s – 6 s
        self.wait(2.2)
