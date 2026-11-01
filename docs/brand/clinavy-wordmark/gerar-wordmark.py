# CLINAVY wordmark generator: every diagonal comes from the Wuavy V at 20.81 degrees (dx = 0.38 dy).
import math, re, json, sys
K = 0.38            # tan(20.81 deg)
S = 226.0           # vertical stem (the official Y stem)
DW = 243.9          # horizontal width of a diagonal stroke (official V arm)
H = 190.0           # horizontal strokes are a little lighter than the stems

def f(n): return ("%.1f" % n).rstrip("0").rstrip(".") if abs(n-round(n))>1e-9 else "%d" % round(n)
def poly(pts): return "M" + " L".join("%s %s" % (f(x), f(y)) for x, y in pts) + " Z"
def move(pts, dx): return [(x+dx, y) for x, y in pts]

# ---- official A, V, Y (standard master), verbatim, rebased so A starts at x=0
OFF = 2011.3
def parse(d): return [[(float(a)-OFF, float(b)) for a, b in re.findall(r'([-\d.]+)\s+([-\d.]+)', sub)] for sub in d.split("Z") if sub.strip()]
A_OFF = parse("M2823.7 822.0 L2891.3 1000.0 L2647.4 1000.0 L2579.8 822.0 L2322.9 822.0 L2255.3 1000.0 L2011.3 1000.0 L2092.1 787.5 L2131.4 684.0 L2391.3 0.0 L2511.3 0.0 L2810.6 787.5 Z M2527.4 684.0 L2451.3 484.0 L2375.3 684.0 Z")
V_OFF = [(2596.9,0),(2840.8,0),(3036.9,516.0),(3233.0,0),(3476.9,0),(3096.9,1000),(2976.9,1000)]
Y_OFF = parse("M3506.9 0.0 L3750.8 0.0 L3836.5 225.5 L3922.2 0.0 L4166.1 0.0 L3949.5 570.0 L3949.5 1000.0 L3723.5 1000.0 L3723.5 570.0 Z")[0]
V0 = [(x-OFF, y) for x, y in V_OFF]            # V rebased: starts at 585.6
VX = V0[0][0]

def v_variant(kind):
    x0 = VX
    P = [(x-x0, y) for x, y in V0]            # V local, starts at 0
    if kind == "plain": return P
    if kind == "slit-left":                    # a channel through the left arm, parallel to the A|V channel
        ws = 64/math.cos(math.radians(20.81)); a = (DW-ws)/2; ye = 640
        s0 = (a, 0); s1 = (a, 0)
        out = [(0,0),(a,0),(a+K*ye,ye),(a+ws+K*ye,ye),(a+ws,0),(DW,0),(P[2][0],P[2][1]),P[3],P[4],P[5],P[6]]
        return out
    if kind == "slit-right":                   # the same channel, through the right arm (mirrored)
        ws = 64/math.cos(math.radians(20.81)); a = (DW-ws)/2; ye = 640
        W = 880.0
        out = [(0,0),(DW,0),P[2],(W-DW,0),(W-a-ws,0),(W-a-ws-K*ye*0-(-K*ye)*0,0)]
        # mirror of slit-left
        L = v_variant("slit-left")
        return [(W-x, y) for x, y in L][::-1]
    if kind == "step":                          # the vertex is cut on the brand diagonal: a lifted right foot
        # right arm ends higher: bottom of the right arm cut along a 20.81deg line, left foot stays on the baseline
        return [(0,0),(DW,0),P[2],(636.1,0),(880,0),(500+K*0,1000),(380,1000)]
    raise SystemExit(kind)

def C_path(a=395.0, b=512.0, ai=169.0, bi=312.0, phi=34.0, n=48):
    cx, cy = a, 500.0
    def r(aa, bb, ang): return 1/math.sqrt((math.cos(ang)/aa)**2+(math.sin(ang)/bb)**2)
    p = math.radians(phi)
    # outer arc: from upper terminal (angle -phi, y up) counter-clockwise through the left to lower terminal (+phi)
    outer = []; inner = []
    t0, t1 = -p, p
    # go the long way around: from angle -phi (upper right, measured with y down => negative y is up) decreasing through -pi/2.. to -(2pi-phi)
    angs = [ -p - (2*math.pi-2*p)*i/n for i in range(n+1) ]
    outer = [(cx+r(a,b,t)*math.cos(t), cy+r(a,b,t)*math.sin(t)) for t in angs]
    inner = [(cx+r(ai,bi,t)*math.cos(t), cy+r(ai,bi,t)*math.sin(t)) for t in reversed(angs)]
    return outer+inner

def word(vkind, small=False):
    g = 56.0 if not small else 100.0     # the interval opens in the small master, as in the official one
    parts = []
    x = 0
    # C
    C = C_path(); cx_max = max(p[0] for p in C); cx_min = min(p[0] for p in C)
    parts.append(("C", C)); x = cx_max + g - 14
    # L
    L = [(0,0),(S,0),(S,1000-H),(560,1000-H),(560,1000),(0,1000)]
    parts.append(("L", move(L, x))); x += 560 + g
    # I
    I = [(0,0),(S,0),(S,1000),(0,1000)]
    parts.append(("I", move(I, x))); x += S + g
    # N: left stem + diagonal + right stem, diagonals at 20.81
    Wn = DW + K*1000
    N = [(0,0),(DW,0),(Wn-S,(Wn-S-DW)/K),(Wn-S,0),(Wn,0),(Wn,1000),(K*1000,1000),(S,S/K),(S,1000),(0,1000)]
    parts.append(("N", move(N, x))); x += Wn + g
    # A, V, Y: verbatim geometry, A starts here, V and Y keep the official offsets (the A|V channel is the official one)
    ax = x
    parts.append(("A", [move(sub, ax) for sub in A_OFF]))
    vx = ax + VX
    parts.append(("V", move(v_variant("plain" if small else vkind), vx)))
    parts.append(("Y", move(Y_OFF, ax)))
    width = ax + (4166.1-OFF)
    return parts, width

def to_d(parts):
    out = {}
    for k, p in parts:
        out[k] = " ".join(poly(s) for s in p) if k == "A" else poly(p)
    return out

if __name__ == "__main__":
    res = {}
    for v in ["plain", "slit-left", "slit-right", "step"]:
        parts, w = word(v)
        res[v] = {"width": w, "d": to_d(parts)}
        ps, ws = word(v, small=True)
        res[v]["small"] = {"width": ws, "d": to_d(ps)}
    json.dump(res, open(sys.argv[1], "w"))
    print({k: round(v["width"],1) for k, v in res.items()}, {k: round(v["small"]["width"],1) for k,v in res.items()})
