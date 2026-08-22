#!/usr/bin/env python3
"""Tighten sprite crop metadata to the exact alpha bounding box.

The cut pipeline computes ox/oy/w/h from the pre-resize crop, then LANCZOS
resizes + rounds, which leaves a few px of transparent slack. This reads each
final PNG, finds the exact non-transparent bounds, and rewrites ox/oy/w/h so
drawImage(img, ox, oy, w, h, ...) crops pixel-tight.

Usage: python3 scripts/tighten_crops.py
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path.home() / "jura-defense"
SPR = ROOT / "assets/sprites"
MANIFEST = SPR / "sprites.json"

manifest = json.load(open(MANIFEST))

ALPHA_THRESH = 8  # ignore near-transparent anti-alias fringe

for pid, meta in manifest.items():
    if meta.get("grid", 0) == 0:  # full-size backgrounds — skip
        continue
    png = SPR / meta["file"]
    if not png.exists():
        continue
    img = Image.open(png).convert("RGBA")
    alpha = img.getchannel("A")
    bbox = alpha.point(lambda v: 255 if v >= ALPHA_THRESH else 0).getbbox()
    if bbox is None:
        print(f"  {pid}: fully transparent — skipping")
        continue
    x0, y0, x1, y1 = bbox
    new_w = x1 - x0 + 1
    new_h = y1 - y0 + 1
    old = (meta.get("ox"), meta.get("oy"), meta.get("w"), meta.get("h"))
    new = (x0, y0, new_w, new_h)
    meta["ox"], meta["oy"], meta["w"], meta["h"] = new
    delta = "" if old == new else f"  (was ox={old[0]} oy={old[1]} w={old[2]} h={old[3]})"
    print(f"  {pid}: ox={x0} oy={y0} w={new_w} h={new_h}{delta}")

json.dump(manifest, open(MANIFEST, "w"), indent=2)
print(f"\nupdated {MANIFEST}")
