# Hidden line ends — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 75 frames, like the editor's video export.
from manimlib import *


def _spline(line, curves):
    """Bend a straight line into a curve: `curves` gives, for each stretch of it, its two
    handles and the point it ends at, in the frame of the line's two ends — u along the line
    from its start (0) to its end (1), v across it to the left, as fractions of its length.
    ManimGL draws quadratic curves: each stretch, a cubic one, is made of eight."""
    start, end = line.get_start(), line.get_end()
    along = end - start
    across = np.array([-along[1], along[0], 0.0])
    t = np.linspace(0, 1, 9)[:, None]
    points = [start]
    for stretch in curves:
        p0 = points[-1]
        p1, p2, p3 = (start + u * along + v * across for u, v in stretch)
        at = ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1
              + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)
        way = (1 - t) ** 2 * (p1 - p0) + 2 * (1 - t) * t * (p2 - p1) + t ** 2 * (p3 - p2)
        for a, b, da, db in zip(at, at[1:], way, way[1:]):
            # The handle of each eighth: where the tangents at its two ends meet, when they
            # meet between them; else — the curve runs straight there, or turns its bend —
            # the handle of the quadratic nearest to the eighth.
            handle = (a + b) / 2 + 3 * (da - db) / 32
            turn = da[0] * db[1] - da[1] * db[0]
            if abs(turn) > 1e-4 * get_norm(da) * get_norm(db):
                gap = b - a
                s = (gap[0] * db[1] - gap[1] * db[0]) / turn
                u = (da[0] * gap[1] - da[1] * gap[0]) / turn
                met = a + s * da
                if s > 0 and u > 0 and get_norm(met - (a + b) / 2) <= get_norm(gap):
                    handle = met
            points += [handle, b]
    line.set_points(np.array(points))
    return line


def _dashed(line, dash_length=0.05):
    """A curve cut into dashes about `dash_length` long, counted by its own length, as
    ManimCE's DashedVMobject cuts it: dashes of one length, the first at the start of the
    curve and the last at its end."""
    alphas = np.linspace(0, 1, 9 * line.get_num_curves() + 1)
    points = np.array([line.quick_point_from_proportion(a) for a in alphas])
    lengths = np.append(0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1)))
    count = max(2, int(np.ceil(lengths[-1] / dash_length / 2)))
    period = 0.5 / count + 0.5 / (count - 1)
    dashes = [
        line.get_subcurve(*np.interp(
            np.array([i * period, i * period + 0.5 / count]) * lengths[-1], lengths, alphas
        ))
        for i in range(count)
    ]
    line.clear_points()
    line.add(*dashes)
    return line


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

        # arrow: arrow
        arrow = Line([-4.5, 1.89246, 0], [-1.5, 2.39246, 0], stroke_width=6, color="#FFFF00").add_tip(length=0.35, width=0.35)
        arrow.set_z_index(3)

        # bow: line
        bow = Line([-4.5, 0.472978, 0], [-1.5, 0.472978, 0], path_arc=80 * DEGREES, color="#83C167")
        bow.set_z_index(2)

        # beads: dashed
        beads = _dashed(_spline(Line([1.5, 1.7, 0], [4.5, 2.3, 0], color="#58C4DD"), [((0.3, 0.4), (0.7, -0.4), (1, 0))]), dash_length=0.12)
        beads.set_z_index(1)

        # both: double arrow
        both = _arrow(Line([1.75, -0.25, 0], [4.25, -0.75, 0], stroke_width=6, color="#FFFFFF"), tip=0.35, start="triangle")

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
        both_to = _arrow(Line([-5.5, -2.5, 0], [-2.5, -3.2, 0], stroke_width=9, color="#FC6255"), tip=0.35, start="triangle")
        both.become(both_to)
        # 0.9 s – 1.5 s: arrow tween, bow tween, beads tween, both tween
        self.wait(0.6)
        # 1.5 s – 1.8 s
        self.wait(0.3)
        # 1.8 s – 2.2 s: arrow fade_in, bow fade_in, beads fade_in, both fade_in
        self.play(FadeIn(arrow), FadeIn(bow), FadeIn(beads), FadeIn(both), run_time=0.4)
        # 2.2 s – 2.5 s
        self.wait(0.3)
