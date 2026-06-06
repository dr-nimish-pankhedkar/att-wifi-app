#!/usr/bin/env python3
"""
Generate PWA icons from your café logo.

Usage:
  python3 scripts/generate-pwa-icons.py <logo-url-or-file-path>

Example:
  python3 scripts/generate-pwa-icons.py https://your-supabase-url/storage/v1/object/public/logos/logo.png
  python3 scripts/generate-pwa-icons.py ./my-logo.png

Requires: pip install Pillow requests
"""

import sys
import os
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install Pillow"); sys.exit(1)

SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
OUT_DIR = Path(__file__).parent.parent / "public" / "icons"

def load_image(src: str) -> Image.Image:
    if src.startswith("http://") or src.startswith("https://"):
        try:
            import requests
        except ImportError:
            print("Install requests: pip install requests"); sys.exit(1)
        r = requests.get(src, timeout=10)
        r.raise_for_status()
        from io import BytesIO
        return Image.open(BytesIO(r.content)).convert("RGBA")
    return Image.open(src).convert("RGBA")

def make_rounded(img: Image.Image, size: int) -> Image.Image:
    """Resize + add rounded corners on white background."""
    img = img.resize((size, size), Image.LANCZOS)
    # Paste onto solid bg (for JPEG-friendly output)
    bg = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    bg.paste(img, (0, 0), img)
    return bg.convert("RGB")

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)

    src = sys.argv[1]
    print(f"Loading image from: {src}")
    img = load_image(src)
    print(f"Original size: {img.size}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for size in SIZES:
        out_path = OUT_DIR / f"icon-{size}x{size}.png"
        resized = make_rounded(img, size)
        resized.save(out_path, "PNG")
        print(f"  ✓ {out_path.name}")

    # Apple touch icon (180x180)
    apple = make_rounded(img, 180)
    apple.save(OUT_DIR / "apple-touch-icon.png", "PNG")
    print("  ✓ apple-touch-icon.png")

    # Favicon (32x32)
    fav = make_rounded(img, 32)
    fav.save(Path(__file__).parent.parent / "public" / "favicon.ico", "ICO",
             sizes=[(16,16),(32,32)])
    print("  ✓ favicon.ico")

    print(f"\nDone! {len(SIZES)+2} icons written to public/icons/")
    print("Commit public/icons/ and public/favicon.ico to apply.")

if __name__ == "__main__":
    main()
