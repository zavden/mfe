# Camera moves — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 30 fps:
#     manimgl CameraMoves.py CameraMoves -w -r 1920x1080 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 315 frames, like the editor's video export.
from manimlib import *


# Strokes thicken when the camera zooms in, as in ManimCE (ManimGL 1.7.2 or later).
_VMobject_init = VMobject.__init__


def _VMobject_init_scaled(self, *args, **kwargs):
    _VMobject_init(self, *args, **kwargs)
    self.set_scale_stroke_with_zoom(True, recurse=False)


VMobject.__init__ = _VMobject_init_scaled


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


class CameraMoves(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # The camera: the frame the scene is filmed through.
        cam = self.camera.frame
        cam.save_state()
        # target camera: Result
        result = Rectangle(width=8, height=4.5).move_to([10, -2, 0])
        # target camera: Wide
        wide = Rectangle(width=22.222222, height=12.5).move_to([3.5, -1.5, 0])

        # theorem: a^2+b^2=c^2
        theorem = Tex(r"a^2+b^2=c^2", font_size=74.2416)
        theorem_g = _glyphs(theorem, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        theorem.move_to([-2.5, 1, 0])

        # root: c=\sqrt{a^2+b^2}
        root = Tex(r"c=\sqrt{a^2+b^2}", font_size=74.2416)
        root.set_color("#58C4DD")
        root_g = _glyphs(root, [
            (-2.2544, -0.1995, 0.3297, 0.3786), (-1.5311, -0.1702, 0.555, 0.195), (0.0992, -0.1989, 0.3942, 0.3758), (0.4899, 0.0585, 0.2351, 0.3924),
            (1.1886, -0.1698, 0.555, 0.5542), (1.8904, -0.0939, 0.3183, 0.5875), (2.2299, 0.0585, 0.2351, 0.3924), (-0.5042, 0, 0.7575, 1),
            (1.1469, 0.475, 2.5447, 0.05),
        ])
        root.move_to([10, -2, 0])
        root.set_z_index(1)

        # 0 s – 1 s: theorem write
        self.play(Write(VGroup(*theorem_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        # 1.5 s – 2.5 s: camera → (-0.85, 1), 267 %
        self.play(
            cam.animate.replace(Rectangle(width=5.333333, height=3).move_to([-0.85, 1, 0])),
            run_time=1,
        )
        # 2.5 s – 2.8 s
        self.wait(0.3)
        # 2.8 s – 3.6 s: theorem indicate
        self.play(Indicate(VGroup(theorem_g[6], theorem_g[7])), run_time=0.8)
        # 3.6 s – 3.9 s
        self.wait(0.3)
        # 3.9 s – 5.1 s: camera → Result
        self.play(cam.animate.replace(result), run_time=1.2)
        # 5.1 s – 5.4 s
        self.wait(0.3)
        # 5.4 s – 6.4 s: root write
        self.play(Write(VGroup(*root_g[:]), stroke_color="#58C4DD"), run_time=1)
        # 6.4 s – 6.9 s
        self.wait(0.5)
        # 6.9 s – 8.1 s: camera → Wide
        self.play(cam.animate.replace(wide), run_time=1.2)
        # 8.1 s – 8.7 s
        self.wait(0.6)
        # 8.7 s – 9.9 s: camera → start
        self.play(Restore(cam), run_time=1.2)
        # 9.9 s – 10.5 s
        self.wait(0.6)
