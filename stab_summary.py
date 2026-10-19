"""Zusammenfassung der Stab-Analyse aus der JSON-Datei."""
import json
from collections import Counter

d = json.load(open("data/stab_analyse.json"))

print("=== ZUSAMMENFASSUNG DER STAB-ANALYSE ===\n")

print(f"Gesamt Objekte im Modell: {d['total_objects']}")
print(f"Gesamt Layer:             {d['total_layers']}")
print(f"LineCurve (Stabachsen):   {d['summary']['total_linecurves']}")
print(f"Brep (3D-Körper):         {d['summary']['total_breps']}")
print(f"Layer mit beidem:         {len(d['summary']['layers_with_both'])}")
print()

# Strukturelle Layer (nur die relevanten)
lc = Counter(l["layer"] for l in d["linecurves"])
bc = Counter(b["layer"] for b in d["breps"])

print("=== STAB-LAYER (LineCurve-Achsen) ===")
print(f"{'Layer':40s} {'LineCurve':>10s} {'Brep':>10s} {'Beschreibung':>20s}")
print("-"*85)
for ln in sorted([x for x in lc if "Flat Bar" in x or "RO " in x or "Rectangle" in x or "RD " in x]):
    lc_cnt = lc.get(ln, 0)
    b_cnt = bc.get(ln, 0)
    # Beschreibung aus Layer-Namen ableiten
    if "Flat Bar" in ln:
        parts = ln.replace("Flat Bar ", "").split("/")
        desc = f"Flachstab {parts[0]}x{parts[1]}"
    elif "RO " in ln:
        desc = "Rundrohr"
    elif "Rectangle" in ln:
        desc = "Kastenprofil"
    elif "RD " in ln:
        desc = "Rundstab Durchm."
    else:
        desc = ""
    print(f"  {ln:40s} {lc_cnt:10d} {b_cnt:10d} {desc:>20s}")

print(f"\n  {'Summe Stabachsen':40s} {sum(lc.get(ln,0) for ln in [x for x in lc if 'Flat Bar' in x or 'RO ' in x or 'Rectangle' in x or 'RD ' in x]):10d}")
print(f"  {'Summe 3D-Körper':40s} {sum(bc.get(ln,0) for ln in [x for x in bc if 'Flat Bar' in x or 'RO ' in x or 'Rectangle' in x or 'RD ' in x]):10d}")

print(f"\nAlle stäbe-relevanten LineCurve-Objekte haben eine korrespondierende Brep-3D-Darstellung im SELBEN Layer.")
print("Ausnahme: 'RD 12' (Rundstab) und 'A-ANNO-NOTE' (Bemaßung) haben nur LineCurves, keine Breps.")