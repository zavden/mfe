# Pair styles — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl PairStyles.py PairStyles -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 1644 frames, like the editor's video export.
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


class PairStyles(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # source: a+b
        source = Tex(r"a+b", font_size=197.9776)
        source_g = _glyphs(source, [
            (-1.0744, -0.1166, 0.6095, 0.5812), (0.0477, -0.0715, 0.8582, 0.857), (1.133, 0.0457, 0.4923, 0.9085),
        ])
        source_g[0].set_color("#F4C867")
        source_g[2].set_color("#58C4DD")
        source.move_to([0, 1.9, 0])
        source.set_z_index(1)

        # target: \alpha+\beta
        target = Tex(r"\alpha+\beta", font_size=197.9776)
        target_g = _glyphs(target, [
            (-1.0191, -0.0445, 0.6329, 0.5039), (0.0184, -0.0056, 0.7408, 0.7397), (1.0297, 0, 0.6118, 1),
        ])
        target_g[0].set_color("#F4C867")
        target_g[2].set_color("#58C4DD")
        target.move_to([0, -1.9, 0])

        # source: a+b
        source_2 = Tex(r"a+b", font_size=197.9776)
        source_2_g = _glyphs(source_2, [
            (-1.0744, -0.1166, 0.6095, 0.5812), (0.0477, -0.0715, 0.8582, 0.857), (1.133, 0.0457, 0.4923, 0.9085),
        ])
        source_2_g[0].set_color("#F4C867")
        source_2_g[2].set_color("#58C4DD")
        source_2.move_to([0, 1.9, 0])
        source_2.set_z_index(1)

        # target: \alpha+\beta
        target_2 = Tex(r"\alpha+\beta", font_size=197.9776)
        target_2_g = _glyphs(target_2, [
            (-1.0191, -0.0445, 0.6329, 0.5039), (0.0184, -0.0056, 0.7408, 0.7397), (1.0297, 0, 0.6118, 1),
        ])
        target_2_g[0].set_color("#F4C867")
        target_2_g[2].set_color("#58C4DD")
        target_2.move_to([0, -1.9, 0])

        # source: a+b
        source_3 = Tex(r"a+b", font_size=197.9776)
        source_3_g = _glyphs(source_3, [
            (-1.0744, -0.1166, 0.6095, 0.5812), (0.0477, -0.0715, 0.8582, 0.857), (1.133, 0.0457, 0.4923, 0.9085),
        ])
        source_3_g[0].set_color("#F4C867")
        source_3_g[2].set_color("#58C4DD")
        source_3.move_to([0, 1.9, 0])
        source_3.set_z_index(1)

        # target: \alpha+\beta
        target_3 = Tex(r"\alpha+\beta", font_size=197.9776)
        target_3_g = _glyphs(target_3, [
            (-1.0191, -0.0445, 0.6329, 0.5039), (0.0184, -0.0056, 0.7408, 0.7397), (1.0297, 0, 0.6118, 1),
        ])
        target_3_g[0].set_color("#F4C867")
        target_3_g[2].set_color("#58C4DD")
        target_3.move_to([0, -1.9, 0])

        # source: a+b
        source_4 = Tex(r"a+b", font_size=197.9776)
        source_4_g = _glyphs(source_4, [
            (-1.0744, -0.1166, 0.6095, 0.5812), (0.0477, -0.0715, 0.8582, 0.857), (1.133, 0.0457, 0.4923, 0.9085),
        ])
        source_4_g[0].set_color("#F4C867")
        source_4_g[2].set_color("#58C4DD")
        source_4.move_to([0, 1.9, 0])
        source_4.set_z_index(1)

        # target: \alpha+\beta
        target_4 = Tex(r"\alpha+\beta", font_size=197.9776)
        target_4_g = _glyphs(target_4, [
            (-1.0191, -0.0445, 0.6329, 0.5039), (0.0184, -0.0056, 0.7408, 0.7397), (1.0297, 0, 0.6118, 1),
        ])
        target_4_g[0].set_color("#F4C867")
        target_4_g[2].set_color("#58C4DD")
        target_4.move_to([0, -1.9, 0])

        # source: a+b
        source_5 = Tex(r"a+b", font_size=197.9776)
        source_5_g = _glyphs(source_5, [
            (-1.0744, -0.1166, 0.6095, 0.5812), (0.0477, -0.0715, 0.8582, 0.857), (1.133, 0.0457, 0.4923, 0.9085),
        ])
        source_5_g[0].set_color("#F4C867")
        source_5_g[2].set_color("#58C4DD")
        source_5.move_to([0, 1.9, 0])
        source_5.set_z_index(1)

        # target: \alpha+\beta
        target_5 = Tex(r"\alpha+\beta", font_size=197.9776)
        target_5_g = _glyphs(target_5, [
            (-1.0191, -0.0445, 0.6329, 0.5039), (0.0184, -0.0056, 0.7408, 0.7397), (1.0297, 0, 0.6118, 1),
        ])
        target_5_g[0].set_color("#F4C867")
        target_5_g[2].set_color("#58C4DD")
        target_5.move_to([0, -1.9, 0])

        # 0 s – 0.8 s: source write
        self.play(Write(VGroup(*source_g[:]), stroke_color="#FFFFFF"), run_time=0.8)
        # 0.8 s – 1.8 s
        self.wait(1)
        # 1.8 s – 3.4 s: source → target
        self.play(
            ReplacementTransform(source_g[0], target_g[0]),
            ReplacementTransform(source_g[1], target_g[1]),
            ReplacementTransform(source_g[2], target_g[2]),
            run_time=1.6,
        )
        # 3.4 s – 4.4 s
        self.wait(1)
        # 4.4 s – 5 s: target fade_out
        self.play(FadeOut(target), run_time=0.6)
        # 5 s – 5.6 s
        self.wait(0.6)
        # 5.6 s – 6.4 s: source_2 write
        self.play(Write(VGroup(*source_2_g[:]), stroke_color="#FFFFFF"), run_time=0.8)
        # 6.4 s – 7.4 s
        self.wait(1)
        # 7.4 s – 9 s: source_2 → target_2
        self.play(
            TransformFromCopy(source_2_g[0], target_2_g[0]),
            TransformFromCopy(source_2_g[1], target_2_g[1]),
            TransformFromCopy(source_2_g[2], target_2_g[2]),
            run_time=1.6,
        )
        # 9 s – 10 s
        self.wait(1)
        # 10 s – 10.6 s: source_2 fade_out, target_2 fade_out
        self.play(FadeOut(source_2), FadeOut(target_2), run_time=0.6)
        # 10.6 s – 11.2 s
        self.wait(0.6)
        # 11.2 s – 12 s: source_3 write
        self.play(Write(VGroup(*source_3_g[:]), stroke_color="#FFFFFF"), run_time=0.8)
        # 12 s – 13 s
        self.wait(1)
        # 13 s – 14.6 s: source_3 → target_3
        self.play(
            FadeTransform(source_3_g[0], target_3_g[0]),
            FadeTransform(source_3_g[1], target_3_g[1]),
            FadeTransform(source_3_g[2], target_3_g[2]),
            run_time=1.6,
        )
        # 14.6 s – 15.6 s
        self.wait(1)
        # 15.6 s – 16.2 s: target_3 fade_out
        self.play(FadeOut(target_3), run_time=0.6)
        # 16.2 s – 16.8 s
        self.wait(0.6)
        # 16.8 s – 17.6 s: source_4 write
        self.play(Write(VGroup(*source_4_g[:]), stroke_color="#FFFFFF"), run_time=0.8)
        # 17.6 s – 18.6 s
        self.wait(1)
        # 18.6 s – 20.2 s: source_4 → target_4
        self.play(
            FadeTransform(source_4_g[0].copy(), target_4_g[0]),
            FadeTransform(source_4_g[1].copy(), target_4_g[1]),
            FadeTransform(source_4_g[2].copy(), target_4_g[2]),
            run_time=1.6,
        )
        # 20.2 s – 21.2 s
        self.wait(1)
        # 21.2 s – 21.8 s: source_4 fade_out, target_4 fade_out
        self.play(FadeOut(source_4), FadeOut(target_4), run_time=0.6)
        # 21.8 s – 22.4 s
        self.wait(0.6)
        # 22.4 s – 23.2 s: source_5 write
        self.play(Write(VGroup(*source_5_g[:]), stroke_color="#FFFFFF"), run_time=0.8)
        # 23.2 s – 24.2 s
        self.wait(1)
        # 24.2 s – 25.8 s: source_5 → target_5
        self.play(
            ReplacementTransform(source_5_g[0], target_5_g[0]),
            TransformFromCopy(source_5_g[1], target_5_g[1]),
            FadeTransform(source_5_g[2], target_5_g[2]),
            run_time=1.6,
        )
        # 25.8 s – 26.8 s
        self.wait(1)
        # 26.8 s – 27.4 s: source_5 fade_out, target_5 fade_out
        self.play(FadeOut(VGroup(source_5_g[1])), FadeOut(target_5), run_time=0.6)
