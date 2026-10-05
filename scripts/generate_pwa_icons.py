from pathlib import Path

from PIL import Image, ImageDraw


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "static" / "icons"
SCALE = 4


def scaled(value: float) -> int:
    return round(value * SCALE)


def create_icon(size: int, *, maskable: bool = False) -> Image.Image:
    canvas_size = size * SCALE
    image = Image.new("RGB", (canvas_size, canvas_size), "#6657ee")
    draw = ImageDraw.Draw(image)

    center = size / 2
    person_radius = size * 0.075
    people = [
        (center, size * 0.30),
        (size * 0.31, size * 0.56),
        (size * 0.69, size * 0.56),
    ]
    stroke = scaled(size * 0.046)
    connector = scaled(size * 0.035)

    draw.line(
        [(scaled(center), scaled(size * 0.38)), (scaled(size * 0.38), scaled(size * 0.52))],
        fill="#ffffff",
        width=connector,
    )
    draw.line(
        [(scaled(center), scaled(size * 0.38)), (scaled(size * 0.62), scaled(size * 0.52))],
        fill="#ffffff",
        width=connector,
    )
    draw.line(
        [(scaled(size * 0.37), scaled(size * 0.62)), (scaled(size * 0.63), scaled(size * 0.62))],
        fill="#ffffff",
        width=connector,
    )

    for x, y in people:
        draw.ellipse(
            (
                scaled(x - person_radius),
                scaled(y - person_radius),
                scaled(x + person_radius),
                scaled(y + person_radius),
            ),
            fill="#ffffff",
        )

    coin_radius = size * 0.115
    draw.ellipse(
        (
            scaled(center - coin_radius),
            scaled(size * 0.61),
            scaled(center + coin_radius),
            scaled(size * 0.61 + coin_radius * 2),
        ),
        fill="#ee5675",
        outline="#ffffff",
        width=stroke,
    )
    equal_width = size * 0.105
    equal_height = size * 0.018
    for offset in (size * 0.69, size * 0.735):
        draw.rounded_rectangle(
            (
                scaled(center - equal_width / 2),
                scaled(offset),
                scaled(center + equal_width / 2),
                scaled(offset + equal_height),
            ),
            radius=scaled(equal_height / 2),
            fill="#ffffff",
        )

    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in (32, 180, 192, 512):
        create_icon(size).save(OUTPUT_DIR / f"fairshare-{size}.png", optimize=True)
    create_icon(512, maskable=True).save(OUTPUT_DIR / "fairshare-maskable-512.png", optimize=True)


if __name__ == "__main__":
    main()
