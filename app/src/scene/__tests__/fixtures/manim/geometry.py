"""Shared glyph geometry: polygons (corner lists) centred on the origin."""
import numpy as np

# Raw polygons (closed by repeating the first corner when built). Units: scene units.
RAW = [
    [(0.0, 0.0), (0.6, 0.0), (0.6, 0.9), (0.0, 0.9)],                       # rectangle  (4 curves)
    [(0.9, 0.0), (1.5, 0.0), (1.2, 0.8)],                                   # triangle   (3)
    [(1.8, 0.1), (2.2, 0.0), (2.5, 0.3), (2.4, 0.8), (2.0, 0.95), (1.75, 0.6)],  # hexagon (6)
    [(2.8, 0.0), (3.4, 0.2), (3.5, 0.7), (3.0, 1.0), (2.7, 0.6)],           # pentagon (5)
    [(3.8, 0.4), (4.9, 0.4), (4.9, 0.5), (3.8, 0.5)],                       # thin bar (4)
]
COLORS = ["#FC6255", "#58C4DD", "#83C167", "#FFFF00", "#FF862F"]


def centred():
    pts = np.array([p for poly in RAW for p in poly])
    mn, mx = pts.min(0), pts.max(0)
    c = (mn + mx) / 2
    return [[(float(x - c[0]), float(y - c[1])) for x, y in poly] for poly in RAW]
