"""
Export der erkannten Stäbe als CSV und JSON.

Definiert "Stab" = LineCurve + zugehöriger Brep (3D-Körper) im selben Layer.
RD 12 (Rundstäbe ohne Brep) werden separat geführt.
"""
import rhino3dm, json, math, csv, os
from collections import Counter, defaultdict

# === LADEN ===
path = "data/Stockerau Rhino Export from RFEM.3dm"
print(f"Lade {path} ...")
with open(path, "rb") as f:
    data = f.read()
model = rhino3dm.File3dm.FromByteArray(data)

# Strukturelle Layer identifizieren (alle Flat Bar, RO, Rectangle, RD)
structural_keywords = ["Flat Bar", "RO ", "Rectangle "]

# === Alle Objekte durchgehen ===
struct_lines = []   # LineCurve in strukturellen Layern
struct_breps = []   # Brep in strukturellen Layern
rd12_lines = []     # RD 12 separat (nur LineCurve)

for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    a = obj.Attributes
    li = a.LayerIndex
    lname = model.Layers[li].Name if 0 <= li < len(model.Layers) else f"Idx{li}"

    if not any(k in lname for k in structural_keywords):
        continue  # nur strukturelle Layer

    gtype = type(g).__name__ if g else 'None'
    
    if gtype == 'LineCurve':
        fp, tp = g.PointAtStart, g.PointAtEnd
        dx, dy, dz = tp.X-fp.X, tp.Y-fp.Y, tp.Z-fp.Z
        length = math.sqrt(dx*dx + dy*dy + dz*dz)
        entry = {
            "obj_index": i,
            "uuid": str(a.Id),
            "layer": lname,
            "type": "LineCurve",
            "from_x": round(fp.X, 4), "from_y": round(fp.Y, 4), "from_z": round(fp.Z, 4),
            "to_x": round(tp.X, 4), "to_y": round(tp.Y, 4), "to_z": round(tp.Z, 4),
            "length_m": round(length, 4),
            "name": a.Name or "",
        }
        if "RD 12" in lname:
            rd12_lines.append(entry)
        else:
            struct_lines.append(entry)
    
    elif gtype == 'Brep':
        bb = g.GetBoundingBox()
        try:
            w, h, d = bb.Max.X-bb.Min.X, bb.Max.Y-bb.Min.Y, bb.Max.Z-bb.Min.Z
            dims = sorted([w, h, d])
            l_est, w_est, t_est = dims[2], dims[1], dims[0]
        except:
            l_est = w_est = t_est = 0
        entry = {
            "obj_index": i,
            "uuid": str(a.Id),
            "layer": lname,
            "type": "Brep",
            "bb_min": [round(bb.Min.X, 4), round(bb.Min.Y, 4), round(bb.Min.Z, 4)],
            "bb_max": [round(bb.Max.X, 4), round(bb.Max.Y, 4), round(bb.Max.Z, 4)],
            "length_est_m": round(l_est, 4),
            "width_est_m": round(w_est, 4),
            "thickness_est_m": round(t_est, 4),
            "name": a.Name or "",
            "is_solid": bool(g.IsSolid) if hasattr(g, 'IsSolid') else None,
        }
        struct_breps.append(entry)

# === Ergebnis ===
print(f"\nStrukturelle LineCurve (Stabachsen): {len(struct_lines)}")
print(f"Strukturelle Brep (3D-Körper):       {len(struct_breps)}")
print(f"RD 12 (Rundstäbe, nur LineCurve):    {len(rd12_lines)}")
print(f"Summe Stäbe (LineCurve):             {len(struct_lines)}")

# Sicherstellen: Jeder Stab hat LineCurve + Brep
lc_by_layer = Counter(l["layer"] for l in struct_lines)
br_by_layer = Counter(b["layer"] for b in struct_breps)
print("\nPaarung prüfen:")
for ln in sorted(set(list(lc_by_layer.keys()) + list(br_by_layer.keys()))):
    lc = lc_by_layer.get(ln, 0)
    br = br_by_layer.get(ln, 0)
    status = "✓ 1:1" if lc == br else f"! {lc}L vs {br}B"
    print(f"  {ln:35s} LC={lc:4d}  Brep={br:4d}  {status}")

# === CSV-Export: Stäbe (LineCurve) ===
csv_path = "data/staebe_linecurves.csv"
csv_fields = ["uuid", "layer", "type", "name", "from_x", "from_y", "from_z",
              "to_x", "to_y", "to_z", "length_m", "obj_index"]
with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=csv_fields, extrasaction="ignore")
    w.writeheader()
    for e in struct_lines:
        w.writerow(e)
print(f"\nCSV exportiert: {csv_path} ({len(struct_lines)} Einträge)")

# === CSV-Export: Brep ===
csv_path_b = "data/staebe_breps.csv"
csv_fields_b = ["uuid", "layer", "type", "name", "length_est_m", "width_est_m",
                "thickness_est_m", "is_solid", "obj_index"]
with open(csv_path_b, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=csv_fields_b, extrasaction="ignore")
    w.writeheader()
    for e in struct_breps:
        w.writerow(e)
print(f"CSV exportiert: {csv_path_b} ({len(struct_breps)} Einträge)")

# === JSON-Export (komplett) ===
json_path = "data/staebe_export.json"
output = {
    "modell": "Stockerau Rhino Export from RFEM.3dm",
    "gesamt_objekte": len(model.Objects),
    "strukturelle_staebe_linecurves": struct_lines,
    "strukturelle_staebe_breps": struct_breps,
    "rd12_linecurves": rd12_lines,
    "anzahl_stabachsen": len(struct_lines),
    "anzahl_3d_koerper": len(struct_breps),
    "anzahl_rd12": len(rd12_lines),
}
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, default=str)
print(f"JSON exportiert: {json_path}")

print("\n=== FERTIG ===")