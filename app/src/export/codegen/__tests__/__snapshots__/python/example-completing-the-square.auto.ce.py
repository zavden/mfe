# Completing the square — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 2250 frames, like the editor's video export.
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


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#0E1A2B"

        # title: \text{Completing the square}
        title = MathTex(r"\text{Completing the square}")
        title.scale(0.9).move_to([0, 3.4, 0])
        title.set_z_index(4)

        # equation: ax^2+bx+c=0
        equation = MathTex(r"ax^2+bx+c=0")
        equation[0][0].set_color("#F7D96F")
        equation[0][4].set_color("#58C4DD")
        equation[0][7].set_color("#FC6255")
        equation.scale(1.3).move_to([0, 0.5, 0])
        equation.set_z_index(1)

        # steps: ax^2+bx+c &= 0 \\ x^2+\frac{b}{a}x+\frac{c}{a} &= 0 \\ x^2+\frac{b}{a}x &= -\frac{c}{a} \\ x^2+\frac{b}{a}x+\frac{b^2}{4a^2} &= \frac{b^2}{4a^2}-\frac{c}{a} \\ \left(x+\frac{b}{2a}\right)^2 &= \frac{b^2-4ac}{4a^2}
        steps = MathTex(r"""ax^2+bx+c &= 0 \\
x^2+\frac{b}{a}x+\frac{c}{a} &= 0 \\
x^2+\frac{b}{a}x &= -\frac{c}{a} \\
x^2+\frac{b}{a}x+\frac{b^2}{4a^2} &= \frac{b^2}{4a^2}-\frac{c}{a} \\
\left(x+\frac{b}{2a}\right)^2 &= \frac{b^2-4ac}{4a^2}""")
        VGroup(steps[0][0], steps[0][15], steps[0][20], steps[0][28], steps[0][34], steps[0][40], steps[0][47], steps[0][54], steps[0][59], steps[0][66], steps[0][74], steps[0][78]).set_color("#F7D96F")
        VGroup(steps[0][4], steps[0][13], steps[0][26], steps[0][38], steps[0][43], steps[0][50], steps[0][63], steps[0][70]).set_color("#58C4DD")
        VGroup(steps[0][7], steps[0][18], steps[0][32], steps[0][57], steps[0][75]).set_color("#FC6255")
        steps.move_to([-1.3, -0.55, 0])
        steps.set_z_index(2)

        # divide_by_a: \div a
        divide_by_a = MathTex(r"\div a", color="#83C167")
        divide_by_a[0][1].set_color("#F7D96F")
        divide_by_a.scale(0.9).move_to([1.25, 1.55, 0])
        divide_by_a.set_z_index(3)

        # half_b_squared: \left(\frac{b}{2a}\right)^2=\frac{b^2}{4a^2}
        half_b_squared = MathTex(r"\left(\frac{b}{2a}\right)^2=\frac{b^2}{4a^2}", color="#83C167")
        VGroup(half_b_squared[0][1], half_b_squared[0][8]).set_color("#58C4DD")
        VGroup(half_b_squared[0][4], half_b_squared[0][12]).set_color("#F7D96F")
        half_b_squared.move_to([4.3, 0.9, 0])
        half_b_squared.set_z_index(3)

        # square_root: x+\frac{b}{2a}=\pm\frac{\sqrt{b^2-4ac}}{2a}
        square_root = MathTex(r"x+\frac{b}{2a}=\pm\frac{\sqrt{b^2-4ac}}{2a}")
        VGroup(square_root[0][2], square_root[0][10]).set_color("#58C4DD")
        VGroup(square_root[0][5], square_root[0][14], square_root[0][18]).set_color("#F7D96F")
        square_root[0][7].set_color("#FF862F")
        square_root[0][15].set_color("#FC6255")
        square_root.scale(1.3).move_to([0, 0.4, 0])
        square_root.set_z_index(1)

        # quadratic_formula: x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}
        quadratic_formula = MathTex(r"x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}")
        VGroup(quadratic_formula[0][3], quadratic_formula[0][7]).set_color("#58C4DD")
        VGroup(quadratic_formula[0][11], quadratic_formula[0][15]).set_color("#F7D96F")
        quadratic_formula[0][12].set_color("#FC6255")
        quadratic_formula.scale(1.3).move_to([0, 0.4, 0])

        # discriminant: \Delta=b^2-4ac
        discriminant = MathTex(r"\Delta=b^2-4ac")
        discriminant[0][2:].set_color("#83C167")
        discriminant.scale(1.2).move_to([0, -1.7, 0])
        discriminant.set_z_index(3)

        title_in = Write(title)
        # 0 s – 0.5 s: title write
        self.play(_Part(title_in, 0, 1 / 3), run_time=0.5)
        equation_in = Write(equation)
        # 0.5 s – 1.5 s: title write, equation write
        self.play(_Part(title_in, 1 / 3, 1), _Part(equation_in, 0, 2 / 3), run_time=1)
        # 1.5 s – 2 s: equation write
        self.play(_Part(equation_in, 2 / 3, 1), run_time=0.5)
        # 2 s – 2.3 s
        self.wait(0.3)
        equation_pivot = equation[0][0].get_center()
        # 2.3 s – 3.1 s: equation part
        self.play(
            equation[0][0].animate(rate_func=there_and_back).scale(1.5, about_point=equation_pivot),
            run_time=0.8,
        )
        # 3.1 s – 3.4 s
        self.wait(0.3)
        equation[0][0].set_z_index(2)
        equation[0][1].set_z_index(2)
        equation[0][2].set_z_index(2)
        equation[0][3].set_z_index(2)
        equation[0][4].set_z_index(2)
        equation[0][5].set_z_index(2)
        equation[0][6].set_z_index(2)
        equation[0][7].set_z_index(2)
        equation[0][8].set_z_index(2)
        equation[0][9].set_z_index(2)
        # 3.4 s – 4.6 s: equation → steps
        self.play(
            ReplacementTransform(equation[0][0], steps[0][0]),
            ReplacementTransform(equation[0][1], steps[0][1]),
            ReplacementTransform(equation[0][2], steps[0][2]),
            ReplacementTransform(equation[0][3], steps[0][3]),
            ReplacementTransform(equation[0][4], steps[0][4]),
            ReplacementTransform(equation[0][5], steps[0][5]),
            ReplacementTransform(equation[0][6], steps[0][6]),
            ReplacementTransform(equation[0][7], steps[0][7]),
            ReplacementTransform(equation[0][8], steps[0][8]),
            ReplacementTransform(equation[0][9], steps[0][9]),
            run_time=1.2,
        )
        # 4.6 s – 4.8 s
        self.wait(0.2)
        # 4.8 s – 5.3 s: divide_by_a grow_from_center
        self.play(GrowFromCenter(divide_by_a), run_time=0.5)
        # 5.3 s – 5.6 s
        self.wait(0.3)
        steps_morph = [
            ReplacementTransform(steps[0][1].copy(), steps[0][10]),
            ReplacementTransform(steps[0][2].copy(), steps[0][11]),
            ReplacementTransform(steps[0][3].copy(), steps[0][12]),
            ReplacementTransform(steps[0][4].copy(), steps[0][13]),
            ReplacementTransform(steps[0][5].copy(), steps[0][16]),
            ReplacementTransform(steps[0][6].copy(), steps[0][17]),
            ReplacementTransform(steps[0][7].copy(), steps[0][18]),
            ReplacementTransform(steps[0][8].copy(), steps[0][21]),
            ReplacementTransform(steps[0][9].copy(), steps[0][22]),
            ReplacementTransform(VGroup(steps[0][0]).copy(), VGroup(steps[0][15], steps[0][20])),
        ]
        # 5.6 s – 6 s: steps morph
        self.play(*(_Part(a, 0, 2 / 7) for a in steps_morph), run_time=0.4)
        # 6 s – 6.8 s: steps morph, steps create
        self.play(
            *(_Part(a, 2 / 7, 6 / 7) for a in steps_morph),
            Create(VGroup(steps[0][14], steps[0][19])),
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
            ReplacementTransform(steps[0][10].copy(), steps[0][23]),
            ReplacementTransform(steps[0][11].copy(), steps[0][24]),
            ReplacementTransform(steps[0][12].copy(), steps[0][25]),
            ReplacementTransform(steps[0][13].copy(), steps[0][26]),
            ReplacementTransform(steps[0][14].copy(), steps[0][27]),
            ReplacementTransform(steps[0][15].copy(), steps[0][28]),
            ReplacementTransform(steps[0][16].copy(), steps[0][29]),
            ReplacementTransform(steps[0][21].copy(), steps[0][30]),
            run_time=1,
        )
        # 9 s – 9.2 s
        self.wait(0.2)
        # 9.2 s – 10.6 s: steps morph
        self.play(
            ReplacementTransform(steps[0][17].copy(), steps[0][31], path_arc=-90 * DEGREES, rate_func=slow_into),
            ReplacementTransform(steps[0][18].copy(), steps[0][32], path_arc=-90 * DEGREES, rate_func=slow_into),
            ReplacementTransform(steps[0][19].copy(), steps[0][33], path_arc=-90 * DEGREES, rate_func=slow_into),
            ReplacementTransform(steps[0][20].copy(), steps[0][34], path_arc=-90 * DEGREES, rate_func=slow_into),
            run_time=1.4,
        )
        # 10.6 s – 11 s
        self.wait(0.4)
        # 11 s – 11.8 s: half_b_squared fade_in
        self.play(FadeIn(half_b_squared[0][:7], shift=0.6 * LEFT, scale=0.8), run_time=0.8)
        # 11.8 s – 12 s
        self.wait(0.2)
        # 12 s – 13 s: half_b_squared write
        self.play(Write(half_b_squared[0][7:]), run_time=1)
        # 13 s – 13.2 s
        self.wait(0.2)
        # 13.2 s – 14.2 s: steps morph
        self.play(
            ReplacementTransform(steps[0][23].copy(), steps[0][35]),
            ReplacementTransform(steps[0][24].copy(), steps[0][36]),
            ReplacementTransform(steps[0][25].copy(), steps[0][37]),
            ReplacementTransform(steps[0][26].copy(), steps[0][38]),
            ReplacementTransform(steps[0][27].copy(), steps[0][39]),
            ReplacementTransform(steps[0][28].copy(), steps[0][40]),
            ReplacementTransform(steps[0][29].copy(), steps[0][41]),
            ReplacementTransform(steps[0][30].copy(), steps[0][49]),
            ReplacementTransform(steps[0][31].copy(), steps[0][56]),
            ReplacementTransform(steps[0][32].copy(), steps[0][57]),
            ReplacementTransform(steps[0][33].copy(), steps[0][58]),
            ReplacementTransform(steps[0][34].copy(), steps[0][59]),
            run_time=1,
        )
        # 14.2 s – 14.4 s
        self.wait(0.2)
        half_b_squared_to_steps = [
            ReplacementTransform(half_b_squared[0][8].copy(), steps[0][43]),
            ReplacementTransform(half_b_squared[0][9].copy(), steps[0][44]),
            ReplacementTransform(half_b_squared[0][10].copy(), steps[0][45]),
            ReplacementTransform(half_b_squared[0][11].copy(), steps[0][46]),
            ReplacementTransform(half_b_squared[0][12].copy(), steps[0][47]),
            ReplacementTransform(half_b_squared[0][13].copy(), steps[0][48]),
            ReplacementTransform(half_b_squared[0][8].copy(), steps[0][50]),
            ReplacementTransform(half_b_squared[0][9].copy(), steps[0][51]),
            ReplacementTransform(half_b_squared[0][10].copy(), steps[0][52]),
            ReplacementTransform(half_b_squared[0][11].copy(), steps[0][53]),
            ReplacementTransform(half_b_squared[0][12].copy(), steps[0][54]),
            ReplacementTransform(half_b_squared[0][13].copy(), steps[0][55]),
        ]
        # 14.4 s – 15.2 s: half_b_squared → steps, steps write
        self.play(
            *(_Part(a, 0, 4 / 7) for a in half_b_squared_to_steps),
            Write(steps[0][42]),
            run_time=0.8,
        )
        # 15.2 s – 15.8 s: half_b_squared → steps
        self.play(*(_Part(a, 4 / 7, 1) for a in half_b_squared_to_steps), run_time=0.6)
        # 15.8 s – 16 s
        self.wait(0.2)
        # 16 s – 16.6 s: half_b_squared uncreate, steps part
        self.play(Uncreate(half_b_squared), steps[0][:35].animate.set_opacity(0.35), run_time=0.6)
        # 16.6 s – 17 s
        self.wait(0.4)
        steps_morph_2 = [
            ReplacementTransform(steps[0][35].copy(), steps[0][61], rate_func=double_smooth),
            Transform(steps[0][41].copy(), steps[0][61], rate_func=double_smooth, remover=True),
            ReplacementTransform(steps[0][36].copy(), steps[0][68], rate_func=double_smooth),
            ReplacementTransform(steps[0][37].copy(), steps[0][62], rate_func=double_smooth),
            ReplacementTransform(steps[0][38].copy(), steps[0][63], rate_func=double_smooth),
            ReplacementTransform(steps[0][39].copy(), steps[0][64], rate_func=double_smooth),
            ReplacementTransform(steps[0][40].copy(), steps[0][66], rate_func=double_smooth),
            ReplacementTransform(steps[0][42].copy(), steps[0][65], rate_func=double_smooth),
            Transform(steps[0][43].copy(), steps[0][65], rate_func=double_smooth, remover=True),
            Transform(steps[0][44].copy(), steps[0][65], rate_func=double_smooth, remover=True),
            Transform(steps[0][45].copy(), steps[0][65], rate_func=double_smooth, remover=True),
            Transform(steps[0][46].copy(), steps[0][65], rate_func=double_smooth, remover=True),
            Transform(steps[0][47].copy(), steps[0][65], rate_func=double_smooth, remover=True),
            Transform(steps[0][48].copy(), steps[0][65], rate_func=double_smooth, remover=True),
            ReplacementTransform(steps[0][49].copy(), steps[0][69], rate_func=double_smooth),
            ReplacementTransform(steps[0][50].copy(), steps[0][70], rate_func=double_smooth),
            ReplacementTransform(steps[0][51].copy(), steps[0][71], rate_func=double_smooth),
            ReplacementTransform(steps[0][56].copy(), steps[0][72], rate_func=double_smooth),
            ReplacementTransform(steps[0][53].copy(), steps[0][73], rate_func=double_smooth),
            ReplacementTransform(steps[0][59].copy(), steps[0][74], rate_func=double_smooth),
            ReplacementTransform(steps[0][57].copy(), steps[0][75], rate_func=double_smooth),
            ReplacementTransform(steps[0][52].copy(), steps[0][76], rate_func=double_smooth),
            Transform(steps[0][58].copy(), steps[0][76], rate_func=double_smooth, remover=True),
            ReplacementTransform(steps[0][53].copy(), steps[0][77], rate_func=double_smooth),
            ReplacementTransform(steps[0][54].copy(), steps[0][78], rate_func=double_smooth),
            ReplacementTransform(steps[0][55].copy(), steps[0][79], rate_func=double_smooth),
        ]
        # 17 s – 17.6 s: steps morph
        self.play(*(_Part(a, 0, 0.375) for a in steps_morph_2), run_time=0.6)
        # 17.6 s – 18.4 s: steps morph, steps grow_from_center
        self.play(
            *(_Part(a, 0.375, 0.875) for a in steps_morph_2),
            GrowFromCenter(VGroup(steps[0][60], steps[0][67])),
            run_time=0.8,
        )
        # 18.4 s – 18.6 s: steps morph
        self.play(*(_Part(a, 0.875, 1) for a in steps_morph_2), run_time=0.2)
        # 18.6 s – 19 s
        self.wait(0.4)
        # 19 s – 19.8 s: steps fade_out
        self.play(FadeOut(steps[0][:60], shift=0.5 * UP), run_time=0.8)
        # 19.8 s – 20 s
        self.wait(0.2)
        steps_pivot = steps[0][60:].get_center()
        # 20 s – 21 s: steps part
        self.play(
            steps[0][60:].animate.scale(1.3, about_point=steps_pivot).shift(np.array([0.87, 3.22, 0])),
            run_time=1,
        )
        # 21 s – 21.4 s
        self.wait(0.4)
        steps_to_square_root = [
            ReplacementTransform(steps[0][61], square_root[0][0]),
            ReplacementTransform(steps[0][62], square_root[0][1]),
            ReplacementTransform(steps[0][63], square_root[0][2]),
            ReplacementTransform(steps[0][64], square_root[0][3]),
            ReplacementTransform(steps[0][65], square_root[0][4]),
            ReplacementTransform(steps[0][66], square_root[0][5]),
            ReplacementTransform(steps[0][69], square_root[0][6]),
            FadeTransform(VGroup(steps[0][68]), square_root[0][8:10]),
            ReplacementTransform(steps[0][70], square_root[0][10]),
            ReplacementTransform(steps[0][71], square_root[0][11]),
            ReplacementTransform(steps[0][72], square_root[0][12]),
            ReplacementTransform(steps[0][73], square_root[0][13]),
            ReplacementTransform(steps[0][74], square_root[0][14]),
            ReplacementTransform(steps[0][75], square_root[0][15]),
            ReplacementTransform(steps[0][76], square_root[0][16]),
            FadeTransform(steps[0][77], square_root[0][17]),
            ReplacementTransform(steps[0][78], square_root[0][18]),
            Transform(steps[0][79], square_root[0][18], remover=True),
        ]
        steps_out = FadeOut(VGroup(steps[0][60], steps[0][67]))
        # 21.4 s – 22.4 s: steps → square_root, square_root draw_border_then_fill, steps fade_out
        self.play(
            *(_Part(a, 0, 5 / 6) for a in steps_to_square_root),
            DrawBorderThenFill(square_root[0][7]),
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
            ReplacementTransform(square_root[0][0], quadratic_formula[0][0], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][6], quadratic_formula[0][1], path_arc=-45 * DEGREES),
            FadeTransform(square_root[0][1], quadratic_formula[0][2], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][2], quadratic_formula[0][3], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][7], quadratic_formula[0][4], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][8], quadratic_formula[0][5], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][9], quadratic_formula[0][6], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][10], quadratic_formula[0][7], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][11], quadratic_formula[0][8], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][12], quadratic_formula[0][9], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][13], quadratic_formula[0][10], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][14], quadratic_formula[0][11], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][15], quadratic_formula[0][12], path_arc=-45 * DEGREES),
            ReplacementTransform(square_root[0][3], quadratic_formula[0][13], path_arc=-45 * DEGREES),
            Transform(square_root[0][16], quadratic_formula[0][13], path_arc=-45 * DEGREES, remover=True),
            ReplacementTransform(square_root[0][4], quadratic_formula[0][14], path_arc=-45 * DEGREES),
            Transform(square_root[0][17], quadratic_formula[0][14], path_arc=-45 * DEGREES, remover=True),
            ReplacementTransform(square_root[0][5], quadratic_formula[0][15], path_arc=-45 * DEGREES),
            Transform(square_root[0][18], quadratic_formula[0][15], path_arc=-45 * DEGREES, remover=True),
            run_time=1.5,
        )
        # 25.5 s – 26 s
        self.wait(0.5)
        # 26 s – 27.2 s: quadratic_formula tween
        self.play(quadratic_formula.animate.scale(1.307692).move_to([0, 0.9, 0]), run_time=1.2)
        # 27.2 s – 27.6 s
        self.wait(0.4)
        # 27.6 s – 28.4 s: quadratic_formula part
        self.play(quadratic_formula[0][7:13].animate.set_color("#83C167"), run_time=0.8)
        # 28.4 s – 28.6 s
        self.wait(0.2)
        quadratic_formula_pivot = quadratic_formula[0][4].get_center()
        # 28.6 s – 29.4 s: quadratic_formula part
        self.play(
            _Tween(VGroup(quadratic_formula[0][4]), (quadratic_formula_pivot[0], quadratic_formula_pivot[1], 1, 0, 1, 1), (quadratic_formula_pivot[0], quadratic_formula_pivot[1], 1.6, 20, 1, 1), rate_func=there_and_back),
            run_time=0.8,
        )
        # 29.4 s – 29.8 s
        self.wait(0.4)
        # 29.8 s – 31 s: quadratic_formula → discriminant, discriminant draw_border_then_fill
        self.play(
            ReplacementTransform(quadratic_formula[0][7].copy().set_z_index(3), discriminant[0][2]),
            ReplacementTransform(quadratic_formula[0][8].copy().set_z_index(3), discriminant[0][3]),
            ReplacementTransform(quadratic_formula[0][9].copy().set_z_index(3), discriminant[0][4]),
            ReplacementTransform(quadratic_formula[0][10].copy().set_z_index(3), discriminant[0][5]),
            ReplacementTransform(quadratic_formula[0][11].copy().set_z_index(3), discriminant[0][6]),
            ReplacementTransform(quadratic_formula[0][12].copy().set_z_index(3), discriminant[0][7]),
            DrawBorderThenFill(discriminant[0][:2]),
            run_time=1.2,
        )
        # 31 s – 35 s
        self.wait(4)
        discriminant_out = Uncreate(discriminant)
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
        self.play(Unwrite(title), run_time=1)
