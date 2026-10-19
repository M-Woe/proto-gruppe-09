"""
Detaillierte Kantenanalyse: alle 12 Edges sortiert.
So lassen sich Dicke, Breite und Laenge jedes Breps ableiten.
"""
import rhino3dm, math

path = "data/Stockerau Rhino Export from RFEM.3dm"
with open(path, "rb") as f:
    data = f.read()
model = rhino3dm.File3dm.FromByteArray(data)

profile_layers = [
    "Flat Bar 33.3/20",
    "Flat Bar 162.5/12",
    "Flat Bar 162.5/20",
    "Flat Bar 275/12",
    "Flat Bar 275/20",
    "RO 139.7x8.0 | EN 10210-2:2006",
    "Rectangle 500/500",
]

for pl in profile_layers:
    for i in range(len(model.Objects)):
        obj = model.Objects[i]
        g = obj.Geometry
        if type(g).__name__ != 'Brep': continue
        li = obj.Attributes.LayerIndex
        ln = model.Layers[li].Name if 0 <= li < len(model.Layers) else ""
        if ln != pl: continue
        
        edges = g.Edges
        edge_info = []
        for ei in range(len(edges)):
            e = edges[ei]
            p1, p2 = e.PointAtStart, e.PointAtEnd
            dx, dy, dz = p2.X-p1.X, p2.Y-p1.Y, p2.Z-p1.Z
            length = math.sqrt(dx*dx + dy*dy + dz*dz)
            is_linear = e.IsLinear if hasattr(e, 'IsLinear') else '?'
            edge_info.append((length, ei, is_linear))
        
        edge_info.sort(key=lambda x: x[0])
        
        print(f"\n{pl}:")
        print(f"  Rang | Laenge (m) | Laenge (mm) | Edge# | IsLinear")
        print(f"  ----+-----------+-------------+-------+---------")
        for rank, (l, ei, lin) in enumerate(edge_info):
            # Farbcodierung: kurz=rot(Dicke), mittel=blau(Breite), lang=gruen(Laenge)
            label = ""
            if rank < 4: label = " <- Dicke"
            elif rank < 8: label = " <- Breite"
            else: label = " <- Laenge"
            print(f"  {rank:2d}.  {l:9.4f}  {l*1000:9.2f}      {ei:3d}    {str(lin):6s}{label}")
        
        # Nur ersten Brep pro Layer
        break