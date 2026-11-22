"""ManimGL glyph dump: centre, size and point count of every Tex(s)[i].

Usage: python dump_gl.py <corpus.json> <out.json>

Corpus entries are LaTeX strings or {"latex": ..., "packages": [...]}; packages go through
Tex(additional_preamble=...) (one \\usepackage line each), which is the document the companion
builds for target "gl".
"""
import json
import sys

from manimlib import Tex


def entry(e):
    if isinstance(e, str):
        return e, []
    return e["latex"], list(e.get("packages", []))


corpus = json.load(open(sys.argv[1], encoding="utf-8"))
out = []
for e in corpus:
    s, packages = entry(e)
    try:
        preamble = "\n".join(f"\\usepackage{{{p}}}" for p in packages)
        m = Tex(s, additional_preamble=preamble)
        glyphs = []
        for g in m.submobjects:
            c = g.get_center()
            glyphs.append({"x": round(float(c[0]), 4), "y": round(float(c[1]), 4),
                           "w": round(float(g.get_width()), 4), "h": round(float(g.get_height()), 4),
                           "npts": int(len(g.get_points()))})
        out.append({"tex": s, "packages": packages, "n": len(glyphs), "glyphs": glyphs,
                    "height": round(float(m.get_height()), 4), "width": round(float(m.get_width()), 4)})
    except Exception as ex:
        out.append({"tex": s, "packages": packages, "error": (type(ex).__name__ + ": " + str(ex))[:300]})
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), indent=1)
print("ok", len(out))
