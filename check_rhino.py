"""
Analyse: Stäbe im Pavillon-Modell identifizieren und exportieren.
Ermittelt: LineCurve (1D-Achsen) vs Brep (3D-Körper) als zwei Darstellungen.
"""
import rhino3dm, json, math
from collections import Counter

path = "data/Stockerau Rhino Export from RFEM.3dm"
print("Lade Modell ...")
with open(path, "rb") as f:
    data = f.read()
model = rhino3dm.File3dm.FromByteArray(data)

print(f"Objekte: {len(model.Objects)}, Layer: {len(model.Layers)}")

# 1) Geometrie-Typen
print("\n=== GEOMETRIE-TYPEN ===")
geo_types = Counter()
for i in range(len(model.Objects)):
    g = model.Objects[i].Geometry
    geo_types[type(g).__name__ if g else 'None'] += 1
for t, n in geo_types.most_common():
    print(f"  {t:25s}: {n}")

# 2) Objekte nach Layer
print("\n=== OBJEKTE NACH LAYER (mit Geo-Typ) ===")
layer_data = Counter()
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    a = obj.Attributes
    gtype = type(g).__name__ if g else 'None'
    li = a.LayerIndex
    lname = model.Layers[li].Name if 0 <= li < len(model.Layers) else f"Idx{li}"
    layer_data[(lname, gtype)] += 1
for (ln, gt), n in sorted(layer_data.most_common()):
    print(f"  {ln:30s} {gt:20s} {n:6d}")
# 3) LineCurve im Detail
print("\n=== LINECURVE (Stabachsen) ===")
lines_info = []
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    if type(g).__name__ != 'LineCurve':
        continue
    a = obj.Attributes
    li = a.LayerIndex
    lname = model.Layers[li].Name if 0 <= li < len(model.Layers) else f"Idx{li}"
    fp = g.PointAtStart
    tp = g.PointAtEnd
    dx, dy, dz = tp.X-fp.X, tp.Y-fp.Y, tp.Z-fp.Z
    length = math.sqrt(dx*dx + dy*dy + dz*dz)
    lines_info.append({
        "obj_index": i,
        "layer": lname, "layer_index": li,
        "from_x": fp.X, "from_y": fp.Y, "from_z": fp.Z,
        "to_x": tp.X, "to_y": tp.Y, "to_z": tp.Z,
        "length": round(length, 4),
        "name": a.Name or "",
        "uuid": str(a.Id) if hasattr(a, 'Id') else "",
        "visible": a.Visible if hasattr(a, 'Visible') else True,
        "color": None,
    })
    if len(lines_info) % 200 == 0:
        print(f"  ... {len(lines_info)} LineCurves gefunden")

print(f"LineCurve gesamt: {len(lines_info)}")
lines_by_layer = Counter(l["layer"] for l in lines_info)
for ln, cnt in sorted(lines_by_layer.most_common(), key=lambda x: x[1], reverse=True):
    print(f"  {ln:30s}: {cnt:4d}")

# 4) Brep im Detail
print("\n=== BREP (3D-Körper) ===")
brep_info = []
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    if type(g).__name__ != 'Brep':
        continue
    a = obj.Attributes
    li = a.LayerIndex
    lname = model.Layers[li].Name if 0 <= li < len(model.Layers) else f"Idx{li}"
    bb = g.GetBoundingBox()
    try:
        w = bb.Max.X - bb.Min.X
        h = bb.Max.Y - bb.Min.Y
        d = bb.Max.Z - bb.Min.Z
        dims = sorted([w, h, d])
        length_est, width_est, thick_est = dims[2], dims[1], dims[0]
    except:
        length_est = width_est = thick_est = 0
    brep_info.append({
        "obj_index": i,
        "layer": lname, "layer_index": li,
        "bb_min_x": bb.Min.X, "bb_min_y": bb.Min.Y, "bb_min_z": bb.Min.Z,
        "bb_max_x": bb.Max.X, "bb_max_y": bb.Max.Y, "bb_max_z": bb.Max.Z,
        "estimated_length": round(length_est, 4),
        "estimated_width": round(width_est, 4),
        "estimated_thickness": round(thick_est, 4),
        "is_solid": g.IsSolid if hasattr(g, 'IsSolid') else None,
        "name": a.Name or "",
        "uuid": str(a.Id) if hasattr(a, 'Id') else "",
    })
    if len(brep_info) % 200 == 0:
        print(f"  ... {len(brep_info)} Breps gefunden")

print(f"Brep gesamt: {len(brep_info)}")
brep_by_layer = Counter(b["layer"] for b in brep_info)
for ln, cnt in sorted(brep_by_layer.most_common(), key=lambda x: x[1], reverse=True):
    print(f"  {ln:30s}: {cnt:4d}")

# 5) Vergleich LineCurve vs Brep
print("\n=== LAYER MIT BEIDEN DARSTELLUNGEN ===")
l_layers = set(l["layer"] for l in lines_info)
b_layers = set(b["layer"] for b in brep_info)
both = l_layers & b_layers
only_l = l_layers - b_layers
only_b = b_layers - l_layers

print(f"Gleicher Layer (LineCurve+Brep): {len(both)} Layer")
for ln in sorted(both):
    print(f"  {ln:30s}  (LC={lines_by_layer[ln]}, Brep={brep_by_layer[ln]})")

print(f"\nNur LineCurve: {len(only_l)} Layer")
for ln in sorted(only_l):
    print(f"  {ln:30s}  ({lines_by_layer[ln]} Obj.)")

print(f"\nNur Brep: {len(only_b)} Layer")
for ln in sorted(only_b):
    print(f"  {ln:30s}  ({brep_by_layer[ln]} Obj.)")

# 6) JSON-Export
output = {
    "model_file": "Stockerau Rhino Export from RFEM.3dm",
    "total_objects": len(model.Objects),
    "total_layers": len(model.Layers),
    "geometry_types": dict(geo_types),
    "linecurves": lines_info,
    "breps": brep_info,
    "summary": {
        "total_linecurves": len(lines_info),
        "total_breps": len(brep_info),
        "layers_with_both": sorted(list(both)),
        "layers_only_linecurves": sorted(list(only_l)),
        "layers_only_breps": sorted(list(only_b)),
    }
}

with open("data/stab_analyse.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, default=str)
print(f"\n→ Analyse gespeichert: data/stab_analyse.json")