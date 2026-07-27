from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent


def lerp(a, b, t):
    return int(a + (b - a) * t)


def sea_color(t):
    return (lerp(26, 47, t), lerp(69, 111, t), lerp(92, 143, t), 255)


def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    s = size / 64.0
    mdraw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(16 * s), fill=255)

    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / max(size - 1, 1)
        bdraw.line([(0, y), (size, y)], fill=sea_color(t))

    img = Image.composite(bg, img, mask)
    draw = ImageDraw.Draw(img)

    white = (247, 245, 242, 255)
    gold_light = (232, 212, 181, 255)

    def pt(x, y):
        return (x * s, y * s)

    def sw(w):
        return max(1, round(w * s))

    draw.line([pt(22, 44), pt(32, 26), pt(42, 44)], fill=white, width=sw(2.2))
    draw.line([pt(18, 40), pt(32, 18), pt(46, 40)], fill=(247, 245, 242, 140), width=sw(2.2))

    for cx, cy in [(22, 44), (32, 26), (42, 44)]:
        r = 3.2 * s
        x, y = pt(cx, cy)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=white)

    sr = 4.2 * s
    sx, sy = pt(44, 22)
    draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=gold_light)

    star = [
        (44, 17.5), (45.8, 21.8), (50.2, 22.2), (46.8, 25),
        (47.8, 29.4), (44, 27.2), (40.2, 29.4), (41.2, 25),
        (37.8, 22.2), (42.2, 21.8),
    ]
    draw.polygon([pt(x, y) for x, y in star], fill=white)

    return img


img32 = draw_icon(32)
img192 = draw_icon(192)
img180 = draw_icon(180)
img16 = draw_icon(16)

img32.save(ROOT / "favicon-32.png")
img192.save(ROOT / "favicon-192.png")
img180.save(ROOT / "apple-touch-icon.png")
img16.save(ROOT / "favicon-16.png")
img32.save(ROOT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
print("Favicons written.")
