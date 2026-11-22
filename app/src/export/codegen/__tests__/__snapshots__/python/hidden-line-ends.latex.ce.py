# Hidden line ends — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 75 frames, like the editor's video export.
from manim import *


def _spline(line, curves):
    """Bend a straight line into a curve: `curves` gives, for each stretch of it, its two
    handles and the point it ends at, in the frame of the line's two ends — u along the line
    from its start (0) to its end (1), v across it to the left, as fractions of its length.
    An arrow keeps its tips, put on the curve."""
    tips = [type(tip) for tip in line.pop_tips()] if isinstance(line, Arrow) else []
    start, end = line.get_start(), line.get_end()
    along = end - start
    across = np.array([-along[1], along[0], 0.0])
    points = [start]
    for stretch in curves:
        points += [points[-1], *(start + u * along + v * across for u, v in stretch)]
    line.set_points(np.array(points[1:]))
    for shape, at_start in zip(tips, (False, True)):
        line.add_tip(tip_shape=shape, at_start=at_start)
        if not at_start:
            width = line.max_stroke_width_to_length_ratio * line.get_length()
            line.set_stroke(width=min(line.initial_stroke_width, width), family=False)
    return line


def _dashed(line, dash_length=0.05):
    """A curve cut into dashes about `dash_length` long, counted by its own length."""
    count = max(2, int(np.ceil(line.get_arc_length() / dash_length / 2)))
    return DashedVMobject(line, num_dashes=count)


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # arrow: arrow
        arrow = Arrow([-4.5, 1.89246, 0], [-1.5, 2.39246, 0], buff=0, color="#FFFF00")
        arrow.set_z_index(3)

        # bow: line
        bow = Line([-4.5, 0.472978, 0], [-1.5, 0.472978, 0], path_arc=80 * DEGREES, color="#83C167")
        bow.set_z_index(2)

        # beads: dashed
        beads = _dashed(_spline(Line([1.5, 1.7, 0], [4.5, 2.3, 0], color="#58C4DD"), [((0.3, 0.4), (0.7, -0.4), (1, 0))]), dash_length=0.12)
        beads.set_z_index(1)

        # both: double arrow
        both = DoubleArrow([1.75, -0.25, 0], [4.25, -0.75, 0], buff=0)

        self.add(arrow)
        self.add(bow)
        self.add(beads)
        self.add(both)
        # 0 s – 0.3 s
        self.wait(0.3)
        # 0.3 s – 0.7 s: arrow fade_out, bow fade_out, beads fade_out, both fade_out
        self.play(FadeOut(arrow), FadeOut(bow), FadeOut(beads), FadeOut(both), run_time=0.4)
        # 0.7 s – 0.9 s
        self.wait(0.2)
        both_to = DoubleArrow([-5.5, -2.5, 0], [-2.5, -3.2, 0], buff=0, color="#FC6255", stroke_width=9)
        both.become(both_to)
        both.initial_stroke_width = 9
        # 0.9 s – 1.5 s: arrow tween, bow tween, beads tween, both tween
        self.wait(0.6)
        # 1.5 s – 1.8 s
        self.wait(0.3)
        # 1.8 s – 2.2 s: arrow fade_in, bow fade_in, beads fade_in, both fade_in
        self.play(FadeIn(arrow), FadeIn(bow), FadeIn(beads), FadeIn(both), run_time=0.4)
        # 2.2 s – 2.5 s
        self.wait(0.3)
