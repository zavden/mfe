# Outros side by side — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl OutrosSideBySide.py OutrosSideBySide -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 270 frames, like the editor's video export.
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


class OutrosSideBySide(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # formula_none: a^2 + b^2 = c^2
        formula_none = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_none_g = _glyphs(formula_none, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_none.move_to([-4.75, 1.8, 0])
        formula_none.set_z_index(9)

        # label_none: \text{None (disappear)}
        label_none = Tex(r"\text{None (disappear)}", font_size=41.2453)
        label_none.set_color("#BBBBBB")
        label_none_g = _glyphs(label_none, [
            (-3.3175, 0.0915, 0.699, 0.683), (-2.6925, -0.031, 0.443, 0.458), (-2.1585, -0.0287, 0.517, 0.4427), (-1.6645, -0.0315, 0.387, 0.459),
            (-0.9785, 0, 0.239, 1), (-0.5185, 0.0918, 0.501, 0.7057), (-0.1065, 0.0845, 0.229, 0.669), (0.227, -0.0315, 0.326, 0.459),
            (0.6885, -0.0315, 0.459, 0.459), (1.196, -0.1257, 0.502, 0.6367), (1.752, -0.1257, 0.502, 0.6367), (2.2585, -0.0315, 0.387, 0.459),
            (2.7445, -0.0315, 0.459, 0.459), (3.173, -0.0287, 0.344, 0.4427), (3.5475, 0, 0.239, 1),
        ])
        label_none.move_to([-4.75, 0.55, 0])
        label_none.set_z_index(8)

        # formula_unwrite: a^2 + b^2 = c^2
        formula_unwrite = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_unwrite_g = _glyphs(formula_unwrite, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_unwrite.move_to([0, 1.8, 0])
        formula_unwrite.set_z_index(7)

        # label_unwrite: \text{Unwrite}
        label_unwrite = Tex(r"\text{Unwrite}", font_size=41.2453)
        label_unwrite.set_color("#BBBBBB")
        label_unwrite_g = _glyphs(label_unwrite, [
            (-1.9702, 0, 0.9915, 1), (-1.0355, -0.1548, 0.7333, 0.6279), (-0.1376, -0.1709, 0.9716, 0.627), (0.6475, -0.1548, 0.4879, 0.6279),
            (1.1305, 0.0057, 0.3248, 0.9489), (1.5745, -0.0397, 0.4468, 0.8865), (2.1915, -0.1589, 0.5489, 0.6511),
        ])
        label_unwrite.move_to([0, 0.55, 0])
        label_unwrite.set_z_index(6)

        # formula_fade_out: a^2 + b^2 = c^2
        formula_fade_out = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_fade_out_g = _glyphs(formula_fade_out, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_fade_out.move_to([4.75, 1.8, 0])
        formula_fade_out.set_z_index(5)

        # label_fadeout: \text{FadeOut}
        label_fadeout = Tex(r"\text{FadeOut}", font_size=41.2453)
        label_fadeout.set_color("#BBBBBB")
        label_fadeout_g = _glyphs(label_fadeout, [
            (-2.2037, -0.0011, 0.8032, 0.9336), (-1.3812, -0.168, 0.6302, 0.6302), (-0.6659, 0.0014, 0.6879, 0.9689), (0.011, -0.168, 0.5314, 0.6302),
            (0.8506, 0, 0.9144, 1), (1.7739, -0.1716, 0.7098, 0.6229), (2.389, -0.0526, 0.4325, 0.8581),
        ])
        label_fadeout.move_to([4.75, 0.55, 0])
        label_fadeout.set_z_index(4)

        # formula_shrink_to_center: a^2 + b^2 = c^2
        formula_shrink_to_center = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_shrink_to_center_g = _glyphs(formula_shrink_to_center, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_shrink_to_center.move_to([-2.4, -1.6, 0])
        formula_shrink_to_center.set_z_index(3)

        # label_shrinktocenter: \text{ShrinkToCenter}
        label_shrinktocenter = Tex(r"\text{ShrinkToCenter}", font_size=41.2453)
        label_shrinktocenter.set_color("#BBBBBB")
        label_shrinktocenter_g = _glyphs(label_shrinktocenter, [
            (-4.4752, 0, 0.6121, 1), (-3.7022, 0.008, 0.7111, 0.9555), (-3.0633, -0.1653, 0.4732, 0.6089), (-2.5949, -0.0096, 0.315, 0.9202),
            (-2.0158, -0.1653, 0.7111, 0.6089), (-1.2758, 0.008, 0.6754, 0.9555), (-0.4188, -0.0041, 0.8927, 0.9312), (0.4216, -0.1685, 0.6094, 0.63),
            (1.2627, 0.0007, 0.8391, 0.9986), (2.064, -0.1692, 0.5323, 0.6314), (2.76, -0.1653, 0.7111, 0.6089), (3.3762, -0.0536, 0.4333, 0.8597),
            (3.9746, -0.1692, 0.5323, 0.6314), (4.5447, -0.1653, 0.4732, 0.6089),
        ])
        label_shrinktocenter.move_to([-2.4, -2.85, 0])
        label_shrinktocenter.set_z_index(2)

        # formula_uncreate: a^2 + b^2 = c^2
        formula_uncreate = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_uncreate_g = _glyphs(formula_uncreate, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_uncreate.move_to([2.4, -1.6, 0])
        formula_uncreate.set_z_index(1)

        # label_uncreate: \text{Uncreate}
        label_uncreate = Tex(r"\text{Uncreate}", font_size=41.2453)
        label_uncreate.set_color("#BBBBBB")
        label_uncreate_g = _glyphs(label_uncreate, [
            (-2.2454, 0, 0.9915, 1), (-1.3106, -0.1548, 0.7333, 0.6279), (-0.6057, -0.1593, 0.5404, 0.652), (-0.022, -0.1548, 0.4879, 0.6279),
            (0.5759, -0.1589, 0.5489, 0.6511), (1.2652, -0.1589, 0.6511, 0.6511), (1.8496, -0.0397, 0.4468, 0.8865), (2.4667, -0.1589, 0.5489, 0.6511),
        ])
        label_uncreate.move_to([2.4, -2.85, 0])

        self.add(formula_unwrite)
        self.add(label_uncreate)
        self.add(label_unwrite)
        self.add(label_fadeout)
        self.add(formula_uncreate)
        self.add(label_shrinktocenter)
        self.add(formula_none)
        self.add(formula_shrink_to_center)
        self.add(label_none)
        self.add(formula_fade_out)
        # 0 s – 2.5 s
        self.wait(2.5)
        # 2.5 s – 3.5 s: formula_unwrite unwrite, formula_uncreate uncreate, formula_shrink_to_center shrink_to_center, formula_fade_out fade_out
        self.play(
            _Unwrite(VGroup(*formula_unwrite_g[:]), stroke_color="#FFFFFF"),
            Uncreate(VGroup(*formula_uncreate_g[:])),
            ShrinkToCenter(formula_shrink_to_center, remover=True),
            FadeOut(formula_fade_out),
            run_time=1,
        )
        self.remove(formula_none)
        # 3.5 s – 4.5 s
        self.wait(1)
