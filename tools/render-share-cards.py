"""Frame complete artworks for social cards, without cropping their compositions."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

root = Path(sys.argv[1]).resolve()
cards = json.load(sys.stdin)
background = '#101110'
fonts = [Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
         Path('/Library/Fonts/Arial.ttf'), Path('C:/Windows/Fonts/arial.ttf')]
font_path = next((str(p) for p in fonts if p.exists()), None)


def font(size):
    return ImageFont.truetype(font_path, size) if font_path else ImageFont.load_default(size=size)


def local(url):
    path = (root / url.lstrip('/')).resolve()
    if not path.is_relative_to(root):
        raise ValueError('Share-card path escapes the website')
    return path


for card in cards:
    canvas = Image.new('RGB', (1200, 630), background)
    images = card['images']
    gap, margin, top, height = 24, 24, 20, 526
    width = (1200 - 2 * margin - gap * (len(images) - 1)) // len(images)
    for index, url in enumerate(images):
        with Image.open(local(url)) as original:
            artwork = ImageOps.exif_transpose(original).convert('RGBA')
            artwork = ImageOps.contain(artwork, (width, height), Image.Resampling.LANCZOS)
            x = margin + index * (width + gap) + (width - artwork.width) // 2
            y = top + (height - artwork.height) // 2
            canvas.paste(artwork, (x, y), artwork)
    draw = ImageDraw.Draw(canvas)
    size = 23
    while size > 13 and draw.textlength(card['title'], font=font(size)) > 1140:
        size -= 1
    draw.text((600, 572), card['title'], font=font(size), fill='#efeee8', anchor='mm')
    draw.text((600, 607), card['credit'], font=font(14), fill='#b8b7ad', anchor='mm')
    destination = local(card['path'])
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, 'JPEG', quality=88, optimize=True, progressive=True)

print(f'Rendered {len(cards)} complete-artwork share cards at 1200 x 630.')
