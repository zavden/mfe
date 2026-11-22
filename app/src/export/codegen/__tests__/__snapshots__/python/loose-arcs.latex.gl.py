# Loose arcs — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 60 frames, like the editor's video export.
from manimlib import *


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


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # wide: line
        wide = Line([-4.5, 2.488592, 0], [-1.5, 2.488592, 0], path_arc=120 * DEGREES, color="#FFFF00")
        wide.set_z_index(3)

        # arrow: arrow
        arrow = Line([1.75, 1.868652, 0], [4.25, 2.368652, 0], path_arc=60 * DEGREES, stroke_width=6, color="#83C167").add_tip(length=0.35, width=0.35)
        arrow.set_z_index(2)

        # both: double arrow
        both = _arrow(Line([-4.466952, -0.792983, 0], [-1.466952, -1.292983, 0], path_arc=120 * DEGREES, stroke_width=6, color="#58C4DD"), tip=0.35, end="stealth", start="triangle")
        both.set_z_index(1)

        # hook: arrow
        hook = Line([2.036557, -2.26545, 0], [4.036557, -1.26545, 0], path_arc=-150 * DEGREES, stroke_width=6, color="#FC6255").add_tip(length=0.7, tip_style=2)

        # 0 s – 0.4 s: wide fade_in, arrow fade_in, both fade_in, hook fade_in
        self.play(
            FadeIn(wide, rate_func=linear),
            FadeIn(arrow, rate_func=linear),
            FadeIn(both, rate_func=linear),
            FadeIn(hook, rate_func=linear),
            run_time=0.4,
        )
        # 0.4 s – 0.6 s
        self.wait(0.2)
        # 0.6 s – 1.2 s: arrow tween
        self.play(arrow.animate(rate_func=linear).move_to([3.5, 1.5, 0]), run_time=0.6)
        # 1.2 s – 1.6 s
        self.wait(0.4)
        # 1.6 s – 2 s: wide fade_out, arrow fade_out, both fade_out, hook fade_out
        self.play(
            FadeOut(wide, rate_func=linear),
            FadeOut(arrow, rate_func=linear),
            FadeOut(both, rate_func=linear),
            FadeOut(hook, rate_func=linear),
            run_time=0.4,
        )
