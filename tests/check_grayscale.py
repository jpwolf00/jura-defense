#!/usr/bin/env python3
"""
Verify grayscale separability of terrain elements.
Checks that route, buildable space, entities, and UI have distinct luminance values.
"""
from PIL import Image
import numpy as np

def analyze_grayscale_separability(image_path):
    """Analyze if key elements are separable in grayscale."""
    img = Image.open(image_path).convert('L')  # Convert to grayscale
    arr = np.array(img)
    
    # Sample regions (approximate coordinates from 1340x800 desktop screenshot)
    # Route: white path around y=400-450, x=200-300
    route_sample = arr[400:450, 200:300]
    route_lum = np.mean(route_sample)
    
    # Buildable space: blue slot markers around (250, 350)
    slot_sample = arr[340:360, 240:260]
    slot_lum = np.mean(slot_sample)
    
    # Background: dark green terrain around (600, 300)
    bg_sample = arr[280:320, 580:620]
    bg_lum = np.mean(bg_sample)
    
    # UI: top-left HUD text area around (50, 50)
    ui_sample = arr[40:60, 40:100]
    ui_lum = np.mean(ui_sample)
    
    print(f"Grayscale luminance analysis for {image_path}:")
    print(f"  Route (path):        {route_lum:.1f}")
    print(f"  Buildable (slot):    {slot_lum:.1f}")
    print(f"  Background (ground): {bg_lum:.1f}")
    print(f"  UI (HUD):            {ui_lum:.1f}")
    
    # Check separability (minimum 30 luminance difference)
    MIN_SEP = 30
    checks = [
        ("Route vs Background", abs(route_lum - bg_lum)),
        ("Slot vs Background", abs(slot_lum - bg_lum)),
        ("UI vs Background", abs(ui_lum - bg_lum)),
        ("Route vs Slot", abs(route_lum - slot_lum)),
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
        print("Usage: python3 check_grayscale.py <image.png>")
        sys.exit(1)
    
    result = analyze_grayscale_separability(sys.argv[1])
    sys.exit(0 if result else 1)
