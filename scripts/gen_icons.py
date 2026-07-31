"""生成 Tap 新标签页扩展的图标。
图标为深色圆角方形 + 一个发光的圆角搜索框 + 竖线输入光标，呼应"极简搜索"主题。
"""
from PIL import Image, ImageDraw, ImageFilter


def make(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 背景：深色圆角方形
    radius = int(size * 0.22)
    d.rounded_rectangle(
        [0, 0, size - 1, size - 1],
        radius=radius,
        fill=(22, 24, 30, 255),
    )

    # 搜索框：圆角长方形，居中偏上
    bw = int(size * 0.62)
    bh = max(int(size * 0.16), 6)
    bx = (size - bw) // 2
    by = int(size * 0.34)
    br = max(bh // 2, 3)
    d.rounded_rectangle(
        [bx, by, bx + bw, by + bh],
        radius=br,
        outline=(255, 255, 255, 255),
        width=max(int(size * 0.03), 2),
    )

    # 输入光标：竖线，置于框内中央偏左
    cx = bx + bw // 2 - max(int(size * 0.05), 2)
    cy1 = by + int(bh * 0.28)
    cy2 = by + bh - int(bh * 0.28)
    d.line(
        [cx, cy1, cx, cy2],
        fill=(74, 158, 255, 255),
        width=max(int(size * 0.04), 2),
    )

    # 发光层：仅在大尺寸下叠加
    if size >= 48:
        glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.rounded_rectangle(
            [bx - 2, by - 2, bx + bw + 2, by + bh + 2],
            radius=br + 2,
            outline=(74, 158, 255, 255),
            width=max(int(size * 0.05), 3),
        )
        glow = glow.filter(ImageFilter.GaussianBlur(radius=max(size * 0.03, 1)))
        img = Image.alpha_composite(img, glow)

    return img


def main():
    for s in (16, 32, 48, 128):
        img = make(s)
        img.save(f"icons/icon{s}.png", "PNG")
        print(f"wrote icons/icon{s}.png")


if __name__ == "__main__":
    main()