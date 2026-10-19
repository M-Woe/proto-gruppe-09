"""
Berechne Querschnittsflaeche und Volumen fuer alle 561 Staebe.
Schreibe Ergebnisse in CSV und JSON.
"""
import rhino3dm, json, math, csv, re
from collections import defaultdict

path = "data/Stockerau Rhino Export from RFEM.3dm"
print("Lade Modell ...")
with open(path, "rb") as f:
    data = f.read()
model = rhino3dm.File3dm.FromByteArray(data)

# Alle Breps und LineCurves nach Layer sammeln
layer_lcs = defaultdict(list)
layer_breps = defaultdict(list)
layer_names = [l.Name for l in model.Layers]

for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    a = obj.Attributes
    li = a.LayerIndex
    ln = layer_names[li] if 0 <= li < len(layer_names) else f"Idx{li}"
    if not any(k in ln for k in ["Flat Bar", "RO ", "Rectangle "]):
        continue
    gtype = type(g).__name__ if g else 'None'
    if gtype == 'LineCurve':
        layer_lcs[ln].append((i, g, a))
    elif gtype == 'Brep':
        layer_breps[ln].append((i, g, a))

print(f"Layer mit LineCurves: {len(layer_lcs)}")
print(f"Layer mit Breps:      {len(layer_breps)}")

def parse_profile(ln):
    if "Flat Bar" in ln:
        parts = ln.replace("Flat Bar ", "").split("/")
        return ("flat_bar", float(parts[0])/1000, float(parts[1])/1000)
    if "RO " in ln:
        m = re.search(r'RO ([\d.]+)x([\d.]+)', ln)
        if m:
            return ("round_tube", float(m.group(1))/1000, float(m.group(2))/1000)
    if "Rectangle " in ln:
        parts = ln.split()[-1].split("/")
        return ("rectangle", float(parts[0])/1000, float(parts[1])/1000)
    return ("unknown", 0, 0)

def brep_dims(geom):
    edges = geom.Edges
    elen = []
    for ei in range(len(edges)):
        e = edges[ei]
        p1, p2 = e.PointAtStart, e.PointAtEnd
        elen.append(math.hypot(p2.X-p1.X, p2.Y-p1.Y, p2.Z-p1.Z))
    elen.sort()
    return (elen[0]+elen[3])/2, elen[4], elen[7]

results = []
for ln in sorted(layer_lcs.keys()):
    lcs = layer_lcs[ln]
    brs = layer_breps[ln]
    prof_type, p1, p2 = parse_profile(ln)
    for idx in range(min(len(lcs), len(brs))):
        lc = lcs[idx]
        br = brs[idx]
        li, lg, la = lc
        bi, bg, ba = br
        fp, tp = lg.PointAtStart, lg.PointAtEnd
        L = math.hypot(tp.X-fp.X, tp.Y-fp.Y, tp.Z-fp.Z)
        if prof_type == "flat_bar":
            t_br, w1, w2 = brep_dims(bg)
            A1, A2 = w1*t_br, w2*t_br
            V = (A1+A2)/2*L
            meth = "flachstab_variabel" if abs(w1-w2) >= 0.001 else "flachstab_konstant"
        elif prof_type == "round_tube":
            D, t_n = p1, p2
            A1 = A2 = math.pi*(D**2-(D-2*t_n)**2)/4
            V = A1*L
            w1 = w2 = D
            t_br = t_n
            meth = "rundrohr_konstant"
        elif prof_type == "rectangle":
            w, h = p1, p2
            A1 = A2 = w*h
            V = A1*L
            w1 = w2 = w
            t_br = h
            meth = "kastenprofil_konstant"
        else:
            continue
        results.append({
            "lc_uuid": str(la.Id), "br_uuid": str(ba.Id),
            "layer": ln, "laenge_m": round(L,4),
            "dicke_m": round(t_br,6),
            "breite1_m": round(w1,6), "breite2_m": round(w2,6),
            "A1_m2": round(A1,8), "A2_m2": round(A2,8),
            "A_avg_m2": round((A1+A2)/2,8),
            "volumen_m3": round(V,8), "methode": meth,
        })

print(f"\nBerechnete Staebe: {len(results)}")

csv_fields = ["lc_uuid","br_uuid","layer","laenge_m","dicke_m",
              "breite1_m","breite2_m","A1_m2","A2_m2","A_avg_m2",
              "volumen_m3","methode"]
csv_path = "data/staebe_mit_querschnitt.csv"
with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=csv_fields, extrasaction="ignore")
    w.writeheader()
    for r in results:
        w.writerow(r)
print(f"CSV: {csv_path} ({len(results)})")

json_path = "data/staebe_mit_querschnitt.json"
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False, default=str)
print(f"JSON: {json_path}")

by_ly = defaultdict(lambda: {"n":0,"V":0,"L":0})
for r in results:
    by_ly[r["layer"]]["n"] += 1
    by_ly[r["layer"]]["V"] += r["volumen_m3"]
    by_ly[r["layer"]]["L"] += r["laenge_m"]

print("\n=== ZUSAMMENFASSUNG ===")
for ln in sorted(by_ly):
    b = by_ly[ln]
    print(f"  {ln:35s} {b['n']:3d} Stk  L={b['L']:7.3f}m  V={b['V']:10.6f}m3")
tv = sum(r["volumen_m3"] for r in results)
tl = sum(r["laenge_m"] for r in results)
print(f"  {'SUMME':35s} {len(results):3d} Stk  L={tl:7.3f}m  V={tv:10.6f}m3")