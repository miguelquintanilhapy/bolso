"""Gera os ativos de marca em public/ a partir de faviconbolso.png, faviconbranco.png, logobolso.png e logo-branca-fundo-preto.png (na raiz).

  python3 scripts/make-brand.py

- ícone do app / iPhone / PWA: carteira preta sobre fundo branco (o iOS pinta fundo transparente de preto)
- favicon: mesma ideia, cantos arredondados, para ficar visível em abas claras e escuras
- logo: preta com fundo transparente e recortada (logo.png); versão branca para o tema escuro (logo-white.png)
- variantes escuras (ícone do iPhone, favicons e ícone monocromático do Android): carteira branca sobre fundo preto
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


# ---- logo branca (tema escuro): transparência derivada do claro (alpha = luminância) ----
src_w = Image.open("logo-branca-fundo-preto.png").convert("L")
alpha_w = src_w.point(lambda v: 0 if v < 12 else min(255, int((v - 12) * 255 / 243)))
box_w = alpha_w.point(lambda v: 255 if v > 40 else 0).getbbox()
box_w = (max(0, box_w[0] - pad), max(0, box_w[1] - pad), min(src_w.width, box_w[2] + pad), min(src_w.height, box_w[3] + pad))
out_w = Image.new("RGBA", src_w.size, (255, 255, 255, 0))
out_w.putalpha(alpha_w)
out_w = out_w.crop(box_w)
out_w.thumbnail((960, 960), Image.LANCZOS)
out_w.save(f"{OUT}/logo-white.png", optimize=True)
print("logo-white", out_w.size)

# ---- variantes escuras do ícone: carteira branca (faviconbranco.png) sobre preto ----
gw = Image.open("faviconbranco.png").convert("L")
aw = gw.point(lambda v: 0 if v < 12 else min(255, int((v - 12) * 255 / 243)))
white_glyph = Image.new("RGBA", gw.size, (255, 255, 255, 0))
white_glyph.putalpha(aw)
white_glyph = white_glyph.crop(aw.point(lambda v: 255 if v > 10 else 0).getbbox())


def dark_icon(size, fill=0.56, radius=0.0, bg=(0, 0, 0, 255)):
    canvas = Image.new("RGBA", (size, size), bg)
    scale = size * fill / max(white_glyph.size)
    g = white_glyph.resize((round(white_glyph.width * scale), round(white_glyph.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(g, ((size - g.width) // 2, (size - g.height) // 2))
    if radius:
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius), fill=255)
        canvas.putalpha(mask.resize((size, size), Image.LANCZOS))
    return canvas


dark_icon(180).convert("RGB").save(f"{OUT}/apple-touch-icon-dark.png", optimize=True)
dark_icon(32, fill=0.74, radius=0.22).save(f"{OUT}/favicon-dark-32.png", optimize=True)
dark_icon(64, fill=0.74, radius=0.22).save(f"{OUT}/favicon-dark-64.png", optimize=True)
dark_icon(256, fill=0.74, radius=0.22).save(f"{OUT}/favicon-dark.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# ícone monocromático (Android 13+ "ícones temáticos"): só a silhueta, o sistema pinta com a cor do tema
mono = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
ms = 512 * 0.56 / max(white_glyph.size)
mg = white_glyph.resize((round(white_glyph.width * ms), round(white_glyph.height * ms)), Image.LANCZOS)
mono.alpha_composite(mg, ((512 - mg.width) // 2, (512 - mg.height) // 2))
mono.save(f"{OUT}/icon-monochrome-512.png", optimize=True)
print("variantes escuras ok")
