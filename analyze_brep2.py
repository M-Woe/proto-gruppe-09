"""
Vertiefte Brep-Analyse: Face/Surface-Geometrie untersuchen.
"""
import rhino3dm, math

path = "data/Stockerau Rhino Export from RFEM.3dm"
with open(path, "rb") as f:
    data = f.read()
model = rhino3dm.File3dm.FromByteArray(data)

# 1) BrepFace untersuchen
print("=== BrepFace-Details (Flat Bar 33.3/20) ===")
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    if type(g).__name__ != 'Brep': continue
    li = obj.Attributes.LayerIndex
    ln = model.Layers[li].Name if 0 <= li < len(model.Layers) else ""
    if ln != "Flat Bar 33.3/20": continue
    
    faces = g.Faces
    print(f"  Faces: {len(faces)}")
    for fi in range(len(faces)):
        f = faces[fi]
        fprops = [p for p in dir(f) if not p.startswith('_')]
        print(f"\n  Face[{fi}]: {fprops}")
        for p in fprops:
            try:
                val = getattr(f, p)
                if not callable(val):
                    print(f"    .{p}: {repr(val)[:300]}")
            except Exception as e:
                print(f"    .{p}: ERROR {e}")
    break

# 2) BrepSurfaces
print("\n\n=== BrepSurface-Details ===")
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    if type(g).__name__ != 'Brep': continue
    
    surfaces = g.Surfaces
    print(f"  Surfaces: {len(surfaces)}")
    for si in range(min(3, len(surfaces))):
        s = surfaces[si]
        sprops = [p for p in dir(s) if not p.startswith('_')]
        print(f"\n  Surface[{si}]: {sprops}")
        for p in sprops:
            try:
                val = getattr(s, p)
                if not callable(val):
                    print(f"    .{p}: {repr(val)[:300]}")
            except Exception as e:
                print(f"    .{p}: ERROR {e}")
    break

# 3) LineCurve.GetLength()
print("\n\n=== LineCurve.GetLength() ===")
for i in range(len(model.Objects)):
    g = model.Objects[i].Geometry
    if type(g).__name__ != 'LineCurve': continue
    if hasattr(g, 'GetLength'):
        l = g.GetLength()
        print(f"  GetLength() = {l}")
    if hasattr(g, 'GetSquaredLength'):
        sl = g.GetSquaredLength()
        print(f"  GetSquaredLength() = {sl}")
    break