"""Reference dump for the fidelity tests: what ManimCE itself produces for each formula.

Run with the ManimCE virtualenv's interpreter (never imported by the companion):

    <ce-venv>/bin/python ce_reference.py <requests.json> <out.json>

``requests.json`` is a list of ``{"latex": str, "packages": [str], "preamble": str}``.
For every request the script builds ``MathTex(latex, tex_template=...)`` exactly like user code
would (``Tex`` for a request with ``"mode": "text"``), and records the TeX document and the SVG that ``tex_to_svg_file`` produced for it
(``tex_to_svg_file`` is the function MathTex calls; it is wrapped here only to see its result).
Work happens in a throw-away directory because ManimCE writes ``media/`` into its cwd.
"""
import json
import os
import sys
import tempfile
import traceback


def main(requests_path, out_path):
    with open(requests_path, encoding="utf-8") as fh:
        requests = json.load(fh)
    out_path = os.path.abspath(out_path)
    with tempfile.TemporaryDirectory(prefix="mfe-ce-ref-") as workdir:
        started_in = os.getcwd()
        try:
            # The folder under its full name. Windows gives a user whose name does not fit eight
            # characters a temporary folder in the short form
            # (C:\Users\LONGNA~1\AppData\Local\Temp), ManimCE hands LaTeX each .tex file with its
            # whole path, and TeX reads the "~" of a file name as its own active character: every
            # formula then ends in "latex failed but did not produce a log file". (The companion
            # renders with a relative media folder, and is spared.)
            run(requests, out_path, os.path.realpath(workdir))
        finally:
            # `run` works inside the folder, and Windows does not remove a folder that is
            # the current one of a process: this one would stay, and the script fail.
            os.chdir(started_in)


def run(requests, out_path, workdir):
    os.chdir(workdir)

    import manim
    from manim import MathTex, Tex, config
    from manim.mobject.text import tex_mobject
    from manim.utils.tex import TexTemplate

    config.verbosity = "ERROR"
    config.media_dir = os.path.join(workdir, "media")

    recorded = []
    original = tex_mobject.tex_to_svg_file

    def recording(expression, environment=None, tex_template=None):
        svg_path = original(expression, environment=environment, tex_template=tex_template)
        recorded.append(svg_path)
        return svg_path

    tex_mobject.tex_to_svg_file = recording

    results = []
    for req in requests:
        recorded.clear()
        entry = {"latex": req["latex"]}
        try:
            template = TexTemplate()
            for package in req.get("packages", []):
                template.add_to_preamble(r"\usepackage{%s}" % package)
            if req.get("preamble"):
                template.add_to_preamble(req["preamble"])
            cls = Tex if req.get("mode") == "text" else MathTex
            mob = cls(req["latex"], tex_template=template)
            svg_path = recorded[-1]
            entry["tex"] = svg_path.with_suffix(".tex").read_text(encoding="utf-8")
            # The file as dvisvgm wrote it, which is what the companion gives: read as text, the
            # CR LF that ends its lines on Windows would come out as LF.
            entry["svg"] = svg_path.read_bytes().decode("utf-8")
            # every mobject with points is one SVG shape (glyph or rule)
            entry["n_shapes"] = len(mob.family_members_with_points())
        except Exception as exc:  # noqa: BLE001 - reported to the test, not hidden
            entry["error"] = f"{type(exc).__name__}: {exc}"
            entry["trace"] = traceback.format_exc()[-1500:]
        results.append(entry)

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump({"manim": manim.__version__, "results": results}, fh)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
