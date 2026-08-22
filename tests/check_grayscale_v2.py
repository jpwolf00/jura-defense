#!/usr/bin/env python3
"""
Verify grayscale separability by sampling actual bright path pixels.
"""
from PIL import Image
import numpy as np

def find_bright_path(image_path):
    """Find the brightest horizontal band (should be the path)."""
    img = Image.open(image_path).convert('L')
    arr = np.array(img)
    
    # Find row with highest average brightness (the path)
    row_means = np.mean(arr, axis=1)
    bright_row = np.argmax(row_means)
    
    # Sample that row
    path_lum = row_means[bright_row]
    
    # Find UI area (top-left corner, dark HUD)
    ui_sample = arr[20:40, 20:100]
    ui_lum = np.mean(ui_sample)
    
    # Find background (middle area, away from path)
    bg_sample = arr[300:350, 600:700]
    bg_lum = np.mean(bg_sample)
    
    # Find slot markers (blue circles, should be brighter than background)
    # Sample around known slot position (250, 350)
    slot_sample = arr[345:355, 245:255]
    slot_lum = np.mean(slot_sample)
    
    print(f"Grayscale luminance analysis for {image_path}:")
    print(f"  Path (brightest row): {path_lum:.1f} at y={bright_row}")
    print(f"  Background (ground):  {bg_lum:.1f}")
    print(f"  Slot marker:          {slot_lum:.1f}")
    print(f"  UI (HUD):             {ui_lum:.1f}")
    
    # Check separability
    MIN_SEP = 30
    checks = [
        ("Path vs Background", abs(path_lum - bg_lum)),
        ("Path vs Slot", abs(path_lum - slot_lum)),
        ("Slot vs Background", abs(slot_lum - bg_lum)),
        ("UI vs Background", abs(ui_lum - bg_lum)),
    ]
    
    print("\nSeparability checks (min 30 luminance diff):")
    all_pass = True
    for name, diff in checks:
        status = "✓" if diff >= MIN_SEP else "✗"
        print(f"  {status} {name}: {diff:.1f}")
        if diff < MIN_SEP:
            all_pass = False
    
    return all_pass

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 check_grayscale_v2.py <image.png>")
        sys.exit(1)
    
    result = find_bright_path(sys.argv[1])
    sys.exit(0 if result else 1)
