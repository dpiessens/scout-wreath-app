"""Cut product thumbnails out of the wreath flyer scans.

Usage:
    python tools/crop_flyer.py [page1.jpg] [page2.jpg]

Defaults to tools/flyer/scan-1.jpg (items 1–19) and scan-2.jpg (items 20–22).
Writes app/img/w<number>.jpg.

The scans are sideways (text runs top to bottom), so each crop is rotated upright. Boxes are
fractions of the page (x0, y0, x1, y1), so they work at any scan resolution.
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "app" / "img"
SCANS = ROOT / "tools" / "flyer"
SIZE = 320  # thumbnails show at 72px; 320 stays sharp on high-density screens


def box(x0, y0, x1, y1, w, h):
    """Box measured in pixels on a w×h reference copy of the page, as fractions."""
    return (x0 / w, y0 / h, x1 / w, y1 / h)


# Page 1: items 1–19, measured on a 1285×2000 copy.
P1 = lambda *b: box(*b, 1285, 2000)
PAGE1 = {
    1: P1(975, 55, 1248, 318),
    2: P1(975, 360, 1245, 645),
    3: P1(980, 690, 1250, 968),
    4: P1(980, 1030, 1250, 1318),
    5: P1(975, 1365, 1250, 1648),
    6: P1(975, 1685, 1250, 1972),
    7: P1(560, 38, 825, 325),
    8: P1(560, 360, 825, 648),
    9: P1(555, 690, 815, 968),
    10: P1(545, 1085, 810, 1275),
    11: P1(600, 1350, 720, 1650),
    15: P1(138, 686, 296, 752),
    16: P1(140, 855, 280, 955),
}

# Page 2: items 20–22, measured on a 1876×1994 copy.
P2 = lambda *b: box(*b, 1876, 1994)
PAGE2 = {
    20: P2(1080, 1340, 1820, 1930),
    21: P2(690, 95, 1790, 1270),
    22: P2(70, 1390, 610, 1870),
}


# Flyer leftovers inside a crop (item-number tags, borders, caption text), painted white.
# Rectangles are in finished-thumbnail pixels (SIZE × SIZE, upright).
ERASE = {
    1: [(0, 0, 40, 58)],
    2: [(0, 0, 55, 60)],
    3: [(0, 0, 48, 64)],
    4: [(0, 0, 56, 68)],
    5: [(0, 0, 50, 60)],
    6: [(0, 0, 50, 62), (0, 303, 320, 320)],
    7: [(0, 0, 50, 64)],
    8: [(0, 0, 52, 66)],
    9: [(0, 0, 52, 60)],
    11: [(0, 0, 6, 320)],
    15: [(0, 0, 96, 320)],
    16: [(0, 0, 115, 80)],
    20: [(0, 0, 42, 320), (0, 0, 80, 30)],
    21: [(0, 0, 320, 18), (0, 300, 320, 320)],
    22: [(0, 312, 320, 320)],
}


def crop_page(path: Path, boxes: dict) -> None:
    page = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    w, h = page.size
    for number, (x0, y0, x1, y1) in boxes.items():
        part = page.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))
        part = part.rotate(90, expand=True)  # scans are turned 90° clockwise
        # Pad to a square on white so the whole item shows in a square thumbnail.
        side = max(part.size)
        square = Image.new("RGB", (side, side), "white")
        square.paste(part, ((side - part.width) // 2, (side - part.height) // 2))
        thumb = square.resize((SIZE, SIZE), Image.LANCZOS)
        for rect in ERASE.get(number, []):
            thumb.paste("white", rect)
        thumb.save(IMG / f"w{number}.jpg", quality=85)
        print(f"w{number}.jpg")


if __name__ == "__main__":
    page1 = Path(sys.argv[1]) if len(sys.argv) > 1 else SCANS / "scan-1.jpg"
    page2 = Path(sys.argv[2]) if len(sys.argv) > 2 else SCANS / "scan-2.jpg"
    crop_page(page1, PAGE1)
    crop_page(page2, PAGE2)
