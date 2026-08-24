# -*- coding: utf-8 -*-
"""
凛穏ロゴ（白背景のPNG）から、アプリとLPで使う画像を書き出す。

    python make_assets.py

入力
    assets/logo_src.png     とーるさんからいただいた原本（913x922・白背景・さわらない）

出力（assets/）
    logo.png                全体・背景ぬき
    logo-mark.png           「RION」を落とした円章だけ・背景ぬき
    logo-mark-160.png       小さく使うときの実寸（濃い色。明るい背景に置く）
    logo-mark-light-160.png 同じ大きさの淡い色（濃紺の背景に置く）
    logo-light-320.png      全体の淡い色（濃紺の背景に置く）
    _preview.png            確認用（白地と紺地に並べたもの）

出力（リポジトリ直下）
    favicon.ico             16〜256pxを1つにまとめたもの
    favicon-32.png
    apple-touch-icon.png    ホーム画面に追加したとき（iOSは透過を黒く塗るので不透明）
    icon-192.png / icon-512.png

★背景ぬきの考え方
    白を一律に透明化すると、太極図の白い勾玉と蓮の花びらの白まで抜けてしまう。
    そこで「画像の縁からつながっている白」だけを塗りつぶしで探して抜き、
    内側の白は残す。境目の2pxは、白との混ざり具合からアルファを作り直して白フチを防ぐ。
"""

import os
from collections import deque

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.path.join(HERE, 'logo_src.png')

HARD = 238           # これ以上明るければ「外の白」
SOFT = 150           # 境目のアンチエイリアスとして拾う下限
PAPER = (253, 252, 250, 255)     # アイコンの下地（ほんのり暖かい白）
LIGHT_INK = (233, 244, 251)      # 淡色版の色（青みのある白）
NAVY = (7, 23, 44, 255)          # 確認用の紺


def cut_background(im):
    """縁からつながっている白だけを透明にする（内側の白は残す）"""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    outside = bytearray(w * h)
    q = deque()

    def minch(p):
        return min(p[0], p[1], p[2])

    def push(x, y):
        i = y * w + x
        if outside[i]:
            return
        if minch(px[x, y]) >= HARD:
            outside[i] = 1
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    while q:
        x, y = q.popleft()
        if x > 0:
            push(x - 1, y)
        if x < w - 1:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y < h - 1:
            push(x, y + 1)

    for y in range(h):
        base = y * w
        for x in range(w):
            if outside[base + x]:
                px[x, y] = (255, 255, 255, 0)

    # 境目を作り直す（白フチ防止）。2px ぶん内側へ進む
    for _ in range(2):
        ring = []
        for y in range(h):
            base = y * w
            for x in range(w):
                if outside[base + x]:
                    continue
                p = px[x, y]
                m = minch(p)
                if m < SOFT:
                    continue
                if ((x > 0 and outside[base + x - 1]) or
                        (x < w - 1 and outside[base + x + 1]) or
                        (y > 0 and outside[base - w + x]) or
                        (y < h - 1 and outside[base + w + x])):
                    ring.append((x, y, p, m))
        if not ring:
            break
        for x, y, p, m in ring:
            a = 255 - m
            outside[y * w + x] = 1
            if a <= 2:
                px[x, y] = (255, 255, 255, 0)
                continue
            k = 255.0 / a
            px[x, y] = (
                max(0, min(255, int(round((p[0] - (255 - a)) * k)))),
                max(0, min(255, int(round((p[1] - (255 - a)) * k)))),
                max(0, min(255, int(round((p[2] - (255 - a)) * k)))),
                a,
            )
    return im


def trim(im):
    return im.crop(im.split()[3].point(lambda a: 255 if a > 8 else 0).getbbox())


def drop_wordmark(im):
    """下に離れて置かれた「RION」を切り落として、円章だけにする"""
    a = im.split()[3]
    w, h = im.size
    px = a.load()
    ink = []
    for y in range(h):
        n = 0
        for x in range(w):
            if px[x, y] > 24:
                n += 1
        ink.append(n)

    best = 0
    cut = None
    y = int(h * 0.65)
    while y < h:
        if ink[y] == 0:
            s = y
            while y < h and ink[y] == 0:
                y += 1
            if y - s > best:
                best, cut = y - s, s
        y += 1
    if cut is None or best < h * 0.01:
        return im
    return trim(im.crop((0, 0, w, cut)))


def to_light(im):
    """明るさをアルファに写しかえた一色版。濃紺の上でも線が読める"""
    out = im.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (r * 299 + g * 587 + b * 114) // 1000
            px[x, y] = (LIGHT_INK[0], LIGHT_INK[1], LIGHT_INK[2], a * (255 - lum) // 255)
    return out


def wide(im, w):
    s = im.copy()
    s.thumbnail((w, w * 4), Image.LANCZOS)
    return s


def square(im, box, ratio):
    """box×box の中央に、box の ratio ぶんの大きさで置く"""
    s = im.copy()
    s.thumbnail((int(round(box * ratio)),) * 2, Image.LANCZOS)
    canvas = Image.new('RGBA', (box, box), (0, 0, 0, 0))
    canvas.paste(s, ((box - s.width) // 2, (box - s.height) // 2), s)
    return canvas


def opaque(im, ground=PAPER):
    bg = Image.new('RGBA', im.size, ground)
    bg.alpha_composite(im)
    return bg.convert('RGB')


def main():
    full = trim(cut_background(Image.open(SRC)))
    mark = drop_wordmark(full)
    print(u'  全体 %dx%d ／ 円章 %dx%d' % (full.width, full.height, mark.width, mark.height))

    full.save(os.path.join(HERE, 'logo.png'))
    mark.save(os.path.join(HERE, 'logo-mark.png'))
    wide(mark, 160).save(os.path.join(HERE, 'logo-mark-160.png'))
    wide(to_light(mark), 160).save(os.path.join(HERE, 'logo-mark-light-160.png'))
    wide(to_light(full), 320).save(os.path.join(HERE, 'logo-light-320.png'))

    # ファビコン。小さいほど余白を詰める
    square(mark, 256, 0.98).save(
        os.path.join(ROOT, 'favicon.ico'),
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    square(mark, 32, 0.98).save(os.path.join(ROOT, 'favicon-32.png'))
    opaque(square(mark, 180, 0.80)).save(os.path.join(ROOT, 'apple-touch-icon.png'))
    opaque(square(mark, 192, 0.80)).save(os.path.join(ROOT, 'icon-192.png'))
    opaque(square(mark, 512, 0.80)).save(os.path.join(ROOT, 'icon-512.png'))

    # 確認用シート
    sheet = Image.new('RGBA', (920, 300), (255, 255, 255, 255))
    ImageDraw.Draw(sheet).rectangle([460, 0, 919, 299], fill=NAVY)
    for x0, art in ((0, full), (460, to_light(full))):
        sheet.alpha_composite(square(art, 150, 0.95), (x0 + 18, 20))
        m = mark if x0 == 0 else to_light(mark)
        for i, s in enumerate((104, 72, 48, 32)):
            sheet.alpha_composite(square(m, s, 0.98), (x0 + 190 + i * 62, 44))
        sheet.alpha_composite(square(m, 58, 0.98), (x0 + 190, 190))
    sheet.alpha_composite(
        Image.open(os.path.join(ROOT, 'icon-192.png')).convert('RGBA')
        .resize((90, 90), Image.LANCZOS), (18, 190))
    sheet.convert('RGB').save(os.path.join(HERE, '_preview.png'))
    print(u'  書き出しました')


if __name__ == '__main__':
    main()
