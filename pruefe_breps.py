"""
Prüfe ALLE Breps (auch RO, Rectangle) auf variable Querschnitte.
"""
import rhino3dm, math

path = "data/Stockerau Rhino Export from RFEM.3dm"
with open(path, "rb") as f:
    data = f.read()
model = rhino3dm.File3dm.FromByteArray(data)

print(f"{'Layer':40s} {'Typ':15s} {'Anzahl':>6s} {'davon variabel':>15s} {'Details':>30s}")
print("-"*110)

from collections import Counter

# Alle Breps nach Layer gruppieren
layer_breps = {}
for i in range(len(model.Objects)):
    obj = model.Objects[i]
    g = obj.Geometry
    if type(g).__name__ != 'Brep': continue
    li = obj.Attributes.LayerIndex
    ln = model.Layers[li].Name if 0 <= li < len(model.Layers) else f"Idx{li}"
    
    edges = g.Edges
    elen = []
    for ei in range(len(edges)):
        e = edges[ei]
        p1, p2 = e.PointAtStart, e.PointAtEnd
        dx, dy, dz = p2.X-p1.X, p2.Y-p1.Y, p2.Z-p1.Z
        elen.append(math.sqrt(dx*dx + dy*dy + dz*dz))
    elen.sort()
    
    if ln not in layer_breps:
        layer_breps[ln] = []
    layer_breps[ln].append(elen)

for ln, all_edges in sorted(layer_breps.items()):
    n_var = 0
    n_const = 0
    detail = ""
    
    for elen in all_edges:
        # 4 kürzeste = Dicke, 4 mittlere = Breite
        if len(elen) >= 8:
            thick = elen[:4]
            width = elen[4:8]
            
            # Prüfe: Dicke variabel?
            t_ok = abs(thick[0] - thick[3]) < 0.001
            # Prüfe: Breite variabel?
            w_ok = abs(width[0] - width[3]) < 0.001
            
            if t_ok and w_ok:
                n_const += 1
            else:
                n_var += 1
                if n_var <= 3:
                    detail += f"W={width[0]*1000:.1f}→{width[3]*1000:.1f}mm "
                    if not t_ok:
                        detail += f"T={thick[0]*1000:.1f}→{thick[3]*1000:.1f}mm "
        else:
            # RO-Topologie (3 Edges)
            n_const += 1
    
    if "Flat Bar" in ln:
        typ = "Flachstab"
    elif "RO " in ln:
        typ = "Rundrohr"
    elif "Rectangle" in ln:
        typ = "Kastenprofil"
    else:
        typ = "?"
    
    print(f"  {ln:40s} {typ:15s} {n_const+n_var:6d} {n_var:15d} {detail:30s}")