"""
Untersuche die Brep-Geometrien im Rhino-Modell:
- Welche Methoden zur Volumen-/Flächenberechnung gibt es?
- Wie sind die Querschnitte modelliert (extrudiert, als einzelne Flächen, etc.)?
- Prüfe exemplarisch je einen Stab pro Profiltyp.
"""
import rhino3dm

path = "data/Stockerau Rhino Export from RFEM.3dm"
with open(path, "rb") as f:
    data = f.read()
model = rhino3dm.File3dm.FromByteArray(data)

# 1) Brep-Methoden untersuchen (nur Geometrie, nicht Factory)
print("=== Brep-Geometrie-Methoden ===")
for i in range(len(model.Objects)):
    g = model.Objects[i].Geometry
    if type(g).__name__ == 'Brep':
        props = sorted([p for p in dir(g) if not p.startswith('_')])
        # Nur die interessanten: Get* / Compute* / Has* / Is*
        relevant = [p for p in props if any(k in p for k in 
                     ['Get', 'Compute', 'Volume', 'Area', 'Has', 'Is', 'Solid'])]
        print(f"  Relevante Methoden/Props: {relevant}")
        # Zusätzlich alle Get*-Methoden:
        getters = [p for p in props if p.startswith('Get')]
        print(f"  Get*-Methoden: {getters}")
        break  # Nur ein Brep anschauen

# 2) Einen Stab pro Profiltyp exemplarisch untersuchen
print("\n\n=== Exemplarische Brep-Analyse pro Profiltyp ===")
profile_layers = [
    "Flat Bar 33.3/20",
    "Flat Bar 275/12", 
    "Flat Bar 162.5/12",
    "Flat Bar 162.5/20",
    "Flat Bar 275/20",
    "RO 139.7x8.0 | EN 10210-2:2006",
    "Rectangle 500/500",
]

for pl in profile_layers:
    print(f"\n--- {pl} ---")
    found = False
    for i in range(len(model.Objects)):
        obj = model.Objects[i]
        g = obj.Geometry
        if type(g).__name__ == 'Brep':
            li = obj.Attributes.LayerIndex
            ln = model.Layers[li].Name if 0 <= li < len(model.Layers) else ""
            if ln == pl:
                found = True
                bb = g.GetBoundingBox()
                print(f"  BoundingBox:")
                print(f"    Min: ({bb.Min.X}, {bb.Min.Y}, {bb.Min.Z})")
                print(f"    Max: ({bb.Max.X}, {bb.Max.Y}, {bb.Max.Z})")
                print(f"    Size: ({bb.Max.X-bb.Min.X}, {bb.Max.Y-bb.Min.Y}, {bb.Max.Z-bb.Min.Z})")
                
                # Brep Flächen zählen
                faces = g.Faces
                print(f"  Faces: {len(faces)}")
                
                # Brep Kanten zählen
                edges = g.Edges
                print(f"  Edges: {len(edges)}")
                
                # Brep Vertices 
                verts = g.Vertices
                print(f"  Vertices: {len(verts)}")
                
                # Ist es ein solider Körper?
                print(f"  IsSolid: {g.IsSolid}")
                print(f"  IsSurface: {g.IsSurface}")
                print(f"  HasBrepForm: {g.HasBrepForm}")
                break  # Nur ersten gefundenen untersuchen
    if not found:
        print(f"  Kein Brep gefunden!")

# 3) Falls es keine Volume/Area-Methode auf Brep gibt: 
#    Hat das Surface-Objekt eine Flächenberechnung?
print("\n\n=== BrepSurface untersuchen (erster Brep) ===")
for i in range(len(model.Objects)):
    g = model.Objects[i].Geometry
    if type(g).__name__ == 'Brep':
        surfaces = g.Surfaces
        print(f"  Brep hat {len(surfaces)} Surface(s)")
        if len(surfaces) > 0:
            s = surfaces[0]
            sprops = sorted([p for p in dir(s) if not p.startswith('_')])
            print(f"  Surface[0] props: {sprops}")
        break

# 4) Prüfe, ob es eine Volume-Methode auf BrepEdge oder anderen Sub-Klassen gibt
print("\n\n=== BrepFace untersuchen ===")
for i in range(len(model.Objects)):
    g = model.Objects[i].Geometry
    if type(g).__name__ == 'Brep':
        faces = g.Faces
        if len(faces) > 0:
            f = faces[0]
            fprops = sorted([p for p in dir(f) if not p.startswith('_')])
            print(f"  BrepFace props: {fprops}")
        break