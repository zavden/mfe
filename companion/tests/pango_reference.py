"""Independent actual-Text point oracle, run only in an existing Manim interpreter."""
import json
import os
import sys
from xml.etree import ElementTree as ET

target, request_file, output_file = sys.argv[1:]
sys.argv = [sys.argv[0]]
with open("custom_config.yml", "w", encoding="utf-8") as fh:
    fh.write('directories:\n  cache: "reference-cache"\n')
if target == "ce":
    from manim import Text, config
    from manim.mobject.text.text_mobject import TEXT_MOB_SCALE_FACTOR
    calibration = TEXT_MOB_SCALE_FACTOR
    config.pixel_width, config.pixel_height = 1920, 1080
    config.text_dir = "reference-text"
else:
    from manimlib import Text
    from manimlib.mobject.svg.text_mobject import get_text_mob_scale_factor
    calibration = get_text_mob_scale_factor()
with open(request_file, encoding="utf-8") as fh:
    requests = json.load(fh)
results = []
for request in requests:
    kwargs = dict(font=request["font"]["family"], font_size=request["fontSize"],
                  weight=request["font"]["weight"].upper(), slant=request["font"]["slant"].upper(),
                  disable_ligatures=False)
    if target == "gl":
        kwargs["alignment"] = "LEFT"
    mob = Text(request["source"], **kwargs)
    raw = Text(request["source"], should_center=False, **kwargs)
    raw_center = raw.get_center()
    if target == "ce":
        with open(raw.file_name, encoding="utf-8") as fh:
            svg = fh.read()
    else:
        svg = raw.svg_string
    # Cairo glyph uses are positioned on their baselines. They independently expose the
    # native SVG origin needed to check metadata, without importing the companion adapter.
    baselines = [(float(raw_center[1]) - float(node.get("y", "0"))) * calibration
                 for node in ET.fromstring(svg).iter() if node.tag.rsplit("}", 1)[-1] == "use"]
    results.append({"children": [
        {"points": (child.get_points() if target == "gl" else child.points).tolist(),
         "subpaths": [path.tolist() for path in child.get_subpaths()]}
        for child in mob.submobjects], "svgBaselines": baselines, "calibration": calibration})
with open(output_file, "w", encoding="utf-8") as fh:
    json.dump(results, fh)
