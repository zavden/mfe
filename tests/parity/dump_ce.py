"""ManimCE glyph dump: centre, size and point count of every MathTex(s)[0][i].

Usage: python dump_ce.py <corpus.json> <out.json>

Corpus entries are LaTeX strings or {"latex": ..., "packages": [...]}; packages are added to a
default TexTemplate with add_to_preamble (one \\usepackage line each, in order), which is the
document the companion builds for target "ce".
"""
import json
import sys

from manim import MathTex, TexTemplate, config

config.verbosity = "ERROR"


def entry(e):
    if isinstance(e, str):
        return e, []
    return e["latex"], list(e.get("packages", []))


corpus = json.load(open(sys.argv[1], encoding="utf-8"))
out = []
for e in corpus:
    s, packages = entry(e)
    try:
        kwargs = {}
        if packages:
            template = TexTemplate()
            template.add_to_preamble("\n".join(f"\\usepackage{{{p}}}" for p in packages))
            kwargs["tex_template"] = template
        m = MathTex(s, **kwargs)
        part = m[0]
        glyphs = []
        for g in part:
            c = g.get_center()
            glyphs.append({"x": round(float(c[0]), 4), "y": round(float(c[1]), 4),
                           "w": round(float(g.width), 4), "h": round(float(g.height), 4),
                           "npts": int(len(g.points))})
        out.append({"tex": s, "packages": packages, "n": len(glyphs), "glyphs": glyphs,
                    "height": round(float(m.height), 4), "width": round(float(m.width), 4)})
    except Exception as ex:
        out.append({"tex": s, "packages": packages, "error": str(ex)[:200]})
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), indent=1)
print("ok", len(out))
