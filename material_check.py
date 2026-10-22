"""
Fokussierte Material-Analyse: Alle Material-Namen und Zuordnung zu Stäben.
"""
import rhino3dm
from collections import Counter

path = "data/Stockerau Rhino Export from RFEM.3dm"
with open(path, "rb") as f:
    data = f.read()
model = rhino3dm.File3dm.FromByteArray(data)

# Alle Material-Namen
print("=== ALLE 15 MATERIALIEN IM MODELL ===")
for i in range(len(model.Materials)):
    m = model.Materials[i]
    print(f"  [{i}] {m.Name}")

# Welche Objekte haben welchen MaterialIndex?
print("\n=== MATERIALINDEX VERTEILUNG (alle 2986 Objekte) ===")
mat_dist = Counter()
for i in range(len(model.Objects)):
    a = model.Objects[i].Attributes
    mat_dist[a.MaterialIndex] += 1
for mi, cnt in sorted(mat_dist.items()):
    mname = model.Materials[mi].Name if mi >= 0 and mi < len(model.Materials) else "-"
    print(f"  Index {mi:3d} ({mname:30s}): {cnt:5d} Objekte")

# Strukturelle Objekte: welcher MaterialIndex?
print("\n=== MATERIALINDEX DER 561 STAB-OBJEKTE ===")
struct_mat = Counter()
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    a = obj.Attributes
    li = a.LayerIndex
    ln = model.Layers[li].Name if 0 <= li < len(model.Layers) else f"Idx{li}"
    if not any(k in ln for k in ["Flat Bar", "RO ", "Rectangle "]):
        continue
    struct_mat[a.MaterialIndex] += 1

for mi, cnt in sorted(struct_mat.items()):
    mname = model.Materials[mi].Name if mi >= 0 and mi < len(model.Materials) else "-"
    print(f"  Index {mi:3d} ({mname:30s}): {cnt:5d} Stäbe")

# Haben die Stäbe Namen / UserStrings?
print("\n=== NAMEN DER STRUKTUR-OBJEKTE (Stichprobe) ===")
name_count = Counter()
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    a = obj.Attributes
    li = a.LayerIndex
    ln = model.Layers[li].Name if 0 <= li < len(model.Layers) else f"Idx{li}"
    if not any(k in ln for k in ["Flat Bar", "RO ", "Rectangle "]):
        continue
    name = a.Name or "(leer)"
    name_count[name] += 1

for n, cnt in name_count.most_common(20):
    print(f"  '{n}': {cnt}")