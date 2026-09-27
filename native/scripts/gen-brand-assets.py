#!/usr/bin/env python3
"""Regenerates every icon / splash image (web + Android + iOS + desktop) from the logo geometry below.
Needs: pip install playwright pillow, and a Chromium/Chrome (set CHROME=/path if not /usr/bin/google-chrome).
Run from anywhere:  python3 native/scripts/gen-brand-assets.py"""
import io, os, glob
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BRAND = '#16499B'
ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / 'native'
# The mark (phone + padlock) in a 512 box; white strokes, keyhole in brand colour.
MARK = f'''<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
  <rect x="160" y="88" width="192" height="336" rx="40" stroke-width="24"/><path d="M232 132h48" stroke-width="16"/>
  <path d="M222 262v-26a34 34 0 0 1 68 0v26" stroke-width="20"/></g>
  <rect x="202" y="258" width="108" height="88" rx="16" fill="#fff"/>
  <circle cx="256" cy="296" r="11" fill="{BRAND}"/><path d="M256 300v18" stroke="{BRAND}" stroke-width="10" stroke-linecap="round"/>'''

def svg(size, *, bg=True, rx=112, scale=1.0, w=None, h=None):
    """bg: brand background; rx: corner radius (512 units); scale: mark scale around centre."""
    w = w or size; h = h or size
    vb_w, vb_h = 512 * w / min(w, h), 512 * h / min(w, h)
    ox, oy = (vb_w - 512) / 2, (vb_h - 512) / 2
    back = f'<rect x="{-ox}" y="{-oy}" width="{vb_w}" height="{vb_h}" rx="{rx}" fill="{BRAND}"/>' if bg else ''
    t = f'translate({256 - 256 * scale} {256 - 256 * scale}) scale({scale})'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{-ox} {-oy} {vb_w} {vb_h}">'
            f'{back}<g transform="{t}">{MARK}</g></svg>')

def render(page, markup, w, h, alpha=True):
    page.set_viewport_size({'width': w, 'height': h})
    page.set_content(f'<html><body style="margin:0;background:transparent">{markup}</body></html>')
    png = page.locator('svg').first.screenshot(omit_background=True)
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    return im if alpha else im.convert('RGB')

def save(im, path, size=None):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    if size and im.size != size: im = im.resize(size, Image.LANCZOS)
    im.save(path, optimize=True); print('  ', path.relative_to(ROOT), im.size)

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'))
        pg = b.new_page()
        big = 1024
        rounded = render(pg, svg(big), big, big)                       # "any" icon, rounded corners
        square = render(pg, svg(big, rx=0), big, big, alpha=False)     # full-bleed (maskable / iOS)
        fg = render(pg, svg(big, bg=False, scale=1.18), big, big)      # adaptive foreground (inset handled by XML)
        # desktop: rounded square with the usual transparent margin
        desk = Image.new('RGBA', (big, big)); desk.paste(rounded.resize((840, 840), Image.LANCZOS), (92, 92))

        print('web'); (ROOT / 'icons/icon.svg').write_text(svg(512).replace(' width="512" height="512"', '') + '\n')
        save(rounded, ROOT / 'icons/icon-192.png', (192, 192)); save(rounded, ROOT / 'icons/icon-512.png', (512, 512))
        save(square, ROOT / 'icons/maskable-192.png', (192, 192)); save(square, ROOT / 'icons/maskable-512.png', (512, 512))
        save(square, ROOT / 'icons/apple-touch-icon.png', (180, 180)); save(rounded, ROOT / 'icons/favicon-32.png', (32, 32))

        print('native sources'); A = NATIVE / 'assets'
        save(square, A / 'icon-only.png'); save(fg, A / 'icon-foreground.png')
        save(Image.new('RGB', (big, big), BRAND), A / 'icon-background.png')
        # Sized so the mark matches the web launch animation (116 CSS px box) when the OS scales the image:
        # iOS aspect-fills the square image by screen height (~844pt), Android stretches per-density bitmaps.
        splash = render(pg, svg(2732, rx=0, scale=0.14), 2732, 2732, alpha=False)
        save(splash, A / 'splash.png'); save(splash, A / 'splash-dark.png')
        save(desk, NATIVE / 'build/icon.png')

        print('android'); res = NATIVE / 'android/app/src/main/res'
        for f in glob.glob(str(res / 'mipmap-*/ic_launcher*.png')):
            n = Path(f).name; sz = Image.open(f).size
            if n == 'ic_launcher.png': im = rounded
            elif n == 'ic_launcher_round.png':
                im = square.convert('RGBA'); m = Image.new('L', im.size, 0)
                ImageDraw.Draw(m).ellipse((0, 0, big - 1, big - 1), fill=255); im.putalpha(m)
            elif n == 'ic_launcher_foreground.png': im = fg
            else: im = Image.new('RGB', (big, big), BRAND)
            save(im, f, sz)
        for f in glob.glob(str(res / 'drawable*/splash.png')):
            w, h = Image.open(f).size
            save(render(pg, svg(min(w, h), rx=0, scale=0.36, w=w, h=h), w, h, alpha=False), f)

        print('ios'); ios = NATIVE / 'ios/App/App/Assets.xcassets'
        save(square, ios / 'AppIcon.appiconset/AppIcon-512@2x.png', (1024, 1024))
        for f in glob.glob(str(ios / 'Splash.imageset/*.png')):
            save(splash, f, Image.open(f).size)
        b.close()

if __name__ == '__main__':
    main()
