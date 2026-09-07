#!/usr/bin/env python3
"""Иконки: точка на бумаге — знак, которым кончается реплика.

    python3 tools/make-icons.py

Пишет icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png (180).
Рисует с четырёхкратным запасом и уменьшает, чтобы край точки был гладким.
"""

from pathlib import Path

from PIL import Image, ImageDraw

PAPER = (0xF5, 0xF2, 0xEC)
INK = (0x2A, 0x27, 0x23)
DOT = 46 / 512  # радиус точки в долях стороны
OUT = Path(__file__).resolve().parent.parent / "icons"


def icon(side: int) -> Image.Image:
    s = side * 4
    img = Image.new("RGB", (s, s), PAPER)
    r = s * DOT
    c = s / 2
    ImageDraw.Draw(img).ellipse((c - r, c - r, c + r, c + r), fill=INK)
    return img.resize((side, side), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, side in [
        ("icon-192.png", 192),
        ("icon-512.png", 512),
        ("icon-maskable-512.png", 512),
        ("apple-touch-icon.png", 180),
    ]:
        icon(side).save(OUT / name, optimize=True)
        print(name)
