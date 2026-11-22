# Emphasis blocks — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl EmphasisBlocks.py EmphasisBlocks -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 1200 frames, like the editor's video export.
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


class _Wiggle(Animation):
    """ManimCE's Wiggle about a pivot fixed when it begins: Manim reads the centre again while it
    moves the glyphs one by one, which drifts it, and ManimGL's WiggleOutThenIn refuses an
    array pivot."""

    def __init__(self, mobject, scale_value=1.1, rotation_angle=0.01 * TAU, n_wiggles=6, **kwargs):
        self.scale_value, self.rotation_angle, self.n_wiggles = scale_value, rotation_angle, n_wiggles
        super().__init__(mobject, **kwargs)

    def begin(self):
        # A copy: ManimGL's get_center() is a view into the bounding box, which scale and
        # rotate rewrite in place.
        self.pivot = np.array(self.mobject.get_center())
        super().begin()

    def interpolate_submobject(self, submob, start, alpha):
        submob.match_points(start)
        submob.scale(interpolate(1, self.scale_value, there_and_back(alpha)), about_point=self.pivot)
        submob.rotate(wiggle(alpha, self.n_wiggles) * self.rotation_angle, about_point=self.pivot)


class _Circumscribe(ShowPassingFlash):
    """ManimCE's Circumscribe for both libraries: a rectangle around the mobject as it is when the
    animation is made, traced and untraced in one pass, on the layer `z_index` names."""

    def __init__(self, mobject, buff=0.1, color="#FFFF00", stroke_width=4, time_width=0.3,
                 z_index=0, **kwargs):
        frame = SurroundingRectangle(mobject, buff=buff, color=color, stroke_width=stroke_width)
        frame.set_z_index(z_index)
        super().__init__(frame, time_width=time_width, **kwargs)


class EmphasisBlocks(Scene):
    default_camera_config = dict(background_color="#070B15")

    def construct(self):

        # eq: a^2 + b^2 = c^2
        eq = Tex(r"a^2 + b^2 = c^2", font_size=173.2304)
        eq_g = _glyphs(eq, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])

        # eq: a^2 + b^2 = c^2
        eq_2 = Tex(r"a^2 + b^2 = c^2", font_size=173.2304)
        eq_2_g = _glyphs(eq_2, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])

        # eq: a^2 + b^2 = c^2
        eq_3 = Tex(r"a^2 + b^2 = c^2", font_size=173.2304)
        eq_3_g = _glyphs(eq_3, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])

        # eq: a^2 + b^2 = c^2
        eq_4 = Tex(r"a^2 + b^2 = c^2", font_size=173.2304)
        eq_4_g = _glyphs(eq_4, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])

        # eq: a^2 + b^2 = c^2
        eq_5 = Tex(r"a^2 + b^2 = c^2", font_size=173.2304)
        eq_5_g = _glyphs(eq_5, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])

        self.add(eq)
        # 0 s – 1 s
        self.wait(1)
        # 1 s – 2 s: eq indicate
        self.play(Indicate(VGroup(eq_g[6], eq_g[7])), run_time=1)
        # 2 s – 4 s
        self.wait(2)
        self.remove(eq)
        self.add(eq_2)
        # 4 s – 5 s
        self.wait(1)
        # 5 s – 7 s: eq_2 wiggle
        self.play(
            _Wiggle(VGroup(eq_2_g[3], eq_2_g[4]), scale_value=1.2, rotation_angle=10 * DEGREES),
            run_time=2,
        )
        # 7 s – 8 s
        self.wait(1)
        self.remove(eq_2)
        self.add(eq_3)
        # 8 s – 9 s
        self.wait(1)
        # 9 s – 10 s: eq_3 circumscribe
        self.play(_Circumscribe(VGroup(*eq_3_g[:5])), run_time=1)
        # 10 s – 12 s
        self.wait(2)
        self.remove(eq_3)
        self.add(eq_4)
        # 12 s – 13 s
        self.wait(1)
        # 13 s – 14 s: eq_4 flash
        self.play(Flash(eq_4_g[5].get_center()), run_time=1)
        # 14 s – 16 s
        self.wait(2)
        self.remove(eq_4)
        self.add(eq_5)
        # 16 s – 17 s
        self.wait(1)
        eq_5_focus = FocusOn(VGroup(eq_5_g[6], eq_5_g[7]).get_center(), color="#F4C867", opacity=0.35)
        eq_5_focus.mobject.set_z_index(1)
        # 17 s – 19 s: eq_5 focus on
        self.play(eq_5_focus, run_time=2)
        # 19 s – 20 s
        self.wait(1)
