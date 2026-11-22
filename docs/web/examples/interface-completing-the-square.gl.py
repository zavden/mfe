# Completing the square — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl CompletingTheSquare.py CompletingTheSquare -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 2250 frames, like the editor's video export.
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


class CompletingTheSquare(Scene):
    default_camera_config = dict(background_color="#0E1A2B")

    def construct(self):

        # title: \text{Completing the square}
        title = Tex(r"\text{Completing the square}", font_size=49.4944)
        title_g = _glyphs(title, [
            (-5.0662, 0.101, 0.6685, 0.798), (-4.3952, -0.034, 0.4863, 0.5038), (-3.6565, -0.0313, 0.8573, 0.4852), (-2.9042, -0.1378, 0.5412, 0.6981),
            (-2.4376, 0.107, 0.2437, 0.7618), (-2.0476, -0.034, 0.4248, 0.5038), (-1.6103, 0.0576, 0.3436, 0.6872), (-1.2223, 0.0933, 0.2349, 0.7344),
            (-0.7599, -0.0313, 0.5521, 0.4852), (-0.1797, -0.1383, 0.5016, 0.7234), (0.6461, 0.0576, 0.3436, 0.6872), (1.1916, 0.107, 0.5521, 0.7618),
            (1.7333, -0.034, 0.4248, 0.5038), (2.5596, -0.034, 0.3589, 0.5038), (3.0848, -0.1378, 0.5412, 0.6981), (3.6675, -0.0373, 0.5521, 0.4973),
            (4.2597, -0.034, 0.4951, 0.5038), (4.7301, -0.0313, 0.3688, 0.4852), (5.188, -0.034, 0.4248, 0.5038),
        ])
        title.scale(0.9).move_to([0, 3.4, 0])
        title.set_z_index(4)

        # equation: ax^2+bx+c=0
        equation = Tex(r"ax^2+bx+c=0", font_size=49.4944)
        equation_g = _glyphs(equation, [
            (-3.4985, -0.1893, 0.4767, 0.4715), (-2.9389, -0.1893, 0.5184, 0.4715), (-2.4264, 0.2581, 0.3221, 0.4838), (-1.5307, -0.1534, 0.6922, 0.6933),
            (-0.6537, -0.0581, 0.3831, 0.7338), (-0.1581, -0.1893, 0.5184, 0.4715), (0.7832, -0.1534, 0.6922, 0.6933), (1.6648, -0.1893, 0.4049, 0.4715),
            (2.5637, -0.1534, 0.6922, 0.2436), (3.5177, -0.0784, 0.4382, 0.7162),
        ])
        equation_g[0].set_color("#F7D96F")
        equation_g[4].set_color("#58C4DD")
        equation_g[7].set_color("#FC6255")
        equation.scale(1.3).move_to([0, 0.5, 0])
        equation.set_z_index(1)

        # steps: ax^2+bx+c &= 0 \\ x^2+\frac{b}{a}x+\frac{c}{a} &= 0 \\ x^2+\frac{b}{a}x &= -\frac{c}{a} \\ x^2+\frac{b}{a}x+\frac{b^2}{4a^2} &= \frac{b^2}{4a^2}-\frac{c}{a} \\ \left(x+\frac{b}{2a}\right)^2 &= \frac{b^2-4ac}{4a^2}
        steps = Tex(r"""ax^2+bx+c &= 0 \\
x^2+\frac{b}{a}x+\frac{c}{a} &= 0 \\
x^2+\frac{b}{a}x &= -\frac{c}{a} \\
x^2+\frac{b}{a}x+\frac{b^2}{4a^2} &= \frac{b^2}{4a^2}-\frac{c}{a} \\
\left(x+\frac{b}{2a}\right)^2 &= \frac{b^2-4ac}{4a^2}""", font_size=49.4944)
        steps_g = _glyphs(steps, [
            (-0.3767, 0.4436, 0.039, 0.0386), (-0.3308, 0.4436, 0.0425, 0.0386), (-0.2889, 0.4802, 0.0264, 0.0396), (-0.2155, 0.4465, 0.0567, 0.0568),
            (-0.1437, 0.4543, 0.0314, 0.0601), (-0.1031, 0.4436, 0.0425, 0.0386), (-0.026, 0.4465, 0.0567, 0.0568), (0.0462, 0.4436, 0.0332, 0.0386),
            (0.1198, 0.4465, 0.0567, 0.0199), (0.1979, 0.4526, 0.0359, 0.0586), (-0.3884, 0.2619, 0.0425, 0.0386), (-0.3464, 0.2985, 0.0264, 0.0396),
            (-0.2731, 0.2648, 0.0567, 0.0568), (-0.1868, 0.3303, 0.0314, 0.0601), (-0.1882, 0.2648, 0.0451, 0.0034), (-0.1878, 0.2034, 0.039, 0.0386),
            (-0.1317, 0.2619, 0.0425, 0.0386), (-0.0546, 0.2648, 0.0567, 0.0568), (0.0319, 0.3196, 0.0332, 0.0386), (0.0302, 0.2648, 0.0451, 0.0034),
            (0.0306, 0.2034, 0.039, 0.0386), (0.1198, 0.2648, 0.0567, 0.0199), (0.1979, 0.271, 0.0359, 0.0586), (-0.2187, 0.0525, 0.0425, 0.0386),
            (-0.1767, 0.0891, 0.0264, 0.0396), (-0.1034, 0.0554, 0.0567, 0.0568), (-0.0171, 0.1209, 0.0314, 0.0601), (-0.0185, 0.0554, 0.0451, 0.0034),
            (-0.0181, -0.006, 0.039, 0.0386), (0.038, 0.0525, 0.0425, 0.0386), (0.1198, 0.0554, 0.0567, 0.0199), (0.2098, 0.0554, 0.0521, 0.0034),
            (0.2774, 0.1101, 0.0332, 0.0386), (0.2757, 0.0554, 0.0451, 0.0034), (0.2761, -0.006, 0.039, 0.0386), (-0.4693, -0.1672, 0.0425, 0.0386),
            (-0.4273, -0.1305, 0.0264, 0.0396), (-0.3539, -0.1642, 0.0567, 0.0568), (-0.2676, -0.0988, 0.0314, 0.0601), (-0.269, -0.1642, 0.0451, 0.0034),
            (-0.2686, -0.2256, 0.039, 0.0386), (-0.2126, -0.1672, 0.0425, 0.0386), (-0.1355, -0.1642, 0.0567, 0.0568), (-0.0279, -0.0988, 0.0314, 0.0601),
            (0.0059, -0.0771, 0.0264, 0.0396), (-0.0102, -0.1642, 0.1259, 0.0034), (-0.0519, -0.2152, 0.0378, 0.0577), (-0.0076, -0.2256, 0.039, 0.0386),
            (0.0315, -0.1996, 0.0264, 0.0396), (0.1198, -0.1642, 0.0567, 0.0199), (0.2321, -0.0988, 0.0314, 0.0601), (0.266, -0.0771, 0.0264, 0.0396),
            (0.2499, -0.1642, 0.1259, 0.0034), (0.2082, -0.2152, 0.0378, 0.0577), (0.2524, -0.2256, 0.039, 0.0386), (0.2915, -0.1996, 0.0264, 0.0396),
            (0.3751, -0.1642, 0.0521, 0.0034), (0.4616, -0.1095, 0.0332, 0.0386), (0.46, -0.1642, 0.0451, 0.0034), (0.4604, -0.2256, 0.039, 0.0386),
            (-0.3231, -0.3977, 0.0419, 0.2045), (-0.2753, -0.4007, 0.0425, 0.0386), (-0.1983, -0.3978, 0.0567, 0.0568), (-0.0907, -0.3323, 0.0314, 0.0601),
            (-0.0921, -0.3978, 0.0877, 0.0034), (-0.1146, -0.4492, 0.034, 0.0568), (-0.0703, -0.4592, 0.039, 0.0386), (-0.014, -0.3977, 0.0419, 0.2045),
            (0.0417, -0.2968, 0.0264, 0.0396), (0.1198, -0.3978, 0.0567, 0.0199), (0.2066, -0.3323, 0.0314, 0.0601), (0.2404, -0.3107, 0.0264, 0.0396),
            (0.3138, -0.3401, 0.0521, 0.0034), (0.3872, -0.3326, 0.0378, 0.0577), (0.4315, -0.3431, 0.039, 0.0386), (0.4737, -0.3431, 0.0332, 0.0386),
            (0.3387, -0.3978, 0.3036, 0.0034), (0.297, -0.4487, 0.0378, 0.0577), (0.3413, -0.4592, 0.039, 0.0386), (0.3804, -0.4331, 0.0264, 0.0396),
        ])
        VGroup(steps_g[0], steps_g[15], steps_g[20], steps_g[28], steps_g[34], steps_g[40], steps_g[47], steps_g[54], steps_g[59], steps_g[66], steps_g[74], steps_g[78]).set_color("#F7D96F")
        VGroup(steps_g[4], steps_g[13], steps_g[26], steps_g[38], steps_g[43], steps_g[50], steps_g[63], steps_g[70]).set_color("#58C4DD")
        VGroup(steps_g[7], steps_g[18], steps_g[32], steps_g[57], steps_g[75]).set_color("#FC6255")
        steps.move_to([-1.3, -0.55, 0])
        steps.set_z_index(2)

        # divide_by_a: \div a
        divide_by_a = Tex(r"\div a", font_size=49.4944)
        divide_by_a.set_color("#83C167")
        divide_by_a_g = _glyphs(divide_by_a, [
            (-0.4953, 0, 1.1971, 1), (0.6835, -0.0618, 0.8208, 0.8118),
        ])
        divide_by_a_g[1].set_color("#F7D96F")
        divide_by_a.scale(0.9).move_to([1.25, 1.55, 0])
        divide_by_a.set_z_index(3)

        # half_b_squared: \left(\frac{b}{2a}\right)^2=\frac{b^2}{4a^2}
        half_b_squared = Tex(r"\left(\frac{b}{2a}\right)^2=\frac{b^2}{4a^2}", font_size=49.4944)
        half_b_squared.set_color("#83C167")
        half_b_squared_g = _glyphs(half_b_squared, [
            (-1.0357, -0.0416, 0.188, 0.9168), (-0.6792, 0.2517, 0.1406, 0.2694), (-0.6855, -0.0418, 0.3931, 0.0153), (-0.7867, -0.2722, 0.1525, 0.2545),
            (-0.5881, -0.3171, 0.175, 0.1731), (-0.3357, -0.0416, 0.188, 0.9168), (-0.0857, 0.4112, 0.1182, 0.1776), (0.2644, -0.0418, 0.2541, 0.0894),
            (0.768, 0.2517, 0.1406, 0.2694), (0.9197, 0.3487, 0.1182, 0.1776), (0.8474, -0.0418, 0.5646, 0.0153), (0.6605, -0.2701, 0.1693, 0.2587),
            (0.8591, -0.3171, 0.175, 0.1731), (1.0342, -0.2002, 0.1182, 0.1776),
        ])
        VGroup(half_b_squared_g[1], half_b_squared_g[8]).set_color("#58C4DD")
        VGroup(half_b_squared_g[4], half_b_squared_g[12]).set_color("#F7D96F")
        half_b_squared.move_to([4.3, 0.9, 0])
        half_b_squared.set_z_index(3)

        # square_root: x+\frac{b}{2a}=\pm\frac{\sqrt{b^2-4ac}}{2a}
        square_root = Tex(r"x+\frac{b}{2a}=\pm\frac{\sqrt{b^2-4ac}}{2a}", font_size=49.4944)
        square_root_g = _glyphs(square_root, [
            (-2.0387, -0.0939, 0.2216, 0.2016), (-1.6362, -0.0785, 0.296, 0.2964), (-1.0745, 0.2633, 0.1638, 0.3138), (-1.0818, -0.0785, 0.4578, 0.0178),
            (-1.1996, -0.3469, 0.1776, 0.2964), (-0.9684, -0.3992, 0.2038, 0.2016), (-0.5029, -0.0785, 0.296, 0.1041), (-0.0331, -0.0416, 0.2969, 0.2964),
            (0.3996, 0.2775, 0.3472, 0.4451), (1.357, 0.4911, 1.5851, 0.0178), (0.6673, 0.2633, 0.1638, 0.3138), (0.844, 0.3433, 0.1377, 0.2069),
            (1.227, 0.2226, 0.2719, 0.0178), (1.6102, 0.262, 0.1972, 0.3013), (1.8414, 0.2072, 0.2038, 0.2016), (2.0617, 0.2072, 0.1731, 0.2016),
            (1.1715, -0.0785, 1.956, 0.0178), (1.0537, -0.3469, 0.1776, 0.2964), (1.2849, -0.3992, 0.2038, 0.2016),
        ])
        VGroup(square_root_g[2], square_root_g[10]).set_color("#58C4DD")
        VGroup(square_root_g[5], square_root_g[14], square_root_g[18]).set_color("#F7D96F")
        square_root_g[7].set_color("#FF862F")
        square_root_g[15].set_color("#FC6255")
        square_root.scale(1.3).move_to([0, 0.4, 0])
        square_root.set_z_index(1)

        # quadratic_formula: x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}
        quadratic_formula = Tex(r"x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}", font_size=49.4944)
        quadratic_formula_g = _glyphs(quadratic_formula, [
            (-1.8519, -0.0939, 0.2216, 0.2016), (-1.4247, -0.0785, 0.296, 0.1041), (-0.9015, 0.2226, 0.2719, 0.0178), (-0.6254, 0.2633, 0.1638, 0.3138),
            (-0.2654, 0.2595, 0.2969, 0.2964), (0.2128, 0.2775, 0.3472, 0.4451), (1.1702, 0.4911, 1.5851, 0.0178), (0.4805, 0.2633, 0.1638, 0.3138),
            (0.6571, 0.3433, 0.1377, 0.2069), (1.0402, 0.2226, 0.2719, 0.0178), (1.4234, 0.262, 0.1972, 0.3013), (1.6546, 0.2072, 0.2038, 0.2016),
            (1.8749, 0.2072, 0.1731, 0.2016), (0.4442, -0.0785, 3.0371, 0.0178), (0.3263, -0.3469, 0.1776, 0.2964), (0.5575, -0.3992, 0.2038, 0.2016),
        ])
        VGroup(quadratic_formula_g[3], quadratic_formula_g[7]).set_color("#58C4DD")
        VGroup(quadratic_formula_g[11], quadratic_formula_g[15]).set_color("#F7D96F")
        quadratic_formula_g[12].set_color("#FC6255")
        quadratic_formula.scale(1.3).move_to([0, 0.4, 0])

        # discriminant: \Delta=b^2-4ac
        discriminant = Tex(r"\Delta=b^2-4ac", font_size=49.4944)
        discriminant_g = _glyphs(discriminant, [
            (-2.7795, -0.0848, 0.8304, 0.8057), (-1.5602, -0.2063, 0.7483, 0.2633), (-0.5496, -0.1033, 0.4141, 0.7933), (-0.103, 0.2385, 0.3482, 0.523),
            (0.8654, -0.2063, 0.6875, 0.045), (1.8342, -0.1067, 0.4985, 0.7618), (2.4188, -0.2451, 0.5154, 0.5097), (2.9759, -0.2451, 0.4377, 0.5097),
        ])
        VGroup(*discriminant_g[2:]).set_color("#83C167")
        discriminant.scale(1.2).move_to([0, -1.7, 0])
        discriminant.set_z_index(3)

        title_in = Write(VGroup(*title_g[:]), stroke_color="#FFFFFF")
        # 0 s – 0.5 s: title write
        self.play(_Part(title_in, 0, 1 / 3), run_time=0.5)
        equation_in = Write(VGroup(*equation_g[:]), stroke_color="#FFFFFF")
        # 0.5 s – 1.5 s: title write, equation write
        self.play(_Part(title_in, 1 / 3, 1), _Part(equation_in, 0, 2 / 3), run_time=1)
        # 1.5 s – 2 s: equation write
        self.play(_Part(equation_in, 2 / 3, 1), run_time=0.5)
        # 2 s – 2.3 s
        self.wait(0.3)
        equation_pivot = equation_g[0].get_center()
        # 2.3 s – 3.1 s: equation part
        self.play(
            equation_g[0].animate(rate_func=there_and_back).scale(1.5, about_point=equation_pivot),
            run_time=0.8,
        )
        # 3.1 s – 3.4 s
        self.wait(0.3)
        equation_g[0].set_z_index(2)
        equation_g[1].set_z_index(2)
        equation_g[2].set_z_index(2)
        equation_g[3].set_z_index(2)
        equation_g[4].set_z_index(2)
        equation_g[5].set_z_index(2)
        equation_g[6].set_z_index(2)
        equation_g[7].set_z_index(2)
        equation_g[8].set_z_index(2)
        equation_g[9].set_z_index(2)
        # 3.4 s – 4.6 s: equation → steps
        self.play(
            ReplacementTransform(equation_g[0], steps_g[0]),
            ReplacementTransform(equation_g[1], steps_g[1]),
            ReplacementTransform(equation_g[2], steps_g[2]),
            ReplacementTransform(equation_g[3], steps_g[3]),
            ReplacementTransform(equation_g[4], steps_g[4]),
            ReplacementTransform(equation_g[5], steps_g[5]),
            ReplacementTransform(equation_g[6], steps_g[6]),
            ReplacementTransform(equation_g[7], steps_g[7]),
            ReplacementTransform(equation_g[8], steps_g[8]),
            ReplacementTransform(equation_g[9], steps_g[9]),
            run_time=1.2,
        )
        # 4.6 s – 4.8 s
        self.wait(0.2)
        # 4.8 s – 5.3 s: divide_by_a grow_from_center
        self.play(GrowFromCenter(divide_by_a), run_time=0.5)
        # 5.3 s – 5.6 s
        self.wait(0.3)
        steps_morph = [
            TransformFromCopy(steps_g[1], steps_g[10]),
            TransformFromCopy(steps_g[2], steps_g[11]),
            TransformFromCopy(steps_g[3], steps_g[12]),
            TransformFromCopy(steps_g[4], steps_g[13]),
            TransformFromCopy(steps_g[5], steps_g[16]),
            TransformFromCopy(steps_g[6], steps_g[17]),
            TransformFromCopy(steps_g[7], steps_g[18]),
            TransformFromCopy(steps_g[8], steps_g[21]),
            TransformFromCopy(steps_g[9], steps_g[22]),
            TransformFromCopy(VGroup(steps_g[0]), VGroup(steps_g[15], steps_g[20])),
        ]
        # 5.6 s – 6 s: steps morph
        self.play(*(_Part(a, 0, 2 / 7) for a in steps_morph), run_time=0.4)
        # 6 s – 6.8 s: steps morph, steps create
        self.play(
            *(_Part(a, 2 / 7, 6 / 7) for a in steps_morph),
            ShowCreation(VGroup(steps_g[14], steps_g[19])),
            run_time=0.8,
        )
        # 6.8 s – 7 s: steps morph
        self.play(*(_Part(a, 6 / 7, 1) for a in steps_morph), run_time=0.2)
        # 7 s – 7.1 s
        self.wait(0.1)
        # 7.1 s – 7.6 s: divide_by_a shrink_to_center
        self.play(ShrinkToCenter(divide_by_a, remover=True), run_time=0.5)
        # 7.6 s – 8 s
        self.wait(0.4)
        # 8 s – 9 s: steps morph
        self.play(
            TransformFromCopy(steps_g[10], steps_g[23]),
            TransformFromCopy(steps_g[11], steps_g[24]),
            TransformFromCopy(steps_g[12], steps_g[25]),
            TransformFromCopy(steps_g[13], steps_g[26]),
            TransformFromCopy(steps_g[14], steps_g[27]),
            TransformFromCopy(steps_g[15], steps_g[28]),
            TransformFromCopy(steps_g[16], steps_g[29]),
            TransformFromCopy(steps_g[21], steps_g[30]),
            run_time=1,
        )
        # 9 s – 9.2 s
        self.wait(0.2)
        # 9.2 s – 10.6 s: steps morph
        self.play(
            TransformFromCopy(steps_g[17], steps_g[31], path_arc=-90 * DEGREES, rate_func=slow_into),
            TransformFromCopy(steps_g[18], steps_g[32], path_arc=-90 * DEGREES, rate_func=slow_into),
            TransformFromCopy(steps_g[19], steps_g[33], path_arc=-90 * DEGREES, rate_func=slow_into),
            TransformFromCopy(steps_g[20], steps_g[34], path_arc=-90 * DEGREES, rate_func=slow_into),
            run_time=1.4,
        )
        # 10.6 s – 11 s
        self.wait(0.4)
        # 11 s – 11.8 s: half_b_squared fade_in
        self.play(FadeIn(VGroup(*half_b_squared_g[:7]), shift=0.6 * LEFT, scale=0.8), run_time=0.8)
        # 11.8 s – 12 s
        self.wait(0.2)
        # 12 s – 13 s: half_b_squared write
        self.play(Write(VGroup(*half_b_squared_g[7:]), stroke_color="#83C167"), run_time=1)
        # 13 s – 13.2 s
        self.wait(0.2)
        # 13.2 s – 14.2 s: steps morph
        self.play(
            TransformFromCopy(steps_g[23], steps_g[35]),
            TransformFromCopy(steps_g[24], steps_g[36]),
            TransformFromCopy(steps_g[25], steps_g[37]),
            TransformFromCopy(steps_g[26], steps_g[38]),
            TransformFromCopy(steps_g[27], steps_g[39]),
            TransformFromCopy(steps_g[28], steps_g[40]),
            TransformFromCopy(steps_g[29], steps_g[41]),
            TransformFromCopy(steps_g[30], steps_g[49]),
            TransformFromCopy(steps_g[31], steps_g[56]),
            TransformFromCopy(steps_g[32], steps_g[57]),
            TransformFromCopy(steps_g[33], steps_g[58]),
            TransformFromCopy(steps_g[34], steps_g[59]),
            run_time=1,
        )
        # 14.2 s – 14.4 s
        self.wait(0.2)
        half_b_squared_to_steps = [
            TransformFromCopy(half_b_squared_g[8], steps_g[43]),
            TransformFromCopy(half_b_squared_g[9], steps_g[44]),
            TransformFromCopy(half_b_squared_g[10], steps_g[45]),
            TransformFromCopy(half_b_squared_g[11], steps_g[46]),
            TransformFromCopy(half_b_squared_g[12], steps_g[47]),
            TransformFromCopy(half_b_squared_g[13], steps_g[48]),
            TransformFromCopy(half_b_squared_g[8], steps_g[50]),
            TransformFromCopy(half_b_squared_g[9], steps_g[51]),
            TransformFromCopy(half_b_squared_g[10], steps_g[52]),
            TransformFromCopy(half_b_squared_g[11], steps_g[53]),
            TransformFromCopy(half_b_squared_g[12], steps_g[54]),
            TransformFromCopy(half_b_squared_g[13], steps_g[55]),
        ]
        # 14.4 s – 15.2 s: half_b_squared → steps, steps write
        self.play(
            *(_Part(a, 0, 4 / 7) for a in half_b_squared_to_steps),
            Write(VGroup(steps_g[42]), stroke_color="#FFFFFF"),
            run_time=0.8,
        )
        # 15.2 s – 15.8 s: half_b_squared → steps
        self.play(*(_Part(a, 4 / 7, 1) for a in half_b_squared_to_steps), run_time=0.6)
        # 15.8 s – 16 s
        self.wait(0.2)
        # 16 s – 16.6 s: half_b_squared uncreate, steps part
        self.play(
            Uncreate(VGroup(*half_b_squared_g[:])),
            VGroup(*steps_g[:35]).animate.set_opacity(0.35),
            run_time=0.6,
        )
        # 16.6 s – 17 s
        self.wait(0.4)
        steps_morph_2 = [
            TransformFromCopy(steps_g[35], steps_g[61], rate_func=double_smooth),
            TransformFromCopy(steps_g[41], steps_g[61], rate_func=double_smooth),
            TransformFromCopy(steps_g[36], steps_g[68], rate_func=double_smooth),
            TransformFromCopy(steps_g[37], steps_g[62], rate_func=double_smooth),
            TransformFromCopy(steps_g[38], steps_g[63], rate_func=double_smooth),
            TransformFromCopy(steps_g[39], steps_g[64], rate_func=double_smooth),
            TransformFromCopy(steps_g[40], steps_g[66], rate_func=double_smooth),
            TransformFromCopy(steps_g[42], steps_g[65], rate_func=double_smooth),
            TransformFromCopy(steps_g[43], steps_g[65], rate_func=double_smooth),
            TransformFromCopy(steps_g[44], steps_g[65], rate_func=double_smooth),
            TransformFromCopy(steps_g[45], steps_g[65], rate_func=double_smooth),
            TransformFromCopy(steps_g[46], steps_g[65], rate_func=double_smooth),
            TransformFromCopy(steps_g[47], steps_g[65], rate_func=double_smooth),
            TransformFromCopy(steps_g[48], steps_g[65], rate_func=double_smooth),
            TransformFromCopy(steps_g[49], steps_g[69], rate_func=double_smooth),
            TransformFromCopy(steps_g[50], steps_g[70], rate_func=double_smooth),
            TransformFromCopy(steps_g[51], steps_g[71], rate_func=double_smooth),
            TransformFromCopy(steps_g[56], steps_g[72], rate_func=double_smooth),
            TransformFromCopy(steps_g[53], steps_g[73], rate_func=double_smooth),
            TransformFromCopy(steps_g[59], steps_g[74], rate_func=double_smooth),
            TransformFromCopy(steps_g[57], steps_g[75], rate_func=double_smooth),
            TransformFromCopy(steps_g[52], steps_g[76], rate_func=double_smooth),
            TransformFromCopy(steps_g[58], steps_g[76], rate_func=double_smooth),
            TransformFromCopy(steps_g[53], steps_g[77], rate_func=double_smooth),
            TransformFromCopy(steps_g[54], steps_g[78], rate_func=double_smooth),
            TransformFromCopy(steps_g[55], steps_g[79], rate_func=double_smooth),
        ]
        # 17 s – 17.6 s: steps morph
        self.play(*(_Part(a, 0, 0.375) for a in steps_morph_2), run_time=0.6)
        # 17.6 s – 18.4 s: steps morph, steps grow_from_center
        self.play(
            *(_Part(a, 0.375, 0.875) for a in steps_morph_2),
            GrowFromCenter(VGroup(steps_g[60], steps_g[67])),
            run_time=0.8,
        )
        # 18.4 s – 18.6 s: steps morph
        self.play(*(_Part(a, 0.875, 1) for a in steps_morph_2), run_time=0.2)
        # 18.6 s – 19 s
        self.wait(0.4)
        # 19 s – 19.8 s: steps fade_out
        self.play(FadeOut(VGroup(*steps_g[:60]), shift=0.5 * UP), run_time=0.8)
        # 19.8 s – 20 s
        self.wait(0.2)
        steps_pivot = VGroup(*steps_g[60:]).get_center()
        # 20 s – 21 s: steps part
        self.play(
            VGroup(*steps_g[60:]).animate.scale(1.3, about_point=steps_pivot).shift(np.array([0.87, 3.22, 0])),
            run_time=1,
        )
        # 21 s – 21.4 s
        self.wait(0.4)
        steps_to_square_root = [
            ReplacementTransform(steps_g[61], square_root_g[0]),
            ReplacementTransform(steps_g[62], square_root_g[1]),
            ReplacementTransform(steps_g[63], square_root_g[2]),
            ReplacementTransform(steps_g[64], square_root_g[3]),
            ReplacementTransform(steps_g[65], square_root_g[4]),
            ReplacementTransform(steps_g[66], square_root_g[5]),
            ReplacementTransform(steps_g[69], square_root_g[6]),
            FadeTransform(VGroup(steps_g[68]), VGroup(square_root_g[8], square_root_g[9])),
            ReplacementTransform(steps_g[70], square_root_g[10]),
            ReplacementTransform(steps_g[71], square_root_g[11]),
            ReplacementTransform(steps_g[72], square_root_g[12]),
            ReplacementTransform(steps_g[73], square_root_g[13]),
            ReplacementTransform(steps_g[74], square_root_g[14]),
            ReplacementTransform(steps_g[75], square_root_g[15]),
            ReplacementTransform(steps_g[76], square_root_g[16]),
            FadeTransform(steps_g[77], square_root_g[17]),
            ReplacementTransform(steps_g[78], square_root_g[18]),
            ReplacementTransform(steps_g[79], square_root_g[18]),
        ]
        steps_out = FadeOut(VGroup(steps_g[60], steps_g[67]))
        # 21.4 s – 22.4 s: steps → square_root, square_root draw_border_then_fill, steps fade_out
        self.play(
            *(_Part(a, 0, 5 / 6) for a in steps_to_square_root),
            DrawBorderThenFill(VGroup(square_root_g[7])),
            _Part(steps_out, 0, 5 / 6),
            run_time=1,
        )
        # 22.4 s – 22.6 s: steps → square_root, steps fade_out
        self.play(
            *(_Part(a, 5 / 6, 1) for a in steps_to_square_root),
            _Part(steps_out, 5 / 6, 1),
            run_time=0.2,
        )
        # 22.6 s – 24 s
        self.wait(1.4)
        # 24 s – 25.5 s: square_root → quadratic_formula
        self.play(
            ReplacementTransform(square_root_g[0], quadratic_formula_g[0], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[6], quadratic_formula_g[1], path_arc=-45 * DEGREES),
            FadeTransform(square_root_g[1], quadratic_formula_g[2], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[2], quadratic_formula_g[3], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[7], quadratic_formula_g[4], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[8], quadratic_formula_g[5], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[9], quadratic_formula_g[6], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[10], quadratic_formula_g[7], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[11], quadratic_formula_g[8], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[12], quadratic_formula_g[9], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[13], quadratic_formula_g[10], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[14], quadratic_formula_g[11], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[15], quadratic_formula_g[12], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[3], quadratic_formula_g[13], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[16], quadratic_formula_g[13], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[4], quadratic_formula_g[14], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[17], quadratic_formula_g[14], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[5], quadratic_formula_g[15], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root_g[18], quadratic_formula_g[15], path_arc=-45 * DEGREES),
            run_time=1.5,
        )
        # 25.5 s – 26 s
        self.wait(0.5)
        # 26 s – 27.2 s: quadratic_formula tween
        self.play(quadratic_formula.animate.scale(1.307692).move_to([0, 0.9, 0]), run_time=1.2)
        # 27.2 s – 27.6 s
        self.wait(0.4)
        # 27.6 s – 28.4 s: quadratic_formula part
        self.play(VGroup(*quadratic_formula_g[7:13]).animate.set_color("#83C167"), run_time=0.8)
        # 28.4 s – 28.6 s
        self.wait(0.2)
        quadratic_formula_pivot = quadratic_formula_g[4].get_center()
        # 28.6 s – 29.4 s: quadratic_formula part
        self.play(
            _Tween(VGroup(quadratic_formula_g[4]), (quadratic_formula_pivot[0], quadratic_formula_pivot[1], 1, 0, 1, 1), (quadratic_formula_pivot[0], quadratic_formula_pivot[1], 1.6, 20, 1, 1), rate_func=there_and_back),
            run_time=0.8,
        )
        # 29.4 s – 29.8 s
        self.wait(0.4)
        # 29.8 s – 31 s: quadratic_formula → discriminant, discriminant draw_border_then_fill
        self.play(
            ReplacementTransform(quadratic_formula_g[7].copy().set_z_index(3), discriminant_g[2]),
            ReplacementTransform(quadratic_formula_g[8].copy().set_z_index(3), discriminant_g[3]),
            ReplacementTransform(quadratic_formula_g[9].copy().set_z_index(3), discriminant_g[4]),
            ReplacementTransform(quadratic_formula_g[10].copy().set_z_index(3), discriminant_g[5]),
            ReplacementTransform(quadratic_formula_g[11].copy().set_z_index(3), discriminant_g[6]),
            ReplacementTransform(quadratic_formula_g[12].copy().set_z_index(3), discriminant_g[7]),
            DrawBorderThenFill(VGroup(discriminant_g[0], discriminant_g[1])),
            run_time=1.2,
        )
        # 31 s – 35 s
        self.wait(4)
        discriminant_out = Uncreate(VGroup(*discriminant_g[:]))
        # 35 s – 35.5 s: discriminant uncreate
        self.play(_Part(discriminant_out, 0, 0.625), run_time=0.5)
        quadratic_formula_out = FadeOut(quadratic_formula, shift=0.4 * DOWN)
        # 35.5 s – 35.8 s: discriminant uncreate, quadratic_formula fade_out
        self.play(
            _Part(discriminant_out, 0.625, 1),
            _Part(quadratic_formula_out, 0, 0.3),
            run_time=0.3,
        )
        # 35.8 s – 36.5 s: quadratic_formula fade_out
        self.play(_Part(quadratic_formula_out, 0.3, 1), run_time=0.7)
        # 36.5 s – 37.5 s: title unwrite
        self.play(_Unwrite(VGroup(*title_g[:]), stroke_color="#FFFFFF"), run_time=1)
