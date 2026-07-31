"""从 icons/zp-tap.png 派生扩展所需的 16/32/48/128 四档图标。

源图为 1254x1254 高清主图标，这里缩小到 manifest 要求的各尺寸并覆盖旧文件。
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "icons" / "zp-tap.png"
SIZES = (16, 32, 48, 128)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"源图标缺失: {SRC}")
    src = Image.open(SRC).convert("RGBA")
    for s in SIZES:
        out = ROOT / "icons" / f"icon{s}.png"
        im = src.resize((s, s), Image.LANCZOS)
        im.save(out, "PNG")
        print(f"wrote {out.relative_to(ROOT)} ({s}x{s})")


if __name__ == "__main__":
    main()