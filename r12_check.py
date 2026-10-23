"""Pruefe RD 12 Objekte im Rhino-Modell."""
import rhino3dm
m = rhino3dm.File3dm.FromByteArray(open("data/Stockerau Rhino Export from RFEM.3dm","rb").read())
cnt = 0
for i in range(len(m.Objects)):
    obj = m.Objects[i]
    a = obj.Attributes
    li = a.LayerIndex
    ln = m.Layers[li].Name if 0 <= li < len(m.Layers) else ""
    if "RD 12" in ln:
        cnt += 1
        g = obj.Geometry
        gt = type(g).__name__ if g else "None"
        if cnt <= 5:
            print(f"Obj[{i:5d}] Layer={ln:30s} Geo={gt:20s} Name={a.Name}")
print(f"\nRD 12 Objekte insgesamt: {cnt}")
# Auch andere Layer mit "RD" suchen
cnt2 = 0
for i in range(len(m.Objects)):
    obj = m.Objects[i]
    a = obj.Attributes
    li = a.LayerIndex
    ln = m.Layers[li].Name if 0 <= li < len(m.Layers) else ""
    if "RD" in ln and "RD 12" not in ln:
        cnt2 += 1
        if cnt2 <= 3:
            g = obj.Geometry
            gt = type(g).__name__ if g else "None"
            print(f"  ANDERE RD: Layer={ln:30s} Geo={gt}")
print(f"Andere RD-Layer Objekte: {cnt2}")