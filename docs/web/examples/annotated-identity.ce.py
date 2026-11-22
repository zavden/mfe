# An identity with braces and arrows — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 AnIdentityWithBracesAndArrows.py AnIdentityWithBracesAndArrows
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 660 frames, like the editor's video export.
from manim import *


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


class _TraceArrow(Animation):
    """A bent arrow drawn along its own way, from its start (Manim's GrowArrow scales the
    arrow about that point): its tip leads the stroke and turns with it, grown out of the
    start over the first quarter of the way; the tip at the start of a double arrow grows
    where it is."""

    def __init__(self, arrow, **kwargs):
        super().__init__(arrow, introducer=True, **kwargs)

    def along(self, alpha):
        """The point of the shaft at that part of its curves, and the way it runs there."""
        points = self.starting_mobject.points
        index, t = integer_interpolate(0, len(points) // 4, alpha)
        curve = points[4 * index:4 * index + 4]
        return bezier(curve)(t), bezier(curve[1:] - curve[:-1])(t)

    def interpolate_submobject(self, submob, start, alpha):
        if submob is self.mobject:
            submob.pointwise_become_partial(start, 0, alpha)
            return
        base = start.base
        submob.set_points(start.points)
        if submob is self.mobject.tip:
            (at, way), (_, ahead) = self.along(alpha), self.along(1)
            if min(np.linalg.norm(way), np.linalg.norm(ahead)) > 1e-8:
                submob.rotate(angle_of_vector(way) - angle_of_vector(ahead), about_point=base)
            submob.shift(at - base)
            base = at
        submob.scale(min(1, 4 * alpha), about_point=base)


class AnIdentityWithBracesAndArrows(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # identity: a^2 - b^2 = (a - b)(a + b)
        identity = MathTex(r"a^2 - b^2 = (a - b)(a + b)", font_size=96)
        identity_g = _glyphs(identity, [
            (-4.2787, -0.0895, 0.4172, 0.3978), (-3.8652, 0.2924, 0.2488, 0.4153), (-3.1258, -0.059, 0.538, 0.0353), (-2.383, 0.0217, 0.3369, 0.6218),
            (-2.0237, 0.2924, 0.2488, 0.4153), (-1.2353, -0.059, 0.5874, 0.2064), (-0.459, -0.059, 0.2108, 0.8819), (-0.0665, -0.0895, 0.4172, 0.3978),
            (0.7014, -0.059, 0.538, 0.0353), (1.4443, 0.0217, 0.3369, 0.6218), (1.7728, -0.059, 0.2108, 0.8819), (2.1503, -0.059, 0.2108, 0.8819),
            (2.5427, -0.0895, 0.4172, 0.3978), (3.3106, -0.0586, 0.5874, 0.5865), (4.0534, 0.0217, 0.3369, 0.6218), (4.3819, -0.059, 0.2108, 0.8819),
        ])
        identity.move_to([0, 0.4, 0])

        # b1: brace, built on identity where its clip starts

        # f2: \text{difference of squares}
        f2 = MathTex(r"\text{difference of squares}")
        f2_g = _glyphs(f2, [
            (-4.5128, 0.096, 0.5573, 0.7849), (-4.0545, 0.0879, 0.2547, 0.7442), (-3.6802, 0.1079, 0.3849, 0.7842), (-3.3398, 0.1079, 0.3849, 0.7842),
            (-2.9744, -0.0412, 0.4305, 0.5106), (-2.5133, -0.038, 0.3826, 0.4924), (-2.0445, -0.0412, 0.4305, 0.5106), (-1.4816, -0.038, 0.5751, 0.4924),
            (-0.9288, -0.0415, 0.4238, 0.5113), (-0.4383, -0.0412, 0.4305, 0.5106), (0.3648, -0.0406, 0.4928, 0.5095), (0.8648, 0.1079, 0.3849, 0.7842),
            (1.48, -0.0412, 0.3626, 0.5106), (2.0161, -0.1463, 0.5584, 0.7075), (2.6029, -0.0441, 0.5751, 0.5046), (3.1991, -0.0412, 0.5106, 0.5106),
            (3.6758, -0.038, 0.3826, 0.4924), (4.1446, -0.0412, 0.4305, 0.5106), (4.6101, -0.0412, 0.3626, 0.5106),
        ])
        f2.set_z_index(5)

        # b2: brace, built on identity where its clip starts

        # f3: \text{a product}
        f3 = MathTex(r"\text{a product}")
        f3_g = _glyphs(f3, [
            (-2.0221, -0.0358, 0.5165, 0.5165), (-1.1697, -0.1418, 0.5649, 0.7164), (-0.633, -0.0326, 0.3871, 0.4981), (-0.1272, -0.0353, 0.4985, 0.5154),
            (0.4749, 0.103, 0.5638, 0.7941), (1.0994, -0.0388, 0.5818, 0.5105), (1.6587, -0.0362, 0.4287, 0.5173), (2.1032, 0.0587, 0.3545, 0.7033),
        ])
        f3.set_z_index(3)

        # l1: arrow, built on identity and identity where its clip starts

        # 0 s – 1.8 s: identity write
        self.play(Write(VGroup(*identity_g[:])), run_time=1.8)
        # 1.8 s – 2.6 s
        self.wait(0.8)
        b1 = Brace(VGroup(*identity_g[:5]), DOWN, buff=0.2, color="#58C4DD")
        b1.set_z_index(4)
        b1.put_at_tip(f2, buff=0.25)
        # 2.6 s – 3.6 s: b1 grow_from_center, f2 fade_in
        self.play(GrowFromCenter(b1), FadeIn(f2), run_time=1)
        # 3.6 s – 4.4 s
        self.wait(0.8)
        b2 = Brace(VGroup(*identity_g[6:]), DOWN, buff=0.2, color="#83C167")
        b2.set_z_index(2)
        b2.put_at_tip(f3, buff=0.25)
        # 4.4 s – 5.4 s: b2 grow_from_center, f3 fade_in
        self.play(GrowFromCenter(b2), FadeIn(f3), run_time=1)
        # 5.4 s – 6.4 s
        self.wait(1)
        l1 = Arrow(VGroup(*identity_g[:5]).get_top(), VGroup(*identity_g[6:]).get_top(), path_arc=-55 * DEGREES)
        l1.set_z_index(1)
        # 6.4 s – 7.8 s: l1 grow_arrow
        self.play(_TraceArrow(l1), run_time=1.4)
        # 7.8 s – 11 s
        self.wait(3.2)
