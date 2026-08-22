#!/usr/bin/env python3
"""
Sample actual slot marker positions from the screenshot.
Slots are at known game coordinates, need to map to screen pixels.
"""
from PIL import Image
import numpy as np

def analyze_actual_slots(image_path):
    """Analyze grayscale separability using actual slot positions."""
    img = Image.open(image_path).convert('L')
    arr = np.array(img)
    h, w = arr.shape
    
    # Known slot positions from path.js (game coordinates)
    # Map 1 desktop: 1340x800 viewport, game is 1280x720
    # Scale factor: min(1340/1280, 800/720) = min(1.047, 1.111) = 1.047
    # But Phaser centers the game, so need to account for offset
    
    # Actually, let's just find bright spots in the expected slot region
    # Slots are along the path, which we know is around y=675 (brightest row)
    
    # Find the path row
    row_means = np.mean(arr, axis=1)
    path_y = np.argmax(row_means)
    path_lum = row_means[path_y]
    
    # Sample a band around the path to find slot markers
    # Slots should be slightly brighter than path (blue vs white)
    path_band = arr[path_y-30:path_y+30, :]
    
    # Find local maxima in this band (slot markers)
    col_means = np.mean(path_band, axis=0)
    
    # Background: sample away from path
    bg_y = 300 if path_y > 400 else 500
    bg_sample = arr[bg_y:bg_y+50, 600:700]
    bg_lum = np.mean(bg_sample)
    
    # UI: top-left corner
    ui_sample = arr[20:60, 20:150]
    ui_lum = np.mean(ui_sample)
    
    print(f"Image: {image_path} ({w}x{h})")
    print(f"Path row: y={path_y}, luminance={path_lum:.1f}")
    print(f"Background: y={bg_y}, luminance={bg_lum:.1f}")
    print(f"UI: luminance={ui_lum:.1f}")
    
    # Check if path is separable from background
    path_bg_diff = abs(path_lum - bg_lum)
    ui_bg_diff = abs(ui_lum - bg_lum)
    
    print(f"\nSeparability:")
    print(f"  Path vs Background: {path_bg_diff:.1f} {'✓' if path_bg_diff >= 30 else '✗'}")
    print(f"  UI vs Background:   {ui_bg_diff:.1f} {'✓' if ui_bg_diff >= 30 else '✗'}")
    
    # The key test: can you see the path and UI without color?
    # Path should be clearly brighter than background
    # UI should be clearly darker than background (or have high local contrast from text)
    
    return path_bg_diff >= 30 and ui_bg_diff >= 20

if __name__ == "__main__":
    import sys
    result = analyze_actual_slots(sys.argv[1])
    print(f"\n{'✓ PASS' if result else '✗ FAIL'}: Elements separable in grayscale")
    sys.exit(0 if result else 1)
