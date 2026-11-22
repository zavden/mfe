# Text title — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl Pinned.py Pinned -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 420 frames, like the editor's video export.
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


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # title: Completing the square: start from $x^2+bx+c$
        title = TexText(r"\parbox{124.2pt}{\centering Completing the square: start from $x^2+bx+c$\par}")
        title_g = _glyphs(title, [
            (-2.3773, 0.3172, 0.3063, 0.3657), (-2.0698, 0.2553, 0.2228, 0.2309), (-1.7313, 0.2565, 0.3929, 0.2223), (-1.3865, 0.2077, 0.248, 0.3199),
            (-1.1727, 0.3199, 0.1117, 0.3491), (-0.994, 0.2553, 0.1947, 0.2309), (-0.7936, 0.2973, 0.1574, 0.3149), (-0.6158, 0.3136, 0.1076, 0.3365),
            (-0.4039, 0.2565, 0.253, 0.2223), (-0.1381, 0.2075, 0.2299, 0.3315), (0.2404, 0.2973, 0.1574, 0.3149), (0.4903, 0.3199, 0.253, 0.3491),
            (0.7386, 0.2553, 0.1947, 0.2309), (1.1173, 0.2553, 0.1645, 0.2309), (1.3579, 0.2077, 0.248, 0.3199), (1.6249, 0.2538, 0.253, 0.2279),
            (1.8963, 0.2553, 0.2269, 0.2309), (2.1119, 0.2565, 0.169, 0.2223), (2.3217, 0.2553, 0.1947, 0.2309), (2.5038, 0.2538, 0.0533, 0.2168),
            (-2.323, -0.3483, 0.1645, 0.2309), (-2.1352, -0.3063, 0.1574, 0.3149), (-1.8933, -0.3483, 0.2269, 0.2309), (-1.6777, -0.3471, 0.169, 0.2223),
            (-1.491, -0.3063, 0.1574, 0.3149), (-1.1179, -0.2809, 0.163, 0.3546), (-0.9637, -0.3471, 0.169, 0.2223), (-0.7398, -0.3483, 0.2228, 0.2309),
            (-0.4013, -0.3471, 0.3929, 0.2223), (0.1129, -0.3498, 0.2505, 0.2279), (0.3605, -0.1588, 0.1556, 0.2338), (0.7934, -0.3325, 0.3345, 0.335),
            (1.2172, -0.2865, 0.1851, 0.3546), (1.4567, -0.3498, 0.2505, 0.2279), (1.9116, -0.3325, 0.3345, 0.335), (2.3376, -0.3498, 0.1957, 0.2279),
        ])
        VGroup(*title_g[13:19]).set_color("#FFFF00")
        title.move_to([0, 1.2, 0])
        title.set_z_index(1)

        # sum: x^2+bx+c
        sum = Tex(r"x^2+bx+c", font_size=72)
        sum_g = _glyphs(sum, [
            (-2.2735, -0.1893, 0.5184, 0.4715), (-1.761, 0.2581, 0.3221, 0.4838), (-0.8653, -0.1534, 0.6922, 0.6933), (0.0117, -0.0581, 0.3831, 0.7338),
            (0.5073, -0.1893, 0.5184, 0.4715), (1.4486, -0.1534, 0.6922, 0.6933), (2.3302, -0.1893, 0.4049, 0.4715),
        ])
        sum.move_to([0, -0.8, 0])

        # 0 s – 1.5 s: title write
        self.play(Write(VGroup(*title_g[:]), stroke_color="#FFFFFF"), run_time=1.5)
        # 1.5 s – 2.5 s
        self.wait(1)
        # 2.5 s – 3.5 s: title → sum
        self.play(
            TransformFromCopy(title_g[29], sum_g[0]),
            TransformFromCopy(title_g[30], sum_g[1]),
            TransformFromCopy(title_g[31], sum_g[2]),
            TransformFromCopy(title_g[32], sum_g[3]),
            TransformFromCopy(title_g[33], sum_g[4]),
            TransformFromCopy(title_g[34], sum_g[5]),
            TransformFromCopy(title_g[35], sum_g[6]),
            run_time=1,
        )
        # 3.5 s – 6 s
        self.wait(2.5)
        # 6 s – 7 s: sum fade_out, title fade_out
        self.play(FadeOut(sum), FadeOut(title), run_time=1)
