#!/usr/bin/env python3
"""
jura-defense sprite cutter: trim studio background -> auto-crop -> 96px grid -> sprites.json

Handles the Flux batch outputs in assets/generated/: each is a 1024px image of a
subject centered on a near-uniform dark teal studio background (per the batch
prompts). Algorithm per image:
  1. Flood-fill from the border with a color tolerance to mask background
  2. Keep the largest connected non-background region (kills bokeh specks)
  3. Bounding-box crop with a small margin
  4. Scale to fit into GRID (96px) square, preserving aspect, on transparency
  5. Record { id, kind, file, w, h, ox, oy, scale } into sprites.json

Usage: python3 cut_sprites.py [--grid 96] [--padding 6] [--bg-tolerance 26]
Output: assets/sprites/*.png + assets/sprites/sprites.json
"""
import argparse, json, math, os
from pathlib import Path
from typing import Optional

try:
    from PIL import Image
except ImportError:
    raise SystemExit("Pillow required: pip install pillow")

GEN = Path.home() / "jura-defense/assets/generated"
OUT = Path.home() / "jura-defense/assets/sprites"

META = {
    "dino_raptor":  {"kind": "enemy", "anim_frames": 4, "frame_ms": 160},
    "dino_hadro":   {"kind": "enemy", "anim_frames": 4, "frame_ms": 160},
    "dino_trice":   {"kind": "enemy", "anim_frames": 4, "frame_ms": 180},
    "dino_anky":    {"kind": "enemy", "anim_frames": 4, "frame_ms": 180},
    "dino_pterano": {"kind": "enemy", "anim_frames": 3, "frame_ms": 120, "flying": True},
    "dino_trex":    {"kind": "enemy", "anim_frames": 4, "frame_ms": 200},
    "tower_tranq":  {"kind": "tower", "anim_frames": 1, "frame_ms": 0},
    "tower_drone":  {"kind": "tower", "anim_frames": 1, "frame_ms": 0},
    "tower_aoe":    {"kind": "tower", "anim_frames": 1, "frame_ms": 0},
    "tower_chrono": {"kind": "tower", "anim_frames": 2, "frame_ms": 200, "glow": True},
    "hero_bg":      {"kind": "background", "anim_frames": 1, "frame_ms": 0},
    "portal":       {"kind": "portal", "anim_frames": 4, "frame_ms": 150},
}

def flood_mask(img, tol):
    """Return mask False where pixel is background.

    The studio backdrops are dark teal: strongly blue-green with LOW red
    (typical edge pixel ~(7,27,29): G-R and B-R are big). The dinosaurs are
    warm/neutral: their red channel is comparable to or higher than green/blue.
    So mask on chroma (teal-ness) instead of brightness — immune to the
    backdrop's vertical gradient and the dark-slate body tones.
    """
    w, h = img.size
    px = img.convert("RGB").load()
    keep = [[True] * w for _ in range(h)]  # True = keep (foreground)
    from collections import deque
    # Seed from borders
    dq = deque()
    for x in range(w):
        dq.append((x, 0)); dq.append((x, h - 1))
    for y in range(h):
        dq.append((0, y)); dq.append((w - 1, y))
    seen = set()
    # tolerance budget on the chroma gap (G-R) and (B-R)
    gap_min = max(3, tol // 3)   # minimum teal-gap to call something background
    while dq:
        x, y = dq.popleft()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        r, g, b = px[x, y]
        g_minus_r = g - r
        b_minus_r = b - r
        if g_minus_r >= gap_min and b_minus_r >= gap_min:
            keep[y][x] = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                    dq.append((nx, ny))
    return keep, None

def largest_region(mask):
    """Mask of the largest connected True region (the subject)."""
    from collections import deque
    w = len(mask[0]); h = len(mask)
    best = set(); seen = set()
    for y in range(h):
        for x in range(w):
            if mask[y][x] and (x, y) not in seen:
                comp = set(); dq = deque([(x, y)]); seen.add((x, y))
                while dq:
                    cx, cy = dq.popleft()
                    comp.add((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and (nx, ny) not in seen:
                            seen.add((nx, ny)); dq.append((nx, ny))
                if len(comp) > len(best):
                    best = comp
    return best

def process(png: Path, pid: str, grid: int, pad: int, tol: int) -> Optional[dict]:
    img = Image.open(png).convert("RGBA")
    mask, bg = flood_mask(img, tol)
    region = largest_region(mask)
    if len(region) < 500:  # nothing usable
        print(f"  !! {pid}: subject too small ({len(region)} px) — background may have bled")
        return None
    xs = [p[0] for p in region]; ys = [p[1] for p in region]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    crop = img.crop((x0, y0, x1 + 1, y1 + 1)).copy()
    # Apply the discovered foreground region as alpha. Previously we used the
    # mask only to find the crop bounds, which left the studio backdrop inside
    # each rectangle and made units look like opaque cards in the game.
    alpha = Image.new("L", crop.size, 0)
    apx = alpha.load()
    for rx, ry in region:
        if x0 <= rx <= x1 and y0 <= ry <= y1:
            apx[rx - x0, ry - y0] = 255
    crop.putalpha(alpha)
    # Scale to fit grid with padding
    cw, ch = crop.size
    scale = (grid - 2 * pad) / max(cw, ch)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    canvas = Image.new("RGBA", (grid, grid), (0, 0, 0, 0))
    ox, oy = (grid - nw) // 2, grid - nh - pad  # bottom-center anchor (feet on ground)
    crop = crop.resize((nw, nh), Image.LANCZOS)
    canvas.alpha_composite(crop, (ox, oy))
    out_name = f"{pid}.png"
    canvas.save(OUT / out_name)
    return {
        "id": pid, "file": out_name, "grid": grid,
        "src": png.name, "bg": bg, "w": nw, "h": nh, "ox": ox, "oy": oy,
        "scale": round(scale, 4), "crop": [x0, y0, x1, y1],
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", type=int, default=96)
    ap.add_argument("--padding", type=int, default=6)
    ap.add_argument("--bg-tolerance", type=int, default=26)
    ap.add_argument("--inputs", nargs="*", default=[])
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    files = [Path(p) for p in args.inputs] if args.inputs else sorted(GEN.glob("jura_*.png"))
    # Drop the smoke-test image unless explicitly listed
    files = [f for f in files if "smoke" not in f.name or args.inputs]
    if not files:
        print("no batch outputs yet — nothing to cut"); return

    manifest = {}
    for f in files:
        pid = f.stem.replace("jura_", "")
        # strip ComfyUI sequence suffix like _00001_
        pid = pid.split("_0000")[0] if "_0000" in pid else pid
        if pid not in META:
            print(f"  -- {pid}: no meta entry, skipping"); continue
        kind = META[pid]["kind"]
        if kind == "background":
            # Backdrops stay full-size — never cut to the sprite grid.
            img = Image.open(f)
            dest = OUT / f.name
            img.convert("RGBA").save(dest)
            manifest[pid] = {
                "id": pid, "kind": kind, "file": f.name, "grid": 0,
                "src": f.name, "w": img.width, "h": img.height,
                "ox": 0, "oy": 0, "scale": 1.0, "crop": [0, 0, img.width, img.height],
                "anim_frames": META[pid]["anim_frames"], "frame_ms": META[pid]["frame_ms"],
            }
            print(f"  bg kept full-size: {img.width}x{img.height}")
            continue
        print(f"cut {f.name} -> {pid} ...")
        rec = process(f, pid, args.grid, args.padding, args.bg_tolerance)
        if rec:
            rec.update(META[pid])
            manifest[pid] = rec
    with open(OUT / "sprites.json", "w") as fp:
        json.dump(manifest, fp, indent=2)
    print(f"\nsprites.json: {len(manifest)} entries -> {OUT}")

if __name__ == "__main__":
    main()