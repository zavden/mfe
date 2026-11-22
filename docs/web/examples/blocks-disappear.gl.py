# Disappear blocks — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl DisappearBlocks.py DisappearBlocks -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 960 frames, like the editor's video export.
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


class DisappearBlocks(Scene):
    default_camera_config = dict(background_color="#070B15")

    def construct(self):

        # eq: y = ax^2 + bx + c
        eq = Tex(r"y = ax^2 + bx + c", font_size=136.1096)
        eq_g = _glyphs(eq, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])

        # eq: y = ax^2 + bx + c
        eq_2 = Tex(r"y = ax^2 + bx + c", font_size=136.1096)
        eq_2_g = _glyphs(eq_2, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])

        # eq: y = ax^2 + bx + c
        eq_3 = Tex(r"y = ax^2 + bx + c", font_size=136.1096)
        eq_3_g = _glyphs(eq_3, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])

        # eq: y = ax^2 + bx + c
        eq_4 = Tex(r"y = ax^2 + bx + c", font_size=136.1096)
        eq_4_g = _glyphs(eq_4, [
            (-3.095, -0.2026, 0.4368, 0.5948), (-2.2703, -0.0821, 0.6116, 0.2149), (-1.4104, -0.1138, 0.4344, 0.4142), (-0.9163, -0.1138, 0.4473, 0.416),
            (-0.4545, 0.2838, 0.2591, 0.4324), (0.3154, -0.0817, 0.6116, 0.6107), (1.089, 0.0019, 0.3508, 0.6475), (1.5266, -0.1138, 0.4473, 0.416),
            (2.3575, -0.0817, 0.6116, 0.6107), (3.1317, -0.1144, 0.3634, 0.4173),
        ])

        self.add(eq)
        # 0 s – 1 s
        self.wait(1)
        # 1 s – 2 s: eq fade_out
        self.play(FadeOut(VGroup(*eq_g[2:])), run_time=1)
        # 2 s – 4 s
        self.wait(2)
        self.remove(eq_g[0], eq_g[1])
        self.add(eq_2)
        # 4 s – 5 s
        self.wait(1)
        # 5 s – 6 s: eq_2 unwrite
        self.play(_Unwrite(VGroup(*eq_2_g[2:]), stroke_color="#FFFFFF"), run_time=1)
        # 6 s – 8 s
        self.wait(2)
        self.remove(eq_2_g[0], eq_2_g[1])
        self.add(eq_3)
        # 8 s – 9 s
        self.wait(1)
        # 9 s – 10 s: eq_3 uncreate
        self.play(Uncreate(VGroup(*eq_3_g[2:])), run_time=1)
        # 10 s – 12 s
        self.wait(2)
        self.remove(eq_3_g[0], eq_3_g[1])
        self.add(eq_4)
        # 12 s – 13 s
        self.wait(1)
        # 13 s – 14 s: eq_4 shrink_to_center
        self.play(ShrinkToCenter(VGroup(*eq_4_g[2:]), remover=True), run_time=1)
        # 14 s – 16 s
        self.wait(2)
