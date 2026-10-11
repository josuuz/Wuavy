"""
Builds the Pulse's 3D model (public/pulse.glb) from the approved art.

No hand modelling and no reinterpretation: the geometry comes from the same
traced silhouette the 2.5D Pulse uses (src/components/flow/pulse-poses.ts,
followed off Direction 6 — Pulse Pulse). The outline is rasterised, its
distance-to-the-edge field is measured, and that field becomes the thickness
of the body — the "inflation" a puffed sticker has. Seen from the front the
model's outline is therefore the approved silhouette, exactly; seen from the
side it is a real, rounded volume, thin at the tail and full at the head,
because the distance field says so.

The face is not geometry: like the renders, the eyes and mouth are marks on
the surface. They go into one texture, a strip with a column per expression
(and a blank column the back of the body uses), so a state change is a UV
shift, not another model.

Run: python scripts/pulse-model.py   (needs numpy and Pillow)
"""

from __future__ import annotations

import json
import math
import re
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
POSES_TS = ROOT / "src" / "components" / "flow" / "pulse-poses.ts"
OUT_GLB = ROOT / "public" / "pulse.glb"

# ── Shape ────────────────────────────────────────────────────────────────
RASTER_H = 512          # rows used to measure the distance field
SEAM = 15.0             # softens the seam where two of the body's balls meet
ROUND = 0.92            # how much of the balls' depth the body keeps
BACK = 0.86             # the back is a little flatter: it faces you, it is not a bead
GRID = 2.0              # path units between grid lines: the triangle size
SMOOTH = 8              # passes that settle any remaining seam out of the surface

# ── Texture ──────────────────────────────────────────────────────────────
CELL = 320              # pixels per column
CREAM = (246, 239, 230)
INK = (58, 40, 29)
# The strip's columns, in order. Pulse3D.tsx maps its states onto these.
ORDER = ["presenca", "acolhimento", "alegria", "foco", "tranquilidade", "surpresa"]


# ── The traced poses ─────────────────────────────────────────────────────
def read_poses() -> dict[str, dict]:
    src = POSES_TS.read_text(encoding="utf-8").replace("\r\n", "\n")
    block = re.compile(
        r"^  (\w+): \{\s*\n\s*w: ([\d.]+),\s*\n\s*body: \"([^\"]+)\",\s*\n\s*face: \[(.*?)\],\s*\n\s*\},",
        re.S | re.M,
    )
    poses = {}
    for name, w, body, faces in block.findall(src):
        poses[name] = {"w": float(w), "body": body, "face": re.findall(r"\"([^\"]+)\"", faces)}
    if not poses:
        raise SystemExit("no poses found in pulse-poses.ts")
    return poses


def flatten(path: str, per_curve: int = 10) -> list[tuple[float, float]]:
    """The traced paths are one move and a run of cubics; sample them to a polygon."""
    nums = re.compile(r"-?\d+(?:\.\d+)?")
    pts: list[tuple[float, float]] = []
    cur = (0.0, 0.0)
    for kind, args in re.findall(r"([MLCZz])([^MLCZz]*)", path):
        v = [float(n) for n in nums.findall(args)]
        if kind == "M":
            cur = (v[0], v[1])
            pts.append(cur)
        elif kind == "L":
            # The faces assembled here (see `surprise`) come back as polylines.
            for i in range(0, len(v), 2):
                cur = (v[i], v[i + 1])
                pts.append(cur)
        elif kind == "C":
            for i in range(0, len(v), 6):
                c1, c2, end = (v[i], v[i + 1]), (v[i + 2], v[i + 3]), (v[i + 4], v[i + 5])
                for s in range(1, per_curve + 1):
                    t = s / per_curve
                    u = 1 - t
                    x = u**3 * cur[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * end[0]
                    y = u**3 * cur[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * end[1]
                    pts.append((x, y))
                cur = end
    if len(pts) > 1 and math.dist(pts[0], pts[-1]) < 1e-6:
        pts.pop()
    return pts


# ── Distance to the outline, exactly (Felzenszwalb, separable) ───────────
def _dt1d(f: np.ndarray) -> np.ndarray:
    n = f.size
    d = np.full(n, np.inf)
    v: list[int] = []   # the parabolas that form the lower envelope
    z: list[float] = []  # where each one takes over
    for q in range(n):
        if not math.isfinite(f[q]):
            continue  # an unreachable point never wins, and inf − inf is not a number
        while v:
            k = v[-1]
            s = ((f[q] + q * q) - (f[k] + k * k)) / (2 * q - 2 * k)
            if s <= z[-1]:
                v.pop()
                z.pop()
            else:
                v.append(q)
                z.append(s)
                break
        else:
            v.append(q)
            z.append(-math.inf)
    if not v:
        return d
    j = 0
    for q in range(n):
        while j + 1 < len(v) and z[j + 1] < q:
            j += 1
        d[q] = (q - v[j]) ** 2 + f[v[j]]
    return d


def distance_inside(mask: np.ndarray) -> np.ndarray:
    """Distance from each inside pixel to the nearest pixel outside the shape."""
    # A frame of outside pixels: every row and column then has a finite start,
    # so the transform never has to subtract one infinity from another.
    mask = np.pad(mask, 2, constant_values=False)
    f = np.where(mask, np.inf, 0.0)
    for y in range(f.shape[0]):
        f[y] = _dt1d(f[y])
    for x in range(f.shape[1]):
        f[:, x] = _dt1d(f[:, x])
    return np.sqrt(f[2:-2, 2:-2])


def _soften(h: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Takes the seam out of the surface where two balls meet, nothing more."""
    peak = max(h.max(), 1e-6)
    soft = Image.fromarray((h / peak * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(SEAM))
    out = np.asarray(soft, dtype=np.float64) / 255.0 * peak
    out[~mask] = 0.0
    return np.minimum(out, h * 1.06)


def field(poly: list[tuple[float, float]], w: float):
    """
    The body as the balls the outline can hold.

    Every point inside the outline has a largest circle that fits around it;
    give each of those circles a ball of the same radius and take their union,
    and the result is a solid whose waistline is exactly the traced outline
    and whose surface is round in every direction. That is what makes it a
    sculpture rather than a sticker pressed flat: the dome is as deep as it is
    wide, the neck narrows into the tail the way a limb does, and the sides
    and the back carry real volume instead of a mirrored ramp.

    Taking the union is the same minimum-over-parabolas the distance transform
    already does, with the radius squared as the cost: the half-thickness is
    sqrt(max over q of (r(q)² − |p − q|²)).
    """
    scale = RASTER_H / 100.0
    width = int(math.ceil(w * scale)) + 2
    img = Image.new("L", (width, RASTER_H + 2), 0)
    ImageDraw.Draw(img).polygon([(x * scale + 1, y * scale + 1) for x, y in poly], fill=255)
    mask = np.asarray(img) > 127

    radius = distance_inside(mask)
    f = np.where(mask, -(radius**2), np.inf)
    for y in range(f.shape[0]):
        f[y] = _dt1d(f[y])
    for x in range(f.shape[1]):
        f[:, x] = _dt1d(f[:, x])
    half = np.sqrt(np.maximum(0.0, -f))
    half[~mask] = 0.0
    return _soften(half, mask), scale


def sample(fieldmap: np.ndarray, scale: float, x: float, y: float, outside: float = 0.0) -> float:
    """Bilinear read of the field at a point in path coordinates."""
    px, py = x * scale + 1, y * scale + 1
    x0, y0 = int(px), int(py)
    h, w = fieldmap.shape
    if x0 < 0 or y0 < 0 or x0 >= w - 1 or y0 >= h - 1:
        return outside
    fx, fy = px - x0, py - y0
    a = fieldmap[y0, x0] * (1 - fx) + fieldmap[y0, x0 + 1] * fx
    b = fieldmap[y0 + 1, x0] * (1 - fx) + fieldmap[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


# ── The surface ─────────────────────────────────────────────────────────
def build_mesh(pose: dict):
    """
    A grid over the body, cut to the outline, inflated, and mirrored.

    The grid (rather than a fan of rays from a centre) is what keeps the
    triangles even: a fan has to stretch across the notch between the dome
    and the tail, and those slivers read as a crease. Each square is split
    into four triangles around its middle, and each triangle is clipped
    against the signed outline — on a triangle the cut is unambiguous, so
    the boundary lands on the traced outline with no special cases.
    """
    poly = flatten(pose["body"])
    fieldmap, scale = field(poly, pose["w"])

    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    midx, midy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    spanx, spany = max(xs) - min(xs), max(ys) - min(ys)

    # Signed: positive inside the outline, negative outside, zero on it.
    img = Image.new("L", (fieldmap.shape[1], fieldmap.shape[0]), 0)
    ImageDraw.Draw(img).polygon([(x * scale + 1, y * scale + 1) for x, y in poly], fill=255)
    mask = np.asarray(img) > 127
    signed = distance_inside(mask) - distance_inside(~mask)

    def phi(x: float, y: float) -> float:
        # Beyond the measured field there is only background, never body.
        return sample(signed, scale, x, y, outside=-1e9)

    def height(x: float, y: float) -> float:
        # Straight off the balls: half their depth at this point, in model units.
        return sample(fieldmap, scale, x, y) / scale / 100.0 * ROUND

    def nearest_on_outline(x: float, y: float) -> tuple[float, float]:
        """The closest point of the traced outline: where a rim vertex belongs."""
        best, bx, by = math.inf, x, y
        for k in range(len(poly)):
            ax, ay = poly[k]
            cx2, cy2 = poly[(k + 1) % len(poly)]
            ex, ey = cx2 - ax, cy2 - ay
            span = ex * ex + ey * ey
            u = 0.0 if span == 0 else max(0.0, min(1.0, ((x - ax) * ex + (y - ay) * ey) / span))
            px, py = ax + ex * u, ay + ey * u
            d = (px - x) ** 2 + (py - y) ** 2
            if d < best:
                best, bx, by = d, px, py
        return bx, by

    pos: list[tuple[float, float, float]] = []
    uv: list[tuple[float, float]] = []
    front_of: dict[tuple, int] = {}
    back_of: dict[tuple, int] = {}
    on_rim: set[int] = set()

    paths: list[tuple[float, float, bool, bool]] = []  # x, y, front, on the rim

    def vertex(key: tuple, x: float, y: float, front: bool, rim: bool = False) -> int:
        """
        One vertex per point per side; a point on the outline is shared.

        Whether a point is on the outline is decided by where it came from —
        a cut between an inside and an outside corner — not by measuring its
        height: the field is sampled, so a measured height lands a hair above
        zero and the two sides would be left a hair apart, opening a hairline
        crack all along the silhouette.
        """
        h = 0.0 if rim else height(x, y)
        table = front_of if front or rim else back_of
        if key in table:
            return table[key]
        if rim:
            # The field's zero level is a pixel or two off the curve it was
            # measured from, and that shows as a ripple along the silhouette.
            # Rim points are put back on the traced outline itself.
            x, y = nearest_on_outline(x, y)
        pos.append(((x - midx) / 100.0, (midy - y) / 100.0, h if front else -h * BACK))
        uv.append(((x - min(xs)) / spanx, (y - min(ys)) / spany) if front or rim else (-1.0, -1.0))
        paths.append((x, y, front, rim))
        i = len(pos) - 1
        table[key] = i
        if rim:
            back_of[key] = i
            on_rim.add(i)
        return i

    step = GRID
    nx = int(math.ceil(spanx / step)) + 2
    ny = int(math.ceil(spany / step)) + 2
    ox, oy = min(xs) - step / 2, min(ys) - step / 2
    gx = lambda i: ox + i * step  # noqa: E731
    gy = lambda j: oy + j * step  # noqa: E731

    tris: list[int] = []
    sides: list[bool] = []

    def clip(corners: list[tuple[tuple, float, float, float]], front: bool) -> None:
        """The part of one triangle that lies inside the outline."""
        ring: list[int] = []
        for k in range(3):
            key_a, ax, ay, pa = corners[k]
            key_b, bx, by, pb = corners[(k + 1) % 3]
            if pa >= 0:
                ring.append(vertex(key_a, ax, ay, front))
            if (pa >= 0) != (pb >= 0):
                u = pa / (pa - pb)
                cut = tuple(sorted([key_a, key_b]))
                ring.append(vertex(("cut", cut), ax + (bx - ax) * u, ay + (by - ay) * u, front, rim=True))
        for k in range(1, len(ring) - 1):
            a, b, c = ring[0], ring[k], ring[k + 1]
            if a != b and b != c and a != c:
                tris.extend([a, b, c] if front else [a, c, b])
                sides.append(front)

    for j in range(ny):
        for i in range(nx):
            x0, y0, x1, y1 = gx(i), gy(j), gx(i + 1), gy(j + 1)
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            corner = [
                (("g", i, j), x0, y0, phi(x0, y0)),
                (("g", i + 1, j), x1, y0, phi(x1, y0)),
                (("g", i + 1, j + 1), x1, y1, phi(x1, y1)),
                (("g", i, j + 1), x0, y1, phi(x0, y1)),
            ]
            if max(c[3] for c in corner) < 0:
                continue
            mid = (("m", i, j), mx, my, phi(mx, my))
            for k in range(4):
                for front in (True, False):
                    clip([corner[k], corner[(k + 1) % 4], mid], front)

    P = np.array(pos, dtype=np.float64)
    UV = np.array(uv, dtype=np.float32)
    T = np.array(tris, dtype=np.uint32).reshape(-1, 3)

    # Normals read off the field itself, not off the triangles. The surface
    # turns fastest near the rim, where a grid has fewest rows, and averaging
    # face normals there leaves the body ribbed when it is seen from the side.
    # The slope of the ball field is known at any point, so the shading can be
    # exact however coarse the mesh is.
    step = 0.45

    def normal_at(x: float, y: float, front: bool, rim: bool) -> tuple[float, float, float]:
        if rim:
            # On the outline the surface stands up: it looks straight outwards.
            gx_ = sample(signed, scale, x + step, y, -1e9) - sample(signed, scale, x - step, y, -1e9)
            gy_ = sample(signed, scale, x, y + step, -1e9) - sample(signed, scale, x, y - step, -1e9)
            n = np.array([-gx_, gy_, 0.0])
        else:
            # The back is the same slope mirrored, so its normal is the front's
            # turned around — both components, not only the one along the view.
            depth = 1.0 if front else -BACK
            dzdx = (height(x + step, y) - height(x - step, y)) / (2 * step / 100.0) * depth
            dzdy = (height(x, y + step) - height(x, y - step)) / (-2 * step / 100.0) * depth
            n = np.array([-dzdx, -dzdy, 1.0]) * (1.0 if front else -1.0)
        length = float(np.linalg.norm(n))
        return tuple(n / length) if length else (0.0, 0.0, 1.0 if front else -1.0)

    N = np.array([normal_at(*p) for p in paths], dtype=np.float64)

    # The fullest point of the front must look towards the camera.
    if float(np.cross(P[T[0, 1]] - P[T[0, 0]], P[T[0, 2]] - P[T[0, 0]]) @ N[T[0, 0]]) < 0:
        T = T[:, ::-1].copy()

    # The rim is one ring of points, welded so the two sides share a normal
    # and the surface turns smoothly through it. For the texture, though, the
    # two sides want different places on the strip: the front its expression,
    # the back the blank column. So each rim point gets a twin that sits in
    # the same spot with the same normal, and the back triangles use it —
    # otherwise the back would smear the whole strip along the silhouette.
    twin: dict[int, int] = {}
    extra_pos, extra_nor, extra_uv = [], [], []
    for r in sorted(on_rim):
        twin[r] = len(P) + len(extra_pos)
        extra_pos.append(P[r])
        extra_nor.append(N[r])
        extra_uv.append((-1.0, -1.0))
    if twin:
        P = np.vstack([P, np.array(extra_pos)])
        N = np.vstack([N, np.array(extra_nor)])
        UV = np.vstack([UV, np.array(extra_uv, dtype=np.float32)])
        back_rows = ~np.array(sides, dtype=bool)
        swap = np.vectorize(lambda v: twin.get(int(v), int(v)))
        T[back_rows] = swap(T[back_rows])

    box = {"minx": min(xs), "maxx": max(xs), "miny": min(ys), "maxy": max(ys)}
    return P.astype(np.float32), N.astype(np.float32), UV, T.reshape(-1).tolist(), box


def _bbox(path: str):
    pts = flatten(path, 6)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _move_scale(path: str, cx: float, cy: float, k: float) -> str:
    """Re-draw one traced path centred on a point, at a given size."""
    x0, y0, x1, y1 = _bbox(path)
    ox, oy = (x0 + x1) / 2, (y0 + y1) / 2
    pts = [(cx + (x - ox) * k, cy + (y - oy) * k) for x, y in flatten(path, 6)]
    return "M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + "Z"


def surprise(poses: dict) -> dict:
    """
    A sixth face, for the small start of surprise, assembled from the
    approved ones — nothing is drawn by hand here.

    The boards have no surprised Pulse, but they do have an open eye: the one
    it looks out of while it winks, in `foco`. That eye is put in both of the
    neutral face's eye places, at the size an open eye has there, and the
    neutral smile is kept, a little smaller. The result is the approved
    character paying sudden attention, not a new character.
    """
    neutral = poses["presenca"]["face"]
    boxes = [_bbox(p) for p in neutral]
    # The smile is much the smallest of the three marks; the other two are the
    # eyes. Height does not separate them: the head is tilted, so one eye sits
    # as low as the mouth does.
    area = lambda b: (b[2] - b[0]) * (b[3] - b[1])  # noqa: E731
    mouth = min(range(len(neutral)), key=lambda i: area(boxes[i]))
    eyes = [i for i in range(len(neutral)) if i != mouth]

    def fill_ratio(path: str) -> float:
        x0, y0, x1, y1 = _bbox(path)
        area = abs(x1 - x0) * abs(y1 - y0)
        pts = flatten(path, 6)
        hull = abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2
        return hull / area if area else 0.0

    # The open eye is the solid one: a filled shape covers far more of its box
    # than a drawn stroke does.
    open_eye = max(poses["foco"]["face"], key=fill_ratio)

    face = []
    for i in eyes:
        x0, y0, x1, y1 = boxes[i]
        width = x1 - x0
        face.append(_move_scale(open_eye, (x0 + x1) / 2, (y0 + y1) / 2 + width * 0.12, width * 0.62 / max(_bbox(open_eye)[2] - _bbox(open_eye)[0], 1e-6)))
    mx0, my0, mx1, my1 = boxes[mouth]
    face.append(_move_scale(neutral[mouth], (mx0 + mx1) / 2, (my0 + my1) / 2, 0.78))
    return {"w": poses["presenca"]["w"], "body": poses["presenca"]["body"], "face": face}


# ── The face strip ───────────────────────────────────────────────────────
def face_atlas(poses: dict, box: dict) -> Image.Image:
    """One column per expression plus a blank one; the back of the body uses the blank."""
    cols = len(ORDER) + 1
    bw = box["maxx"] - box["minx"]
    bh = box["maxy"] - box["miny"]
    cell_w = int(round(CELL * bw / bh))
    img = Image.new("RGB", (cell_w * cols, CELL), CREAM)

    def centre(pose: dict) -> tuple[float, float]:
        pts = [p for path in pose["face"] for p in flatten(path, 6)]
        return (
            (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2,
            (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2,
        )

    base_cx, base_cy = centre(poses["presenca"])
    poses = {**poses, "surpresa": surprise(poses)}

    for col, name in enumerate(ORDER):
        pose = poses[name]
        cx, cy = centre(pose)
        # Each expression's face sits where the main pose's face sits, so the
        # eyes never wander across the body when the state changes.
        dx, dy = base_cx - cx, base_cy - cy
        layer = Image.new("RGB", (cell_w * 3, CELL * 3), CREAM)
        draw = ImageDraw.Draw(layer)
        for path in pose["face"]:
            draw.polygon(
                [
                    ((x + dx - box["minx"]) / bw * cell_w + cell_w, (y + dy - box["miny"]) / bh * CELL + CELL)
                    for x, y in flatten(path, 6)
                ],
                fill=INK,
            )
        img.paste(layer.crop((cell_w, CELL, cell_w * 2, CELL * 2)), (col * cell_w, 0))
    return img


# ── GLB ──────────────────────────────────────────────────────────────────
def write_glb(P, N, UV, idx, png: bytes, cols: int) -> bytes:
    bin_data = bytearray()
    views: list[dict] = []
    accessors: list[dict] = []

    def pad(buf: bytearray, filler: int = 0) -> None:
        while len(buf) % 4:
            buf.append(filler)

    def view(data: bytes, target: int | None) -> int:
        pad(bin_data)
        v = {"buffer": 0, "byteOffset": len(bin_data), "byteLength": len(data)}
        bin_data.extend(data)
        if target:
            v["target"] = target
        views.append(v)
        return len(views) - 1

    def accessor(data: np.ndarray, kind: str) -> int:
        a = {
            "bufferView": view(data.tobytes(), 34962),
            "componentType": 5126,
            "count": int(data.shape[0]),
            "type": kind,
        }
        if kind == "VEC3":
            a["min"] = [float(x) for x in data.min(axis=0)]
            a["max"] = [float(x) for x in data.max(axis=0)]
        accessors.append(a)
        return len(accessors) - 1

    a_pos, a_nor, a_uv = accessor(P, "VEC3"), accessor(N, "VEC3"), accessor(UV, "VEC2")
    # Two bytes an index while the mesh is small enough, which halves the file.
    small = max(idx) < 65536
    ind = np.array(idx, dtype=np.uint16 if small else np.uint32)
    accessors.append(
        {
            "bufferView": view(ind.tobytes(), 34963),
            "componentType": 5123 if small else 5125,
            "count": int(ind.size),
            "type": "SCALAR",
        }
    )
    a_ind = len(accessors) - 1
    v_png = view(png, None)

    gltf = {
        "asset": {"version": "2.0", "generator": "wuavy-pulse pulse-model.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Pulse"}],
        "meshes": [
            {
                "name": "Pulse",
                "primitives": [
                    {
                        "attributes": {"POSITION": a_pos, "NORMAL": a_nor, "TEXCOORD_0": a_uv},
                        "indices": a_ind,
                        "material": 0,
                    }
                ],
            }
        ],
        "materials": [
            {
                "name": "pulse",
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0},
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.78,
                },
            }
        ],
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": v_png, "mimeType": "image/png"}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(bin_data)}],
        "extras": {"faceColumns": cols},
    }

    js = bytearray(json.dumps(gltf, separators=(",", ":")).encode("utf-8"))
    pad(js, 0x20)
    pad(bin_data)
    out = bytearray()
    out += struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_data))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(bin_data), 0x004E4942) + bin_data
    return bytes(out)


def publish_surprise(pose: dict) -> None:
    """
    Put the assembled face into pulse-poses.ts as well, so the drawn Pulse —
    the one small marks use, and the one that stands in where the model
    cannot run — has the same six expressions the model has.
    """
    src = POSES_TS.read_text(encoding="utf-8")
    nl = "\r\n" if "\r\n" in src else "\n"
    if '"surpresa"' not in src:
        src = src.replace(
            '| "tranquilidade";',
            '| "tranquilidade" | "surpresa";',
        )
    block = (
        f'  surpresa: {{{nl}    w: {pose["w"]},{nl}    body: "{pose["body"]}",{nl}    face: [{nl}'
        + "".join(f'      "{d}",{nl}' for d in pose["face"])
        + f"    ],{nl}  }},{nl}"
    )
    start = src.find("  surpresa: {")
    if start >= 0:
        end = src.find("  },", start) + len(f"  }},{nl}")
        src = src[:start] + block + src[end:]
    else:
        src = src.replace(f"}};{nl}", block + f"}};{nl}", 1) if f"}};{nl}" in src else src
    POSES_TS.write_text(src, encoding="utf-8")


def main() -> None:
    poses = read_poses()
    P, N, UV, idx, box = build_mesh(poses["presenca"])
    atlas = face_atlas(poses, box)
    publish_surprise(surprise(poses))
    cols = len(ORDER) + 1

    # Front vertices take their expression's column; the back takes the blank one.
    u, v = UV[:, 0].copy(), UV[:, 1].copy()
    blank = u < 0
    UV = np.stack(
        [np.where(blank, (cols - 0.5) / cols, u / cols), np.where(blank, 0.5, v)], axis=1
    ).astype(np.float32)

    tmp = ROOT / "public" / "pulse-face.tmp.png"
    atlas.save(tmp, optimize=True)
    png = tmp.read_bytes()
    tmp.unlink()

    OUT_GLB.write_bytes(write_glb(P, N, UV, idx, png, cols))
    print(
        f"vertices {len(P)}  triangles {len(idx) // 3}  "
        f"texture {atlas.size[0]}x{atlas.size[1]}  glb {OUT_GLB.stat().st_size / 1024:.0f} KB"
    )


if __name__ == "__main__":
    main()
