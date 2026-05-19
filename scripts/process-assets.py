"""
Happy Faces LA — asset processing script.
Resizes and converts selected images to optimized WebP.
Run from project root: python scripts/process-assets.py
"""
import os
from PIL import Image, ImageOps

SRC = r'C:\Users\shawn\OneDrive\Shawn\Happy Faces LA'
DST = r'C:\HappyFaceLA\public\images'


def process(src_path, dst_path, max_w, quality=85):
    print(f'  Processing {os.path.basename(src_path)} ...', end=' ', flush=True)
    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        w, h = img.size
        ratio = max_w / w
        if ratio < 1.0:
            nw = int(w * ratio)
            nh = int(h * ratio)
            img = img.resize((nw, nh), Image.LANCZOS)
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        img.save(dst_path, 'WEBP', quality=quality, method=6)
        sz = os.path.getsize(dst_path)
        print(f'-> {img.size[0]}x{img.size[1]} {sz // 1024}KB  {os.path.basename(dst_path)}')


# ── FACE PAINTING ─────────────────────────────────────────────────────────────
fp_src = os.path.join(SRC, '02_Face_Painting')
fp_dst = os.path.join(DST, 'gallery', 'face-painting')
fp_map = [
    ('IMG_4449.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-01.webp'),
    ('IMG_4447.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-02.webp'),
    ('IMG_4730.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-03.webp'),
    ('IMG_4734.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-04.webp'),
    ('IMG_4712.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-05.webp'),
    ('IMG_4455.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-06.webp'),
    ('IMG_4451.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-07.webp'),
    ('IMG_4452.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-08.webp'),
    ('IMG_4257.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-09.webp'),
    ('IMG_3424.jpg',  'happy-faces-la-face-painting-birthday-party-los-angeles-10.webp'),
    ('IMG_2180.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-11.webp'),
    ('IMG_2212.jpeg', 'happy-faces-la-face-painting-birthday-party-los-angeles-12.webp'),
]
print('Face Painting:')
for src_f, dst_f in fp_map:
    process(os.path.join(fp_src, src_f), os.path.join(fp_dst, dst_f), max_w=1400)

# ── BALLOON TWISTING ──────────────────────────────────────────────────────────
bt_src = os.path.join(SRC, '03_Balloon_Twisting')
bt_dst = os.path.join(DST, 'gallery', 'balloon-twisting')
bt_map = [
    ('IMG_4138.jpeg', 'happy-faces-la-balloon-twisting-kids-party-los-angeles-01.webp'),
    ('IMG_1312.jpeg', 'happy-faces-la-balloon-twisting-kids-party-los-angeles-02.webp'),
    ('IMG_4756.jpg',  'happy-faces-la-balloon-twisting-kids-party-los-angeles-03.webp'),
    ('IMG_4761.jpg',  'happy-faces-la-balloon-twisting-kids-party-los-angeles-04.webp'),
]
print('Balloon Twisting:')
for src_f, dst_f in bt_map:
    process(os.path.join(bt_src, src_f), os.path.join(bt_dst, dst_f), max_w=1400)

# ── FACE GEMS ─────────────────────────────────────────────────────────────────
fg_src = os.path.join(SRC, '05_Face_Gems')
fg_dst = os.path.join(DST, 'gallery', 'face-gems')
fg_map = [
    ('IMG_4566.jpeg', 'happy-faces-la-face-gems-birthday-party-los-angeles-01.webp'),
    ('IMG_4565.jpeg', 'happy-faces-la-face-gems-birthday-party-los-angeles-02.webp'),
    ('IMG_4560.jpeg', 'happy-faces-la-face-gems-birthday-party-los-angeles-03.webp'),
    ('IMG_4561.jpeg', 'happy-faces-la-face-gems-birthday-party-los-angeles-04.webp'),
]
print('Face Gems:')
for src_f, dst_f in fg_map:
    process(os.path.join(fg_src, src_f), os.path.join(fg_dst, dst_f), max_w=1400)

# ── HERO ──────────────────────────────────────────────────────────────────────
hero_dst = os.path.join(DST, 'hero')
print('Hero:')
process(
    os.path.join(fp_src, 'IMG_4449.jpeg'),
    os.path.join(hero_dst, 'happy-faces-la-hero-face-painting-butterfly-01.webp'),
    max_w=1800, quality=88
)
process(
    os.path.join(SRC, '03_Balloon_Twisting', 'IMG_4138.jpeg'),
    os.path.join(hero_dst, 'happy-faces-la-hero-balloon-twisting-event-02.webp'),
    max_w=1800, quality=88
)
process(
    os.path.join(fp_src, 'IMG_4730.jpeg'),
    os.path.join(hero_dst, 'happy-faces-la-hero-face-painting-galaxy-03.webp'),
    max_w=1800, quality=88
)

# ── SERVICE CARD IMAGES ───────────────────────────────────────────────────────
svc_dst = os.path.join(DST, 'services')
print('Service Cards:')
process(
    os.path.join(fp_src, 'IMG_4449.jpeg'),
    os.path.join(svc_dst, 'happy-faces-la-face-painting-service.webp'),
    max_w=900, quality=85
)
process(
    os.path.join(SRC, '03_Balloon_Twisting', 'IMG_4138.jpeg'),
    os.path.join(svc_dst, 'happy-faces-la-balloon-twisting-service.webp'),
    max_w=900, quality=85
)
process(
    os.path.join(fg_src, 'IMG_4565.jpeg'),
    os.path.join(svc_dst, 'happy-faces-la-face-gems-service.webp'),
    max_w=900, quality=85
)

print('\nAll done.')
