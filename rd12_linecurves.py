"""RD 12 Geometrie in staebe_linecurves.csv einfuegen."""
import csv, math, rhino3dm

with open("data/staebe_linecurves.csv", encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))

model = rhino3dm.File3dm.FromByteArray(open("data/Stockerau Rhino Export from RFEM.3dm","rb").read())
added = 0
for i in range(len(model.Objects)):
    o = model.Objects[i]; g = o.Geometry; a = o.Attributes
    li = a.LayerIndex
    ln = model.Layers[li].Name if 0 <= li < len(model.Layers) else ""
    if ln != "RD 12" or type(g).__name__ != "LineCurve":
        continue
    fp, tp = g.PointAtStart, g.PointAtEnd
    L = math.sqrt((tp.X-fp.X)**2 + (tp.Y-fp.Y)**2 + (tp.Z-fp.Z)**2)
    rows.append({
        "uuid": str(a.Id), "layer": "RD 12", "type": "LineCurve", "name": "",
        "from_x": f"{fp.X:.4f}", "from_y": f"{fp.Y:.4f}", "from_z": f"{fp.Z:.4f}",
        "to_x": f"{tp.X:.4f}", "to_y": f"{tp.Y:.4f}", "to_z": f"{tp.Z:.4f}",
        "length_m": f"{L:.4f}", "obj_index": str(i),
    })
    added += 1

with open("data/staebe_linecurves.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys())
    w.writeheader(); w.writerows(rows)

print(f"Linecurves aktualisiert: {len(rows)} (RD 12: {added} neu)")