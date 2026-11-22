# Four styles of Morph — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl FourStylesOfMorph.py FourStylesOfMorph -w -r 1920x1080 --fps 60
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


class FourStylesOfMorph(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # copy: a + b \\ b + a
        copy = Tex(r"""a + b \\
  b + a""", font_size=98.9888)
        copy.set_color("#58C4DD")
        copy_g = _glyphs(copy, [
            (-0.4016, 0.2695, 0.2278, 0.2172), (0.0178, 0.2864, 0.3208, 0.3203), (0.4235, 0.3302, 0.184, 0.3396), (-0.4201, -0.296, 0.184, 0.3396),
            (-0.0303, -0.3398, 0.3208, 0.3203), (0.3939, -0.3567, 0.2278, 0.2172),
        ])
        copy.move_to([-5.1, 0, 0])
        copy.set_z_index(3)

        # transform: a + b \\ b + a
        transform = Tex(r"""a + b \\
  b + a""", font_size=98.9888)
        transform.set_color("#83C167")
        transform_g = _glyphs(transform, [
            (-0.4016, 0.2695, 0.2278, 0.2172), (0.0178, 0.2864, 0.3208, 0.3203), (0.4235, 0.3302, 0.184, 0.3396), (-0.4201, -0.296, 0.184, 0.3396),
            (-0.0303, -0.3398, 0.3208, 0.3203), (0.3939, -0.3567, 0.2278, 0.2172),
        ])
        transform.move_to([-1.7, 0, 0])
        transform.set_z_index(2)

        # fade transform: a + b \\ b + a
        fade_transform = Tex(r"""a + b \\
  b + a""", font_size=98.9888)
        fade_transform.set_color("#F4C867")
        fade_transform_g = _glyphs(fade_transform, [
            (-0.4016, 0.2695, 0.2278, 0.2172), (0.0178, 0.2864, 0.3208, 0.3203), (0.4235, 0.3302, 0.184, 0.3396), (-0.4201, -0.296, 0.184, 0.3396),
            (-0.0303, -0.3398, 0.3208, 0.3203), (0.3939, -0.3567, 0.2278, 0.2172),
        ])
        fade_transform.move_to([1.7, 0, 0])
        fade_transform.set_z_index(1)

        # fade copy: a + b \\ b + a
        fade_copy = Tex(r"""a + b \\
  b + a""", font_size=98.9888)
        fade_copy.set_color("#9A72AC")
        fade_copy_g = _glyphs(fade_copy, [
            (-0.4016, 0.2695, 0.2278, 0.2172), (0.0178, 0.2864, 0.3208, 0.3203), (0.4235, 0.3302, 0.184, 0.3396), (-0.4201, -0.296, 0.184, 0.3396),
            (-0.0303, -0.3398, 0.3208, 0.3203), (0.3939, -0.3567, 0.2278, 0.2172),
        ])
        fade_copy.move_to([5.1, 0, 0])

        # 0 s – 0.8 s: copy fade_in, fade_transform fade_in, fade_copy fade_in, transform fade_in
        self.play(
            FadeIn(VGroup(*copy_g[:3])),
            FadeIn(VGroup(*fade_transform_g[:3])),
            FadeIn(VGroup(*fade_copy_g[:3])),
            FadeIn(VGroup(*transform_g[:3])),
            run_time=0.8,
        )
        # 0.8 s – 1.6 s
        self.wait(0.8)
        # 1.6 s – 3.2 s: copy morph, fade_transform morph, fade_copy morph, transform morph
        self.play(
            TransformFromCopy(copy_g[0], copy_g[5]),
            TransformFromCopy(copy_g[1], copy_g[4]),
            TransformFromCopy(copy_g[2], copy_g[3]),
            FadeTransform(fade_transform_g[0], fade_transform_g[5]),
            FadeTransform(fade_transform_g[1], fade_transform_g[4]),
            FadeTransform(fade_transform_g[2], fade_transform_g[3]),
            FadeTransform(fade_copy_g[0].copy(), fade_copy_g[5]),
            FadeTransform(fade_copy_g[1].copy(), fade_copy_g[4]),
            FadeTransform(fade_copy_g[2].copy(), fade_copy_g[3]),
            ReplacementTransform(transform_g[0], transform_g[5]),
            ReplacementTransform(transform_g[1], transform_g[4]),
            ReplacementTransform(transform_g[2], transform_g[3]),
            run_time=1.6,
        )
        # 3.2 s – 5.4 s
        self.wait(2.2)
        # 5.4 s – 6 s: copy fade_out, fade_transform fade_out, fade_copy fade_out, transform fade_out
        self.play(
            FadeOut(copy),
            FadeOut(VGroup(*fade_transform_g[3:])),
            FadeOut(fade_copy),
            FadeOut(VGroup(*transform_g[3:])),
            run_time=0.6,
        )
