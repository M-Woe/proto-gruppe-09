"""
BrepLoop / BrepEdge / BrepVertex genauer untersuchen.
Können wir die Querschnittsfläche direkt aus der Geometrie berechnen?
"""
import rhino3dm, math

path = "data/Stockerau Rhino Export from RFEM.3dm"
with open(path, "rb") as f:
    data = f.read()
model = rhino3dm.File3dm.FromByteArray(data)

# Einen Flat Bar 33.3/20 Brep finden und alle Loops/Edges durchgehen
print("=== BrepLoop / Edge / Vertex Analyse ===")
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    if type(g).__name__ != 'Brep': continue
    li = obj.Attributes.LayerIndex
    ln = model.Layers[li].Name if 0 <= li < len(model.Layers) else ""
    if ln != "Flat Bar 33.3/20": continue
    
    faces = g.Faces
    for fi in range(len(faces)):
        f = faces[fi]
        # Nur planare Faces interessieren (Querschnittsflächen)
        is_planar = f.IsPlanar if hasattr(f, 'IsPlanar') else None
        if not is_planar:
            continue
        
        loop = f.OuterLoop
        if not loop:
            continue
        
        print(f"\n  Face[{fi}] (planar={is_planar}):")
        lprops = [p for p in dir(loop) if not p.startswith('_')]
        print(f"    Loop props: {lprops}")
        
        # BrepLoop hat Edges?
        for p in lprops:
            try:
                val = getattr(loop, p)
                if not callable(val):
                    print(f"    .{p}: {repr(val)[:200]}")
            except Exception as e:
                print(f"    .{p}: ERROR {e}")
        
        # lass uns nur die ersten 2 planaren Faces untersuchen
        if fi >= 3:
            break
    
    # Nur einen Brep untersuchen
    break

# BrepEdge: gibt es eine Länge/Linien-Info?
print("\n\n=== BrepEdge-Details ===")
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    if type(g).__name__ != 'Brep': continue
    
    edges = g.Edges
    for ei in range(min(4, len(edges))):
        e = edges[ei]
        eprops = [p for p in dir(e) if not p.startswith('_')]
        print(f"\n  Edge[{ei}]: {eprops}")
        for p in eprops:
            try:
                val = getattr(e, p)
                if not callable(val):
                    print(f"    .{p}: {repr(val)[:200]}")
            except Exception as e:
                print(f"    .{p}: ERROR {e}")
    break

# BrepVertex
print("\n\n=== BrepVertex ===")
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    if type(g).__name__ != 'Brep': continue
    
    verts = g.Vertices
    if len(verts) > 0:
        v = verts[0]
        vprops = [p for p in dir(v) if not p.startswith('_')]
        print(f"  Vertex props: {vprops}")
        for p in vprops:
            try:
                val = getattr(v, p)
                if not callable(val):
                    print(f"    .{p}: {repr(val)[:200]}")
            except:
                pass
    break