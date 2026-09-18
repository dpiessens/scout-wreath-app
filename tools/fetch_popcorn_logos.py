"""Download the popcorn flavor logos from Pop's Kettle Corn (orderpops.com) as thumbnails.

    python tools/fetch_popcorn_logos.py

Writes app/img/p<number>.jpg, matching the ids in app/js/products.js. Used with permission:
Pop's is the vendor the Pack orders through. Lemon Bar (#4) isn't on their site.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "app" / "img"
SIZE = 320  # same as the wreath thumbnails
CDN = "https://cdn.shopify.com/s/files/1/2551/6908/files/"

# Product id → the flavor's logo, the first image on its orderpops.com product page.
LOGOS = {
    "p1": "OpeMixFrontLabel_WebCircle-01.png",                 # Ope Mix
    "p2": "0-5.png",                                           # The OG Kettle
    "p3": "0-6_ed18d929-6114-4bc5-a435-8baf70fd8df6.png",      # Caramel Kettle
    "p5": "0-7.png",                                           # Birthday Cake
    "p6": "PartyMix_FrontLabel23_WEB-01.png",                  # Party Mix
    "p7": "Screenshot_2025-06-30_at_2.54.01_PM.png",           # Signature Blend (Muskego Mix)
    "p8": "YellowChedFrontLabel2023_Web-01.png",               # Yellow Cheddar
    "p9": "ClassicWhiteChed23_FrontLabel-01.png",              # White Cheddar
    "p10": "0-6.png",                                          # Jalapeno Cheddar
    "p11": "COSS_FrontLabel_2023_WEB-01.png",                  # Coconut Oil & Sea Salt
}


def fetch(name: str) -> Image.Image:
    req = urllib.request.Request(f"{CDN}{name}?width={SIZE}", headers={"User-Agent": "scout-orders-thumbnails"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return Image.open(io.BytesIO(res.read()))


if __name__ == "__main__":
    for pid, name in LOGOS.items():
        img = fetch(name).convert("RGBA")
        # Round logos have transparent corners; put them on white and pad to a square.
        side = max(img.size)
        square = Image.new("RGB", (side, side), "white")
        square.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
        out = OUT / f"{pid}.jpg"
        square.resize((SIZE, SIZE), Image.LANCZOS).save(out, quality=85)
        print(f"{out.name}  {out.stat().st_size // 1024} KB")
