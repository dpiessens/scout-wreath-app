"""Draw the app's home-screen icons (a wreath with a red bow) into app/img/.

    python tools/make_icons.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "app" / "img"
GREEN_BG = (31, 81, 48)
LEAF = (86, 160, 90)
LEAF_DARK = (58, 124, 66)
RED = (214, 48, 42)
BERRY = (190, 30, 30)


def draw(size: int) -> Image.Image:
    s = size * 4  # draw large, then shrink for smooth edges
    img = Image.new("RGB", (s, s), GREEN_BG)
    d = ImageDraw.Draw(img)
    c = s / 2
    # Keep everything inside the central 80% so maskable crops don't clip it.
    outer, inner = s * 0.33, s * 0.19
    d.ellipse((c - outer, c - outer, c + outer, c + outer), fill=LEAF)
    d.ellipse((c - inner, c - inner, c + inner, c + inner), fill=GREEN_BG)
    # Texture: darker tufts around the ring.
    ring = (outer + inner) / 2
    tuft = (outer - inner) * 0.28
    for i in range(16):
        a = i * math.tau / 16
        x, y = c + ring * math.cos(a), c + ring * math.sin(a)
        d.ellipse((x - tuft, y - tuft, x + tuft, y + tuft), fill=LEAF_DARK)
    # Berries.
    for a in (0.6, 2.5, 4.1):
        x, y = c + ring * math.cos(a), c + ring * math.sin(a)
        r = s * 0.025
        d.ellipse((x - r, y - r, x + r, y + r), fill=BERRY)
    # Bow at the bottom: two loops, two tails and a knot.
    by = c + ring
    w = s * 0.13
    d.polygon([(c, by), (c - w, by - w * 0.7), (c - w, by + w * 0.7)], fill=RED)
    d.polygon([(c, by), (c + w, by - w * 0.7), (c + w, by + w * 0.7)], fill=RED)
    d.polygon([(c - s * 0.02, by), (c - w * 0.8, by + w * 1.6), (c - w * 0.35, by + w * 1.6)], fill=RED)
    d.polygon([(c + s * 0.02, by), (c + w * 0.8, by + w * 1.6), (c + w * 0.35, by + w * 1.6)], fill=RED)
    k = s * 0.035
    d.ellipse((c - k, by - k, c + k, by + k), fill=(170, 30, 26))
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        draw(size).save(OUT / name)
        print(name)
