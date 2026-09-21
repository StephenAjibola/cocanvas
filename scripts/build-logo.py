"""
Derive the transparent CoCanvas mark from the supplied badge artwork.

The source is a white swirl on a flat blue ground. Rather than run a generic
background remover, this keys on the measured ground colour and solves the
compositing equation for coverage:

    P = a*F + (1-a)*B   with F = white, B = the sampled ground
    a = (P - B) / (F - B)      taken on the channel with the widest F/B gap

Doing it this way means the output RGB is never sampled from the source at all —
every pixel is painted solid black or solid white and only ALPHA comes from the
artwork. Blue therefore cannot survive into the result, which is the fringing
this pass exists to avoid.

Re-run after replacing public/cocanvas-logo.png:  python scripts/build-logo.py
"""
from collections import Counter
from PIL import Image
import numpy as np

SRC = "public/cocanvas-logo.png"
PATCH = 24          # corner patch size used to sample the ground
PAD = 0.06          # breathing room around the ink, as a fraction of the square

src = Image.open(SRC).convert("RGB")
w, h = src.size
px = src.load()

# 1. Sample the ground from the artwork instead of hard-coding a hex: the modal
#    colour of the four corner patches, so one stray pixel cannot pick it.
counts = Counter()
for ox, oy in [(0, 0), (w - PATCH, 0), (0, h - PATCH), (w - PATCH, h - PATCH)]:
    for y in range(oy, oy + PATCH):
        for x in range(ox, ox + PATCH):
            counts[px[x, y]] += 1
bg = counts.most_common(1)[0][0]

# 2. Key on whichever channel separates ink from ground most: blue is useless here
#    (253 vs 255), red carries the whole signal.
ch = max(range(3), key=lambda i: abs(255 - bg[i]))
alpha = np.clip((np.asarray(src, np.float32)[:, :, ch] - bg[ch]) / (255.0 - bg[ch]), 0, 1)

# 3. The flat field is JPEG-noisy, so a strict equality key would leave ~10% of the
#    ground faintly opaque — a grey wash over the whole square. The floor is measured
#    from the corners (pure ground by definition) rather than guessed.
floor = float(np.concatenate([alpha[:PATCH, :PATCH].ravel(), alpha[:PATCH, -PATCH:].ravel(),
                              alpha[-PATCH:, :PATCH].ravel(), alpha[-PATCH:, -PATCH:].ravel()]).max()) * 1.5
alpha = np.clip((alpha - floor) / (1 - floor), 0, 1)

# 4. Trim to the ink and re-square it, so the mark fills its box at 16px instead of
#    inheriting the badge's generous margins.
ys, xs = np.nonzero(alpha > 0.5)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
side = int(max(x1 - x0, y1 - y0) * (1 + 2 * PAD))
mask = Image.new("L", (side, side), 0)
mask.paste(Image.fromarray((alpha[y0:y1, x0:x1] * 255).astype(np.uint8), "L"),
           ((side - (x1 - x0)) // 2, (side - (y1 - y0)) // 2))


def write(path, size, fill, ground=None):
    m = mask.resize((size, size), Image.LANCZOS)
    img = Image.new("RGBA", (size, size), fill + (0,))
    img.putalpha(m)
    if ground:  # flattened onto an opaque ground where transparency is not wanted
        img = Image.alpha_composite(Image.new("RGBA", (size, size), ground), img)
    img.save(path)
    print(f"  {path}  {size}px")


print(f"ground {bg}, key channel {'RGB'[ch]}, noise floor {floor:.3f}, ink {x1-x0}x{y1-y0}")
BLACK, WHITE = (0, 0, 0), (255, 255, 255)
for size in (36, 72, 108):          # sidebar / nav at 1x, 2x, 3x
    write(f"public/cocanvas-mark-black-{size}.png", size, BLACK)
    write(f"public/cocanvas-mark-white-{size}.png", size, WHITE)
write("src/app/icon.png", 32, BLACK)
# Real 16 and 32 bitmaps in one file — a browser asked for 16 gets a 16, not a
# downscaled 32.
Image.open("src/app/icon.png").save("src/app/favicon.ico", sizes=[(16, 16), (32, 32)])
print("  src/app/favicon.ico  16+32px")
# iOS composites a transparent home-screen icon onto black, which would swallow a
# black mark — so this one ships flattened on white.
write("src/app/apple-icon.png", 180, BLACK, ground=(255, 255, 255, 255))
