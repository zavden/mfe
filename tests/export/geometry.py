"""Native probe geometry; exact point-byte caching leaves sampling and paint checks unchanged."""
from functools import lru_cache

import numpy as np

SAMPLES = np.linspace(0.0, 1.0, 9)


def bezier(points, t):
    n = len(points) - 1
    from math import comb

    return sum(comb(n, k) * (1 - t) ** (n - k) * t ** k * points[k] for k in range(n + 1))


@lru_cache(maxsize=2)
def _sample_weights(degree):
    # Compute each coefficient with exactly the scalar oracle's operation order.
    from math import comb
    return np.array([[comb(degree, k) * (1 - t) ** (degree - k) * t ** k
                      for t in SAMPLES] for k in range(degree + 1)])


def _sample_curve(points):
    weights = _sample_weights(len(points) - 1)
    # Keep the original left-to-right sum; broadcasting removes repeated Python calls, not samples.
    return sum(weights[k, :, None] * points[k] for k in range(len(points)))


def _geometry_uncached(subpaths, degree):
    """Box over the sampled curves; the length of the chords between the samples of each drawn
    curve, summed; and the area of all the samples as one polygon (shoelace, absolute) — one
    sequence, so that how the subpaths are split (which differs between a mobject being
    interpolated or cut and the preview's contours) changes nothing: the chords that link closed
    subpaths cancel out. ManimGL's jump to the next subpath (a curve whose handle sits on its start
    with the end elsewhere) is not drawn and counts for nothing. compare.ts computes the same of a
    drawable's cubic contours."""
    xs, ys = [], []
    length = 0.0
    for sp in subpaths:
        sp = np.asarray(sp)[:, :2]
        if len(sp) == 0:
            continue
        if degree == 3:
            curves = [sp[i:i + 4] for i in range(0, len(sp) - 3, 4)]
        else:
            curves = [sp[i:i + 3] for i in range(0, len(sp) - 2, 2)]
        if not curves:
            xs.extend(sp[:, 0])
            ys.extend(sp[:, 1])
        for c in curves:
            if degree == 2 and (c[0] == c[1]).all() and (np.abs(c[1] - c[2]) > 1e-4).any():
                continue  # the jump to the next subpath
            pts = _sample_curve(c)
            xs.extend(pts[:, 0])
            ys.extend(pts[:, 1])
            length += float(np.sum(np.hypot(np.diff(pts[:, 0]), np.diff(pts[:, 1]))))
    if not xs:
        return None
    x, y = np.array(xs), np.array(ys)
    area = abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))) / 2
    return [float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))], length, area


@lru_cache(maxsize=4096)
def _geometry_from_buffers(parts, degree):
    paths = [np.frombuffer(data, dtype=np.dtype(dtype)).reshape(shape)
             for dtype, shape, data in parts]
    result = _geometry_uncached(paths, degree)
    if result is None:
        return None
    box, length, area = result
    return tuple(box), length, area


def geometry(subpaths, degree):
    paths = [np.asarray(path)[:, :2] for path in subpaths]
    if any(path.dtype.hasobject for path in paths):
        return _geometry_uncached(paths, degree)
    # Bound cached point bytes as well as entry count; large glyphs use the same oracle directly.
    if sum(path.nbytes for path in paths) > 16 * 1024:
        return _geometry_uncached(paths, degree)
    parts = tuple((path.dtype.str, path.shape, path.tobytes()) for path in paths)
    result = _geometry_from_buffers(parts, degree)
    if result is None:
        return None
    box, length, area = result
    return list(box), length, area
