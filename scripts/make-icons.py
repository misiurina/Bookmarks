#!/usr/bin/env python3
"""Draw the extension icons from the header bookmark mark. No third-party dependencies."""

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"

# Same path as the mark beside the Bookmarks heading, in a 16×16 viewBox.
# M3.6 1.5h8.8A1.1 1.1 0 0 1 13.5 2.6V14.5L8 11.2 2.5 14.5V2.6A1.1 1.1 0 0 1 3.6 1.5z
FILL = (0xA8, 0xC7, 0xFA, 255)


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def arc(cx: float, cy: float, radius: float, start: float, end: float, steps: int) -> list[tuple[float, float]]:
    points = []
    for step in range(1, steps + 1):
        angle = start + (end - start) * step / steps
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return points


def bookmark_polygon() -> list[tuple[float, float]]:
    radius = 1.1
    steps = 48
    points = [(3.6, 1.5), (12.4, 1.5)]
    points.extend(arc(12.4, 2.6, radius, -math.pi / 2, 0, steps))
    points.extend([(13.5, 14.5), (8.0, 11.2), (2.5, 14.5), (2.5, 2.6)])
    points.extend(arc(3.6, 2.6, radius, math.pi, 3 * math.pi / 2, steps))
    return points


POLYGON = bookmark_polygon()


def contains(x: float, y: float) -> bool:
    crossings = 0
    count = len(POLYGON)
    for index in range(count):
        x1, y1 = POLYGON[index]
        x2, y2 = POLYGON[(index + 1) % count]
        if (y1 > y) == (y2 > y):
            continue
        crossing = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
        if x < crossing:
            crossings += 1
    return crossings % 2 == 1


def paint(px: float, py: float, size: int) -> tuple:
    samples = 8
    hits = 0
    for row in range(samples):
        for column in range(samples):
            x = (px + (column + 0.5) / samples) / size * 16
            y = (py + (row + 0.5) / samples) / size * 16
            if contains(x, y):
                hits += 1
    if hits == 0:
        return (0, 0, 0, 0)
    red, green, blue, _alpha = FILL
    return (red, green, blue, round(255 * hits / (samples * samples)))


def write_png(path: Path, size: int) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(paint(x, y, size))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(OUT / f"icon{size}.png", size)


if __name__ == "__main__":
    main()
