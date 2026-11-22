"""What ManimCE and ManimGL build for the same font text: its children, their order, its size.

An export for the library that did not shape a text writes the same `Text(...)` and addresses its
glyphs by the other library's indices (docs/ARCHITECTURE.md §8, "Font text"). This probe measures
what that rests on: it builds every case exactly as a generated scene does, in either library,
and `compare` pairs the two dumps child by child.

    cd <an empty scratch directory>
    <manim_ce venv>/bin/python <repo>/tests/parity/text_children.py ce ce.json
    <manim_gl venv>/bin/python <repo>/tests/parity/text_children.py gl gl.json
    python3 <repo>/tests/parity/text_children.py compare ce.json gl.json

Run it from a scratch directory, never from inside manimlib/: both libraries write their caches
under the working directory here. The fonts of FONTS must be installed (tests/parity/README.md).
"""
import json
import sys

SOURCES = [
    "AVATAR office",
    "fi fl ff ffi ffl",
    "café é Å",
    "ÁÉÍÓÚ ñ ü ¿Qué? ¡Sí!",
    "The quick brown fox jumps over the lazy dog 0123456789",
    "first line\nsecond longer line\nthird",
    "A\n\nV",
    "a\nbbbbbbbb\ncc",
    "office\nfi",
    "  leading and trailing  ",
    "A\tV",
    "x² + y² = z² → ∞",
    "<b>{{literal}}</b> & \\frac{1}{2}",
    "a -> b => c != d",
    "abc אבג xyz",
    "سلام عليكم",
    "日本語 テキスト",
    "i",
    ".",
]
FONTS = [
    ("Noto Serif", "normal", "normal"),
    ("Noto Serif", "bold", "normal"),
    ("Noto Serif", "normal", "italic"),
    ("Noto Sans", "bold", "italic"),
    ("DejaVu Sans", "normal", "normal"),
    ("Liberation Serif", "normal", "normal"),
    ("Fira Code", "normal", "normal"),
    ("Inter", "normal", "normal"),
]
SIZES = [48, 24, 96]
# ManimGL's scene units to ManimCE's at equal font_size (measured: see `compare`'s own figures).
CE_GL_SIZE = 1.4678


def cases():
    for family, weight, slant in FONTS:
        for source in SOURCES:
            yield source, family, weight, slant, 48
    for size in SIZES[1:]:
        for source in SOURCES[:8]:
            yield source, "Noto Serif", "normal", "normal", size


def box(points):
    xs = [float(p[0]) for p in points]
    ys = [float(p[1]) for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def measure(target, out):
    sys.argv = [sys.argv[0]]
    with open("custom_config.yml", "w", encoding="utf-8") as fh:
        fh.write('directories:\n  cache: "probe-cache"\n')
    if target == "ce":
        from manim import Text, config, tempconfig
        config.text_dir = "probe-text"
    else:
        from manimlib import Text
    results = []
    for source, family, weight, slant, size in cases():
        kwargs = dict(font=family, font_size=size, weight=weight.upper(), slant=slant.upper(),
                      disable_ligatures=False)
        row = {"source": source, "family": family, "weight": weight, "slant": slant, "size": size}
        try:
            if target == "ce":
                with tempconfig({"pixel_width": 1920, "pixel_height": 1080}):
                    mob = Text(source, **kwargs)
            else:
                mob = Text(source, alignment="LEFT", **kwargs)
            children = []
            for child in mob.submobjects:
                points = child.get_points() if target == "gl" else child.points
                children.append({"box": box(points) if len(points) else None,
                                 "subpaths": len(child.get_subpaths()),
                                 "family": len(child.submobjects)})
            drawn = [c["box"] for c in children if c["box"]]
            row["children"] = children
            row["box"] = [min(b[0] for b in drawn), min(b[1] for b in drawn),
                          max(b[2] for b in drawn), max(b[3] for b in drawn)] if drawn else None
        except Exception as error:  # the probe reports what a library refuses, too
            row["error"] = f"{type(error).__name__}: {error}"
        results.append(row)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False)
    print(f"{target}: {len(results)} cases, {sum('error' in r for r in results)} errors")


def compare(ce_file, gl_file):
    with open(ce_file, encoding="utf-8") as fh:
        ce = json.load(fh)
    with open(gl_file, encoding="utf-8") as fh:
        gl = json.load(fh)
    counts = empties = orders = outlines = errors = 0
    ratios, widths, heights, shifts = [], [], [], []
    for a, b in zip(ce, gl):
        name = f'{a["family"]} {a["weight"]}/{a["slant"]} {a["size"]} {a["source"]!r}'
        if "error" in a or "error" in b:
            errors += 1
            print(f"ERROR   {name}: ce={a.get('error')} gl={b.get('error')}")
            continue
        ca, cb = a["children"], b["children"]
        if any(c["box"] is None for c in ca + cb):
            empties += 1
            print(f"EMPTY   {name}: ce {sum(c['box'] is None for c in ca)}, "
                  f"gl {sum(c['box'] is None for c in cb)} children without points")
        if len(ca) != len(cb):
            counts += 1
            print(f"COUNT   {name}: ce {len(ca)}, gl {len(cb)}")
            continue
        if not ca:
            continue
        # Same order: child k of one is child k of the other, so both lists walk the text the
        # same way. The step from each child to the next, in ManimCE's units, must point the same
        # way in both, across and down, wherever it is a step at all: a mark over its letter is
        # none across, and the glyphs of one line are none down (a new line is: more than 0.45
        # units at size 48, where the tallest and the lowest glyph of a line sit closer). Sizes,
        # line spacing and tab stops change the lengths of the steps, never their direction.
        still = {0: 0.03 * a["size"] / 48, 1: 0.45 * a["size"] / 48}

        def steps(children, scale, axis):
            centres = [(c["box"][axis] + c["box"][axis + 2]) / 2 * scale for c in children]
            return [q - p for p, q in zip(centres, centres[1:])]
        turned = sum(1 for axis in (0, 1)
                     for p, q in zip(steps(ca, 1.0, axis), steps(cb, CE_GL_SIZE, axis))
                     if abs(p) > still[axis] and abs(q) > still[axis] and (p > 0) != (q > 0))
        if turned:
            orders += 1
            print(f"ORDER   {name}: {turned} steps between neighbours point the other way")
        paths = sum(p["subpaths"] != q["subpaths"] for p, q in zip(ca, cb))
        if paths:
            outlines += 1
            print(f"OUTLINE {name}: {paths} children with another number of subpaths")

        # How far a child sits from its place in the other library, relative to its text's own
        # box, per axis.
        def relative(children, whole):
            w = (whole[2] - whole[0]) or 1.0
            h = (whole[3] - whole[1]) or 1.0
            return [((c["box"][0] + c["box"][2]) / 2 - whole[0]) / w
                    for c in children], [((c["box"][1] + c["box"][3]) / 2 - whole[1]) / h
                                         for c in children]
        ax, ay = relative(ca, a["box"])
        bx, by = relative(cb, b["box"])
        worst = max(max(abs(p - q) for p, q in zip(ax, bx)), max(abs(p - q) for p, q in zip(ay, by)))
        shifts.append((worst, name))
        # Size: the first child is the same glyph in both.
        ha = ca[0]["box"][3] - ca[0]["box"][1]
        hb = cb[0]["box"][3] - cb[0]["box"][1]
        if ha > 1e-6 and hb > 1e-6:
            ratios.append((ha / hb, name))
        wa, wb = a["box"][2] - a["box"][0], b["box"][2] - b["box"][0]
        if wa > 1e-6 and wb > 1e-6:
            widths.append((wa / wb, name))
        if "\n" in a["source"]:
            heights.append(((a["box"][3] - a["box"][1]) / (b["box"][3] - b["box"][1]), name))
    print(f"\n{len(ce)} cases: {errors} errors, {counts} with another number of children, "
          f"{orders} with another order, {outlines} with outlines cut into other subpaths, "
          f"{empties} with children without points")
    for label, values in (("first glyph height CE/GL", ratios), ("whole width CE/GL", widths),
                          ("whole height CE/GL, several lines", heights)):
        if values:
            values.sort()
            print(f"{label}: min {values[0][0]:.5f} ({values[0][1]}), "
                  f"median {values[len(values) // 2][0]:.5f}, max {values[-1][0]:.5f} ({values[-1][1]})")
    shifts.sort()
    print(f"worst relative offset of a child: {shifts[-1][0]:.4f} ({shifts[-1][1]})")


if __name__ == "__main__":
    if sys.argv[1] == "compare":
        compare(sys.argv[2], sys.argv[3])
    else:
        measure(sys.argv[1], sys.argv[2])
