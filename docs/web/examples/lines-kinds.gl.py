# The four kinds of line — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl TheFourKindsOfLine.py TheFourKindsOfLine -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 408 frames, like the editor's video export.
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


def _arrow(line, tip=0.35, end="triangle", start=None):
    """Put a tip `tip` long at the end of a line, and one at its start when `start` names
    its shape, as ManimCE's Arrow and DoubleArrow put theirs: each with its point on the end of
    the line and along the line there, the line then running between their bases. The shapes:
    "triangle", "stealth" (ManimCE's StealthTip) and "dot"."""
    if tip <= 0:
        return line

    def make(shape, at_start=False):
        if shape == "dot":  # ManimGL makes its dot half as wide as it is asked
            return line.create_tip(at_start, length=2 * tip, tip_style=2)
        mob = line.create_tip(at_start, length=tip, width=tip)
        if shape == "stealth":
            corners = [[2, 0, 0], [-1.2, 1.6, 0], [0, 0, 0], [-1.2, -1.6, 0], [2, 0, 0]]
            mob.set_points_as_corners(tip / 3.2 * np.array(corners))
            mob.set_stroke(width=3.0)
            line.position_tip(mob, at_start)
        return mob

    first, last = line.get_start(), line.get_end()
    front = make(end)
    line.put_start_and_end_on(first, front.get_base())
    tips = [front]
    if start:
        # ManimCE makes the second tip on the line the first one has shortened, and turns
        # the first one with the line when the second shortens it.
        back = make(start, True)
        turn = angle_of_vector(last - back.get_base()) - angle_of_vector(last - first)
        front.rotate(turn, about_point=last)
        line.put_start_and_end_on(back.get_base(), front.get_base())
        line.start_tip = back
        tips.append(back)
    line.tip = front
    for mob in tips:
        mob.set_color(line.get_stroke_color())
        line.add(mob)
    return line


class TheFourKindsOfLine(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # label1: \text{Line}
        label1 = Tex(r"\text{Line}", font_size=55.6812)
        label1_g = _glyphs(label1, [
            (-0.9308, 0.0079, 0.8026, 0.9841), (-0.2651, -0.0022, 0.33, 0.964), (0.3415, -0.1652, 0.745, 0.6378), (1.0533, -0.1693, 0.5576, 0.6614),
        ])
        label1.move_to([-4.4, 2.1, 0])
        label1.set_z_index(7)

        # l1: line
        l1 = Line([-2, 2.1, 0], [5, 2.1, 0], color="#FFFFFF")
        l1.set_z_index(6)

        # label2: \text{Dashed line}
        label2 = Tex(r"\text{Dashed line}", font_size=55.6812)
        label2_g = _glyphs(label2, [
            (-3.0347, -0.0005, 0.965, 0.9679), (-2.0994, -0.1748, 0.6504, 0.6504), (-1.4865, -0.1748, 0.462, 0.6504), (-0.8042, 0.0078, 0.7326, 0.9844),
            (-0.1042, -0.1748, 0.5484, 0.6504), (0.6143, 0, 0.71, 1), (1.5581, 0.0078, 0.3359, 0.9844), (1.9464, -0.0104, 0.3245, 0.948),
            (2.543, -0.1708, 0.7326, 0.6273), (3.243, -0.1748, 0.5484, 0.6504),
        ])
        label2.move_to([-4.4, 0.7, 0])
        label2.set_z_index(5)

        # l2: dashed
        l2 = DashedLine([-2, 0.7, 0], [5, 0.7, 0], dash_length=0.15, color="#58C4DD")
        l2.set_z_index(4)

        # label3: \text{Arrow}
        label3 = Tex(r"\text{Arrow}", font_size=55.6812)
        label3_g = _glyphs(label3, [
            (-1.3893, 0.0076, 0.9422, 0.9849), (-0.6087, -0.1804, 0.4732, 0.6089), (-0.0695, -0.1804, 0.4732, 0.6089), (0.5488, -0.1836, 0.6094, 0.63),
            (1.3893, -0.196, 0.9422, 0.608),
        ])
        label3.move_to([-4.4, -0.7, 0])
        label3.set_z_index(3)

        # l3: arrow
        l3 = Line([-2, -0.7, 0], [5, -0.7, 0], stroke_width=6, color="#83C167").add_tip(length=0.35, width=0.35)
        l3.set_z_index(2)

        # label4: \text{Double arrow}
        label4 = Tex(r"\text{Double arrow}", font_size=55.6812)
        label4_g = _glyphs(label4, [
            (-3.6327, -0.0005, 0.965, 0.9679), (-2.7173, -0.1741, 0.6278, 0.649), (-1.9606, -0.1786, 0.7326, 0.6429), (-1.1904, 0, 0.7114, 1),
            (-0.5817, 0.0078, 0.3359, 0.9844), (-0.0786, -0.1748, 0.5484, 0.6504), (0.9643, -0.1748, 0.6504, 0.6504), (1.5716, -0.1708, 0.4875, 0.6273),
            (2.1271, -0.1708, 0.4875, 0.6273), (2.7641, -0.1741, 0.6278, 0.649), (3.6299, -0.1868, 0.9707, 0.6264),
        ])
        label4.move_to([-4.4, -2.1, 0])
        label4.set_z_index(1)

        # l4: double arrow
        l4 = _arrow(Line([-2, -2.1, 0], [5, -2.1, 0], stroke_width=6, color="#FFFF00"), tip=0.35, start="triangle")

        # 0 s – 0.2 s
        self.wait(0.2)
        # 0.2 s – 0.6 s: label1 fade_in
        self.play(FadeIn(label1), run_time=0.4)
        # 0.6 s – 0.8 s
        self.wait(0.2)
        l1_in = ShowCreation(l1)
        # 0.8 s – 1 s: l1 create
        self.play(_Part(l1_in, 0, 0.25), run_time=0.2)
        # 1 s – 1.4 s: l1 create, label2 fade_in
        self.play(_Part(l1_in, 0.25, 0.75), FadeIn(label2), run_time=0.4)
        # 1.4 s – 1.6 s: l1 create
        self.play(_Part(l1_in, 0.75, 1), run_time=0.2)
        l2_in = ShowCreation(l2)
        # 1.6 s – 1.8 s: l2 create
        self.play(_Part(l2_in, 0, 0.25), run_time=0.2)
        # 1.8 s – 2.2 s: l2 create, label3 fade_in
        self.play(_Part(l2_in, 0.25, 0.75), FadeIn(label3), run_time=0.4)
        # 2.2 s – 2.4 s: l2 create
        self.play(_Part(l2_in, 0.75, 1), run_time=0.2)
        l3_in = GrowArrow(l3)
        # 2.4 s – 2.6 s: l3 grow_arrow
        self.play(_Part(l3_in, 0, 0.25), run_time=0.2)
        # 2.6 s – 3 s: l3 grow_arrow, label4 fade_in
        self.play(_Part(l3_in, 0.25, 0.75), FadeIn(label4), run_time=0.4)
        # 3 s – 3.2 s: l3 grow_arrow
        self.play(_Part(l3_in, 0.75, 1), run_time=0.2)
        # 3.2 s – 4 s: l4 grow_arrow
        self.play(GrowArrow(l4), run_time=0.8)
        # 4 s – 6.3 s
        self.wait(2.3)
        # 6.3 s – 6.8 s: label1 fade_out, label2 fade_out, label3 fade_out, label4 fade_out, l1 fade_out, l2 fade_out, l3 fade_out, l4 fade_out
        self.play(
            FadeOut(label1),
            FadeOut(label2),
            FadeOut(label3),
            FadeOut(label4),
            FadeOut(l1),
            FadeOut(l2),
            FadeOut(l3),
            FadeOut(l4),
            run_time=0.5,
        )
