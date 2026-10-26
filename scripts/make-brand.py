"""Gera os ativos de marca em public/ a partir de faviconbolso.png e logobolso.png (na raiz).

  python3 scripts/make-brand.py

- ícone do app / iPhone / PWA: carteira preta sobre fundo branco (o iOS pinta fundo transparente de preto)
- favicon: mesma ideia, cantos arredondados, para ficar visível em abas claras e escuras
- logo: preto com fundo transparente e recortada; no tema escuro o CSS inverte a cor
"""
from PIL import Image, ImageDraw, ImageChops

SRC_ICON, SRC_LOGO, OUT = "faviconbolso.png", "logobolso.png", "public"

glyph = Image.open(SRC_ICON).convert("RGBA")
glyph = glyph.crop(glyph.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox())


def app_icon(size, fill=0.56, radius=0.0):
    """Carteira centralizada (ocupa `fill` do lado maior) sobre fundo branco."""
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    scale = size * fill / max(glyph.size)
    g = glyph.resize((round(glyph.width * scale), round(glyph.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(g, ((size - g.width) // 2, (size - g.height) // 2))
    if radius:
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius), fill=255)
        canvas.putalpha(mask.resize((size, size), Image.LANCZOS))
    return canvas


# 0.56 mantém a carteira dentro da zona segura de 80% dos ícones "maskable"
for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
    app_icon(size).convert("RGB").save(f"{OUT}/{name}", optimize=True)

fav = {s: app_icon(s, fill=0.74, radius=0.22) for s in (16, 32, 48, 64)}
fav[32].save(f"{OUT}/favicon-32.png", optimize=True)
fav[64].save(f"{OUT}/favicon-64.png", optimize=True)
app_icon(256, fill=0.74, radius=0.22).save(f"{OUT}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# logo: transparência derivada do escuro (preto sobre branco → alpha = 255 - luminância)
logo = Image.open(SRC_LOGO).convert("L")
alpha = ImageChops.invert(logo).point(lambda v: 0 if v < 12 else min(255, int((v - 12) * 255 / 243)))
box = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
pad = 24
box = (max(0, box[0] - pad), max(0, box[1] - pad), min(logo.width, box[2] + pad), min(logo.height, box[3] + pad))
out = Image.new("RGBA", logo.size, (10, 10, 10, 0))
out.putalpha(alpha)
out = out.crop(box)
out.thumbnail((960, 960), Image.LANCZOS)
out.save(f"{OUT}/logo.png", optimize=True)
print("logo", out.size)

# ---- imagem de pré-visualização do link (WhatsApp, iMessage, Telegram…): 1200x630 ----
from PIL import ImageFont

OG_W, OG_H = 1200, 630
og = Image.new("RGB", (OG_W, OG_H), (242, 243, 245))
lg = Image.open(f"{OUT}/logo.png").convert("RGBA")
lw = 660
lg = lg.resize((lw, round(lg.height * lw / lg.width)), Image.LANCZOS)
tagline = "Seu controle financeiro, só seu."
try:
    font = ImageFont.truetype("/usr/share/fonts/opentype/inter/Inter-Medium.otf", 40)
except OSError:
    font = None
gap = 34
text_h = 0
if font:
    box = ImageDraw.Draw(og).textbbox((0, 0), tagline, font=font)
    text_h = box[3] - box[1]
block_h = lg.height + (gap + text_h if font else 0)
top = (OG_H - block_h) // 2
og.paste(lg, ((OG_W - lg.width) // 2, top), lg)
if font:
    d = ImageDraw.Draw(og)
    tw = d.textlength(tagline, font=font)
    d.text(((OG_W - tw) / 2, top + lg.height + gap - box[1]), tagline, font=font, fill=(104, 109, 118))
og.save(f"{OUT}/og-image.png", optimize=True)
print("og-image", og.size)
