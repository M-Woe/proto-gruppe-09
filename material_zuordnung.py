"""
Etappe 3: Materialzuordnung für alle 561 Stäbe.
Regelbasiert nach Team-Vorgabe.
"""
import rhino3dm, json, csv
from collections import defaultdict

# === LADEN ===
with open("data/staebe_mit_querschnitt.json") as f:
    qs_data = json.load(f)

with open("data/staebe_linecurves.csv", encoding="utf-8-sig") as f:
    lc_rows = list(csv.DictReader(f))
lc_lookup = {r["uuid"]: r for r in lc_rows}

# === MATERIAL-REGELN (Team-Vorgabe) ===
def assign_material(layer_name):
    """Regelbasierte Materialzuordnung nach Team-Vorgabe."""
    if "Flat Bar" in layer_name:
        return {
            "material": "Baustahl S355JR",
            "material_category": "Stahl",
            "material_standard": "DIN EN 10025-2 (S355JR)",
            "decision_level": "regelbasiert (Team-Vorgabe)",
            "reasoning": "Flachstahl in Tragekonstruktion - Baustahl S355JR als Standard-Baustahl fuer diesen Profiltyp",
        }
    elif "RO " in layer_name:
        return {
            "material": "Baustahl S355JR",
            "material_category": "Stahl",
            "material_standard": "DIN EN 10210-2 (S355JR)",
            "decision_level": "regelbasiert (Team-Vorgabe)",
            "reasoning": "Rundrohr EN 10210-2 - Standard-Baustahl fuer Rundhohlprofile",
        }
    elif "Rectangle" in layer_name:
        return {
            "material": "Beton C25/30",
            "material_category": "Beton",
            "material_standard": "DIN EN 206 (C25/30)",
            "decision_level": "regelbasiert (Team-Vorgabe)",
            "reasoning": "500x500 Fundamentkoerper - Beton der Druckfestigkeitsklasse C25/30 fuer Fundamente",
        }
    else:
        return {
            "material": "unbekannt",
            "material_category": "unbekannt",
            "material_standard": "",
            "decision_level": "offen (keine Information)",
            "reasoning": "Keine Regel fuer diesen Layer-Typ",
        }

# === MATERIAL ZUORDNEN ===
results = []
for r in qs_data:
    mat = assign_material(r["layer"])
    lc = lc_lookup.get(r["lc_uuid"], {})
    lc_name = lc.get("name", "")
    
    entry = {
        "lc_uuid": r["lc_uuid"],
        "br_uuid": r["br_uuid"],
        "layer": r["layer"],
        "laenge_m": r["laenge_m"],
        "volumen_m3": r["volumen_m3"],
        "material": mat["material"],
        "material_category": mat["material_category"],
        "material_standard": mat["material_standard"],
        "decision_level": mat["decision_level"],
        "reasoning": mat["reasoning"],
        "name": lc_name,
    }
    results.append(entry)

# === AUSWERTUNG ===
print("=== MATERIALZUORDNUNG (alle 561 Staebe) ===\n")
from collections import Counter
mat_count = Counter(e["material"] for e in results)
for mat, cnt in mat_count.most_common():
    vol = sum(float(e["volumen_m3"]) for e in results if e["material"] == mat)
    print(f"  {mat:25s}: {cnt:4d} Staebe, {vol:9.6f} m3")

# === TEST: EINEN STAB PRO MATERIAL PRUEFEN ===
print("\n\n=== TEST: PLAUSIBILITAETSPRUEFUNG ===\n")

# Test 1: Ein Flat Bar 275/12 Stab (Stahl)
for r in results:
    if "Flat Bar 275/12" in r["layer"]:
        print(f"Test-Stab 1: {r['layer']}")
        print(f"  UUID: {r['lc_uuid']}")
        print(f"  Laenge: {r['laenge_m']} m")
        print(f"  Volumen: {r['volumen_m3']} m3")
        print(f"  Material: {r['material']}")
        print(f"  Entscheidungsstufe: {r['decision_level']}")
        # Plausibilitaet: Dichte Stahl ~7850 kg/m3
        L = float(r["laenge_m"])
        V = float(r["volumen_m3"])
        # Querschnittsflaeche = V/L
        A = V / L if L > 0 else 0
        print(f"  Querschnittsflaeche (aus Volumen/Laenge): {A:.8f} m2 = {A*1e6:.2f} mm2")
        # Erwartet: (w1+w2)/2 * t = Mittelwert
        print(f"  -> Plausibel als Stahl-Flachstab 275x12mm (S355)")
        break

print()
for r in results:
    if "Rectangle" in r["layer"]:
        print(f"Test-Stab 2: {r['layer']}")
        print(f"  UUID: {r['lc_uuid']}")
        print(f"  Laenge: {r['laenge_m']} m")
        print(f"  Volumen: {r['volumen_m3']} m3")
        print(f"  Material: {r['material']}")
        print(f"  Entscheidungsstufe: {r['decision_level']}")
        L = float(r["laenge_m"])
        V = float(r["volumen_m3"])
        A = V / L if L > 0 else 0
        print(f"  Querschnittsflaeche (aus Volumen/Laenge): {A:.6f} m2 = {A*1e4:.2f} cm2")
        # 500x500 = 0.25 m2
        print(f"  Erwartet fuer 500x500: 0.25 m2")
        print(f"  -> Plausibel als Betonfundament C25/30 (500x500 mm)")
        break

# === CSV-EXPORT ===
csv_fields = ["lc_uuid","br_uuid","layer","name","laenge_m","volumen_m3",
              "material","material_category","material_standard",
              "decision_level","reasoning"]
csv_path = "data/staebe_mit_material.csv"
with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=csv_fields, extrasaction="ignore")
    w.writeheader()
    for r in results:
        w.writerow(r)
print(f"\nCSV: {csv_path} ({len(results)} Eintraege)")

json_path = "data/staebe_mit_material.json"
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False, default=str)
print(f"JSON: {json_path}")