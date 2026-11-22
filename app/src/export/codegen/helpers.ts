/* The Python helpers a generated scene may include (each only when used). The same source runs
 * in ManimCE 0.22 and ManimGL 1.7: where the two libraries name a hook differently, the helper
 * defines both. */

/** Plays a stretch of an animation inside one `self.play` (ARCHITECTURE §8, "slices"). */
export const PART_HELPER = `class _Part(Animation):
    """Plays the stretch [a0, a1] of \`anim\` (fractions of its run time) inside one
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
`;

/** Moves glyphs between two placements of their formula like the editor's tweens do. `paint`:
 * one pair of stroke opacities per glyph; `style`: a shape's stroke width and a colour of its own
 * for its fill go along too (D123). */
export function tweenHelper(paint = false, style = false): string {
  return `def _pose(start, end, t):
    """Matrix and centre of a formula placement blended from \`start\` to \`end\` at t, as
    the editor does it: position, scale and flips linearly (a flip passes through zero),
    the rotation as a true rotation. A placement is (x, y, scale, degrees, sx, sy) with
    sx, sy = -1 for a flipped axis."""
    x, y, s, deg, sx, sy = (a + (b - a) * t for a, b in zip(start, end))
    c, si = np.cos(deg * DEGREES), np.sin(deg * DEGREES)
    return np.array([[c, -si], [si, c]]) @ np.diag([s * sx, s * sy]), np.array([x, y, 0.0])


def _mix(a, b, t):
    """Blend two '#RRGGBB' colours component-wise in RGB, as a Transform does."""
    a, b = (np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)]) for c in (a, b))
    return "#%02X%02X%02X" % tuple(int(v) for v in np.round(a + (b - a) * t))


class _Tween(Animation):
    """Moves \`glyphs\` from one placement of their formula to another (see _pose): the
    rotation turns about the formula centre instead of cutting across. The submobjects of
    \`glyphs\` are the glyphs; \`colors\` holds a (from, to) pair or None for each of them, in
    that order, \`opacity\` a (from, to) pair of fill opacities, one such pair per glyph, or
    None, and \`stroke\` a (from, to) pair of stroke opacities${paint || style ? ', one pair per glyph,' : ' (a stroked shape)'} or None.${
      style
        ? `
    \`width\` is a (from, to) pair of stroke widths or None, and \`fills\` a (from, to) pair of
    colours for the fill when it is not the stroke's, or None.`
        : ''
    }"""

    def __init__(self, glyphs, start, end, colors=None, opacity=None, stroke=None, ${style ? 'width=None, fills=None, ' : ''}**kwargs):
        super().__init__(glyphs, **kwargs)
        self.start, self.end, self.colors = start, end, colors
        self.opacity, self.stroke = opacity, stroke${
          style
            ? `
        self.width, self.fills = width, fills`
            : ''
        }

    def begin(self):
        self.glyphs = list(self.mobject.submobjects)
        self.origins = [g.copy() for g in self.glyphs]
        matrix, centre = _pose(self.start, self.start, 0)
        self.inverse, self.centre = np.linalg.inv(matrix), centre
        super().begin()

    def interpolate_mobject(self, alpha):
        t = self.rate_func(min(max(alpha, 0), 1))
        matrix, centre = _pose(self.start, self.end, t)
        for i, (glyph, origin) in enumerate(zip(self.glyphs, self.origins)):
            glyph.match_points(origin)
            glyph.apply_matrix(matrix @ self.inverse, about_point=self.centre)
            glyph.shift(centre - self.centre)
            pair = self.colors[i] if self.colors else None
            fill = _mix(*pair, t) if pair else None
            fade = self.opacity[i] if isinstance(self.opacity, list) else self.opacity
            o = fade[0] + (fade[1] - fade[0]) * t if fade else None
${
  style
    ? `            inside = _mix(*self.fills, t) if self.fills else fill
            if inside or o is not None:
                glyph.set_fill(inside, o)
            stroke = self.stroke[i] if isinstance(self.stroke, list) else self.stroke
            s = stroke[0] + (stroke[1] - stroke[0]) * t if stroke else None
            w = self.width[0] + (self.width[1] - self.width[0]) * t if self.width else None
            if fill or s is not None or w is not None:
                glyph.set_stroke(fill, width=w, opacity=s)`
    : `            if fill or o is not None:
                glyph.set_fill(fill, o)
${
  paint
    ? `            stroke = self.stroke[i] if isinstance(self.stroke, list) else self.stroke
            s = stroke[0] + (stroke[1] - stroke[0]) * t if stroke else None
            if fill or s is not None:
                glyph.set_stroke(fill, opacity=s)`
    : `            if self.stroke:
                glyph.set_stroke(fill, opacity=self.stroke[0] + (self.stroke[1] - self.stroke[0]) * t)`
}`
}
`;
}

/** The compact helper stays byte-for-byte stable for scenes needing only uniform paint. */
export const TWEEN_HELPER = tweenHelper();

/** The circle a shape object draws around its target: through the corners of the target's box,
 * `buff` further out (ARCHITECTURE §5, "Attached objects"). */
export const CIRCLE_HELPER = `def _circle_around(mobject, buff=0.1, color=WHITE, **kwargs):
    """A circle through the corners of the mobject's box, \`buff\` further out, centred on it."""
    radius = np.hypot(mobject.get_width(), mobject.get_height()) / 2 + buff
    return Circle(radius=radius, stroke_color=color, fill_color=color, **kwargs).move_to(mobject)
`;

/** ManimGL's tips (D137, D146): the ones ManimCE's `Arrow` and `DoubleArrow` put on a line — a
 * tip with its point on the end of the line and along the line there, the line then running to
 * its base; for a second tip, made on the line the first one has shortened, the first one turned
 * with the line when the second shortens it (a second `add_tip` of ManimGL's would move the first
 * tip instead: it resets the ends of the line with that tip on). The shapes ManimGL lacks or
 * draws otherwise are made here: ManimCE's `StealthTip`, and a dot as wide as the tip is long. */
export const ARROW_HELPER = `def _arrow(line, tip=0.35, end="triangle", start=None):
    """Put a tip \`tip\` long at the end of a line, and one at its start when \`start\` names
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
`;

/** A line bent into a spline (D145): the straight line of its class — so that Manim finds its two
 * ends and leaves its gap —, its points then the cubic stretches of the spline, in the frame of
 * those two ends (\`splineStretches\`, geom/lines.ts). ManimCE holds the cubics, and its arrow
 * takes its tips again on the curve, with its own caps; ManimGL draws quadratics, whose own
 * conversion of a cubic fails where the curve leaves an anchor straight: each stretch is made of
 * eight here, tangent to it where they join. */
export const SPLINE_LINE_HELPERS: Readonly<Record<'ce' | 'gl', string>> = {
  ce: `def _spline(line, curves):
    """Bend a straight line into a curve: \`curves\` gives, for each stretch of it, its two
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
`,
  gl: `def _spline(line, curves):
    """Bend a straight line into a curve: \`curves\` gives, for each stretch of it, its two
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
`,
};

/** The dashes of a spline (D145), counted by the length of the curve and of one length along it:
 * ManimCE's \`DashedVMobject\`, and in ManimGL — whose own cuts a curve by the count of its
 * pieces, whatever their lengths — the same cut made here. */
export const DASHED_HELPERS: Readonly<Record<'ce' | 'gl', string>> = {
  ce: `def _dashed(line, dash_length=0.05):
    """A curve cut into dashes about \`dash_length\` long, counted by its own length."""
    count = max(2, int(np.ceil(line.get_arc_length() / dash_length / 2)))
    return DashedVMobject(line, num_dashes=count)
`,
  gl: `def _dashed(line, dash_length=0.05):
    """A curve cut into dashes about \`dash_length\` long, counted by its own length, as
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
`,
};

/** The dashes of a spline carried to other ends (D144): what `put_start_and_end_on` does to a
 * line — its points moved, turned and scaled as one —, for the group `_dashed` makes, which has no
 * points of its own for Manim to read its two ends from (ManimCE's `DashedVMobject` and ManimGL's
 * emptied line both fail there). A copy, for `Transform` to play. */
export const CARRIED_HELPER = `def _carried(line, start, end):
    """A copy of a line cut into dashes, carried to run from \`start\` to \`end\` as
    put_start_and_end_on carries a line: the dashes of a curve have no points of their own for
    it to read the two ends from."""
    carried = line.copy()
    first = carried.submobjects[0].get_start()
    was = carried.submobjects[-1].get_end() - first
    now = np.array(end) - np.array(start)
    carried.scale(np.linalg.norm(now) / np.linalg.norm(was), about_point=first)
    carried.rotate(angle_of_vector(now) - angle_of_vector(was), about_point=first)
    return carried.shift(np.array(start) - first)
`;

/** The GrowArrow of a bent arrow (D149), an animation Manim does not have: the arrow is drawn
 * along its own way from its start, as `Create` draws a line — by the count of its curves —, with
 * its tip on the end of what is drawn so far, turned as the way runs there and grown out of the
 * start over the first quarter of the way; the tip at the start of a double arrow grows where it
 * is. The tip keeps the turn it has to the shaft once the arrow is whole (Manim points it along the
 * line before the shaft is shortened to its base), so it ends exactly as the arrow was built.
 * `looks.ts` draws the same in the preview (`traceArrowLook`). */
export const TRACE_ARROW_HELPERS: Readonly<Record<'ce' | 'gl', string>> = {
  ce: `class _TraceArrow(Animation):
    """A bent arrow drawn along its own way, from its start (Manim's GrowArrow scales the
    arrow about that point): its tip leads the stroke and turns with it, grown out of the
    start over the first quarter of the way; the tip at the start of a double arrow grows
    where it is."""

    def __init__(self, arrow, **kwargs):
        super().__init__(arrow, introducer=True, **kwargs)

    def along(self, alpha):
        """The point of the shaft at that part of its curves, and the way it runs there."""
        points = self.starting_mobject.points
        index, t = integer_interpolate(0, len(points) // 4, alpha)
        curve = points[4 * index:4 * index + 4]
        return bezier(curve)(t), bezier(curve[1:] - curve[:-1])(t)

    def interpolate_submobject(self, submob, start, alpha):
        if submob is self.mobject:
            submob.pointwise_become_partial(start, 0, alpha)
            return
        base = start.base
        submob.set_points(start.points)
        if submob is self.mobject.tip:
            (at, way), (_, ahead) = self.along(alpha), self.along(1)
            if min(np.linalg.norm(way), np.linalg.norm(ahead)) > 1e-8:
                submob.rotate(angle_of_vector(way) - angle_of_vector(ahead), about_point=base)
            submob.shift(at - base)
            base = at
        submob.scale(min(1, 4 * alpha), about_point=base)
`,
  gl: `class _TraceArrow(Animation):
    """A bent arrow drawn along its own way, from its start (Manim's GrowArrow scales the
    arrow about that point): its tip leads the stroke and turns with it, grown out of the
    start over the first quarter of the way; the tip at the start of a double arrow grows
    where it is."""

    def along(self, alpha):
        """The point of the shaft at that part of its curves, and the way it runs there."""
        points = self.starting_mobject.get_points()
        index, t = integer_interpolate(0, len(points) // 2, alpha)
        curve = points[2 * index:2 * index + 3]
        return bezier(curve)(t), bezier(curve[1:] - curve[:-1])(t)

    def interpolate_submobject(self, submob, start, alpha):
        if submob is self.mobject:
            submob.pointwise_become_partial(start, 0, alpha)
            return
        base = start.get_base()
        submob.match_points(start)
        if submob is self.mobject.tip:
            (at, way), (_, ahead) = self.along(alpha), self.along(1)
            if min(np.linalg.norm(way), np.linalg.norm(ahead)) > 1e-8:
                submob.rotate(angle_of_vector(way) - angle_of_vector(ahead), about_point=base)
            submob.shift(at - base)
            base = at
        submob.scale(min(1, 4 * alpha), about_point=base)
`,
};

/** The cross line a shape object lays over its target (D128): one of the two lines Manim's own
 * `Cross` would lay over it — so that it is fitted as a cross is in each library —, drawn from
 * the corner the diagonal starts at: the rising one from the lower left corner, which the cross
 * runs the other way. */
export const CROSS_LINE_HELPER = `def _cross_line(mobject, rising=True, **kwargs):
    """One line of a Cross over the mobject: from its lower left corner up to its upper right one,
    or (rising=False) from its upper left corner down to its lower right one."""
    falling, other = Cross(mobject)
    ends = (other.get_end(), other.get_start()) if rising else (falling.get_start(), falling.get_end())
    return Line(*ends, **kwargs)
`;

/** ManimCE's Wiggle about a pivot fixed when it begins (D73): Manim's own reads the centre again
 * while it moves the glyphs one by one, which drifts it by a hundredth, and ManimGL's
 * WiggleOutThenIn refuses an array pivot. A copy of the point: ManimGL's `get_center()` is a view
 * into the bounding box, which `scale` and `rotate` rewrite in place. */
export const WIGGLE_HELPER = `class _Wiggle(Animation):
    """ManimCE's Wiggle about a pivot fixed when it begins: Manim reads the centre again while it
    moves the glyphs one by one, which drifts it, and ManimGL's WiggleOutThenIn refuses an
    array pivot."""

    def __init__(self, mobject, scale_value=1.1, rotation_angle=0.01 * TAU, n_wiggles=6, **kwargs):
        self.scale_value, self.rotation_angle, self.n_wiggles = scale_value, rotation_angle, n_wiggles
        super().__init__(mobject, **kwargs)

    def begin(self):
        # A copy: ManimGL's get_center() is a view into the bounding box, which scale and
        # rotate rewrite in place.
        self.pivot = np.array(self.mobject.get_center())
        super().begin()

    def interpolate_submobject(self, submob, start, alpha):
        submob.match_points(start)
        submob.scale(interpolate(1, self.scale_value, there_and_back(alpha)), about_point=self.pivot)
        submob.rotate(wiggle(alpha, self.n_wiggles) * self.rotation_angle, about_point=self.pivot)
`;

/** ManimCE's Circumscribe for both libraries (D73): a `ShowPassingFlash` over a
 * `SurroundingRectangle` built on the mobject as it is when the animation is made — ManimGL has
 * none, and the frame takes the layer it is given (a fresh mobject would sit at 0, under every
 * track above the first). */
export const CIRCUMSCRIBE_HELPER = `class _Circumscribe(ShowPassingFlash):
    """ManimCE's Circumscribe for both libraries: a rectangle around the mobject as it is when the
    animation is made, traced and untraced in one pass, on the layer \`z_index\` names."""

    def __init__(self, mobject, buff=0.1, color="#FFFF00", stroke_width=4, time_width=0.3,
                 z_index=0, **kwargs):
        frame = SurroundingRectangle(mobject, buff=buff, color=color, stroke_width=stroke_width)
        frame.set_z_index(z_index)
        super().__init__(frame, time_width=time_width, **kwargs)
`;

/** The `path_func` of a transfer pair's custom path (D48): the same maths as `geom/spline.ts`
 * (`arcLengths` with 64 steps per segment, `placeAtFraction`, `pathShift`), per submobject. */
export const SPLINE_PATH_HELPER = `def _spline_path(nodes):
    """The path function of a custom path, for \`path_func=\`: takes the points at the start,
    the points at the end and alpha, like Manim's own arc paths. \`nodes\` are anchors with
    their handles — ((u, v), in, out), a handle None when it sits on its anchor — in the
    chord's frame: u along the chord from the centre of the points at the start to their
    centre at the end, v across it to the left, as fractions of the chord's length. The
    centre travels the curve at a uniform speed by arc length (64 samples per segment, as
    the editor does) and every point moves straight, shifted by where the curve lies off
    the chord; a chord of no length plays straight."""
    anchors = [np.array(a, float) for a, _, _ in nodes]
    segments = []
    for (a, _, out), (b, into, _) in zip(nodes, nodes[1:]):
        p0, p3 = np.array(a, float), np.array(b, float)
        if out is None and into is None:
            p1, p2 = p0 + (p3 - p0) / 3, p0 + 2 * (p3 - p0) / 3
        else:
            p1 = p0 if out is None else np.array(out, float)
            p2 = p3 if into is None else np.array(into, float)
        segments.append((p0, p1, p2, p3))

    def bezier(k, t):
        p0, p1, p2, p3 = segments[k]
        return ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1
                + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)

    steps = 64
    ts = np.linspace(0.0, 1.0, steps + 1)[:, None]
    lengths = np.concatenate([[0.0], *[
        np.linalg.norm(np.diff(bezier(k, ts), axis=0), axis=1) for k in range(len(segments))
    ]]).cumsum()

    def point_at(alpha):
        if lengths[-1] <= 0 or alpha <= 0:
            return anchors[0]
        if alpha >= 1:
            return anchors[-1]
        target = alpha * lengths[-1]
        i = min(int(np.searchsorted(lengths, target, side="right")) - 1, len(lengths) - 2)
        step = lengths[i + 1] - lengths[i]
        g = (i + ((target - lengths[i]) / step if step > 0 else 0.0)) / steps
        k = min(int(g), len(segments) - 1)
        return bezier(k, g - k)

    def path(start, end, alpha):
        start, end = np.asarray(start, float), np.asarray(end, float)
        straight = start + (end - start) * alpha
        if start.size == 0:
            return straight
        flat_start = start.reshape(-1, start.shape[-1])
        flat_end = end.reshape(-1, end.shape[-1])
        a = (flat_start.min(axis=0) + flat_start.max(axis=0)) / 2
        b = (flat_end.min(axis=0) + flat_end.max(axis=0)) / 2
        cx, cy = (b - a)[:2]
        if cx * cx + cy * cy <= 1e-24:
            return straight
        u, v = point_at(alpha) - (anchors[0] + (anchors[-1] - anchors[0]) * alpha)
        shift = np.zeros(start.shape[-1])
        shift[:2] = (cx * u - cy * v, cy * u + cx * v)
        return straight + shift

    return path
`;

/** What gives each piece of a call its own path, where a call moves several glyphs along
 * different paths (D167): one transform of two groups, where routes of the pair have paths of
 * their own. Manim hands a path function the points of one piece at a time and nothing that
 * names it, and two glyphs drawn on one spot have the same points: so the helper takes the
 * animation itself and tells its pieces apart by the mobject each one is (D212). */
export const ROUTE_PATHS_HELPER = `def _route_paths(animation, pieces):
    """Gives each piece of a transform of two groups the path of its own route. \`pieces\` are
    (source, target, path), one for each piece in the order Manim animates them (the glyphs of
    the two groups as it aligns them, the group with fewer glyphs repeating some of its own):
    the glyph \`source\` on its way to the glyph \`target\` along the path function \`path\`,
    None for a straight one. Manim gives a path function nothing but the points of a piece,
    which two glyphs drawn on one spot share, so a piece is known by which mobject it is. If
    the transform turns out to have other pieces than these (a glyph without points is none),
    each takes the path of the route that starts and ends nearest to it instead (the centres
    of the glyphs as they are when the animation is made)."""
    def centre(mobject):
        points = np.asarray(mobject.get_all_points(), float)
        return None if points.size == 0 else (points.min(axis=0) + points.max(axis=0)) / 2

    table = [(centre(source), centre(target), path) for source, target, path in pieces]
    table = [row for row in table if row[0] is not None and row[1] is not None]

    def straight(start, end, alpha):
        return start + (end - start) * alpha

    def nearest(start, end, alpha):
        start, end = np.asarray(start, float), np.asarray(end, float)
        if start.size == 0 or not table:
            return start + (end - start) * alpha
        flat_start = start.reshape(-1, start.shape[-1])
        flat_end = end.reshape(-1, end.shape[-1])
        a = (flat_start.min(axis=0) + flat_start.max(axis=0)) / 2
        b = (flat_end.min(axis=0) + flat_end.max(axis=0)) / 2
        own = min(table, key=lambda r: np.linalg.norm(a - r[0]) + np.linalg.norm(b - r[1]))[2]
        return start + (end - start) * alpha if own is None else own(start, end, alpha)

    paths = None

    def interpolate_submobject(submobject, start, target, alpha):
        # The pieces are there once the animation begins: Manim aligns the two groups then.
        nonlocal paths
        if paths is None:
            members = [m for m in animation.mobject.get_family() if m.get_num_points() > 0]
            paths = {}
            if len(members) == len(pieces):
                paths = {id(m): piece[2] or straight for m, piece in zip(members, pieces)}
        submobject.interpolate(start, target, alpha, paths.get(id(submobject), nearest))
        return animation

    animation.interpolate_submobject = interpolate_submobject
    return animation
`;

/** Positional glyph matching (D5) for formulas whose glyph order may differ from Manim's. */
export const GLYPHS_HELPER = `def _glyphs(tex, layout):
    """The glyphs of \`tex\` in the editor's order. That order (MathJax's, or another
    template's) can differ from Manim's, so the glyphs are matched by position: \`layout\`
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
        return glyphs  # nothing to match (a formula without ink, such as \\quad)
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
`;

/** ManimGL has no Unwrite (ARCHITECTURE §6): Write played backwards over the glyphs in reverse
 * order, restyled as outlines while they are traced back. A glyph that holds others — an arrow's
 * line, its tips — is listed once, before them, and they go from the last: the order ManimCE's
 * `Unwrite` erases in, which inverts every list of submobjects and keeps a mobject before its own
 * (a glyph listed twice would be drawn by the last of its two places). */
export const UNWRITE_HELPER = `class _Unwrite(Write):
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
`;

/* Glyphs a disappear block takes out may come back later in their clip (an appear block). Manim's
 * removers leave their mobject as the animation ended it — scaled to a point, cut to nothing, half
 * unwritten — so a glyph that comes back needs its shape back once it is off screen. FadeOut does
 * that already (ManimCE in clean_up_from_scene, ManimGL in finish); these subclasses do it for the
 * others, and are used only for blocks whose glyphs come back. */

/** Appended to the ManimGL `_Unwrite` above when some of its glyphs come back. */
export const UNWRITE_RESTORE = `
    def clean_up_from_scene(self, scene):
        # Off screen, the glyphs get their shape back: some come back later.
        super().clean_up_from_scene(scene)
        self.interpolate(0)
`;

/** ManimCE: Unwrite that gives its glyphs back their shape once they are off screen. */
export const CE_UNWRITE_HELPER = `class _Unwrite(Write):
    """Unwrite (with its rate function) that gives the glyphs back their shape once they
    are off screen, so that they can come back later."""

    def __init__(self, vmobject, **kwargs):
        super().__init__(vmobject, reverse=True, reverse_rate_function=True, remover=True, **kwargs)

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        # Write(reverse=True) puts the group back in order when it finishes, but its starting
        # copy is still reversed: reverse the group around the restoring interpolate.
        self.reverse_submobjects()
        self.interpolate(0)
        self.reverse_submobjects()
`;

/** Uncreate that gives its glyphs back their shape once they are off screen. */
export const UNCREATE_HELPER = `class _Uncreate(Uncreate):
    """Uncreate that gives the glyphs back their shape once they are off screen, so that
    they can come back later."""

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        self.interpolate(0)
`;

/** ShrinkToCenter that gives its glyphs back their size once they are off screen. */
export const SHRINK_HELPER = `class _ShrinkToCenter(ShrinkToCenter):
    """ShrinkToCenter that gives the glyphs back their size once they are off screen, so
    that they can come back later."""

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        self.interpolate(0)
`;
