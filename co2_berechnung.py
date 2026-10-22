"""Etappe 4: CO2e-Berechnung aus Oekobaudat-Daten."""
import json, csv
from collections import defaultdict

with open("data/staebe_mit_material.json") as f:
    staebe = json.load(f)

DATEN = {
    "Baustahl S355JR": {"uuid":"20c29cbd-f9a2-4518-a1ce-c681246c29c8","bezug":"kg","dichte":7850,
        "fak":{"A1-A3":0.560287,"C1":0.002190,"C2":0.002513,"C3":0,"C4":0.000145,"D":0.209625}},
    "Beton C25/30": {"uuid":"8347f9a7-f4ec-4a36-a266-a0281f5fd16d","bezug":"m3","dichte":2400,
        "fak":{"A1-A3":181.0,"C1":3.32,"C2":10.3,"C3":5.05,"C4":0,"D":-12.1}},
    "Betonstahl (Bewehrung)": {"uuid":"a8ebf8f2-2fcc-4431-b730-93bf5efd8111","bezug":"kg","dichte":7850,
        "fak":{"A1-A3":0.5930,"C1":0,"C2":0.00705,"C3":0.000148,"C4":0.000292,"D":0.0598}},
}

def get_ds(layer):
    if "Flat Bar" in layer or "RO " in layer: return "Baustahl S355JR"
    if "Rectangle" in layer: return "Beton C25/30"
    return None

results = []
for s in staebe:
    dn = get_ds(s["layer"])
    if not dn: continue
    ds = DATEN[dn]; V = float(s["volumen_m3"]); L = float(s["laenge_m"])
    m = V * ds["dichte"] if ds["bezug"]=="kg" else 0
    m_beton = V * ds["dichte"] if ds["bezug"]=="m3" else 0
    
    co2 = {mod: (m if ds["bezug"]=="kg" else V)*f for mod,f in ds["fak"].items()}
    
    bewo = {}; bewo_kg = V*85 if "Beton" in dn else 0
    if bewo_kg:
        bds = DATEN["Betonstahl (Bewehrung)"]
        for mod,f in bds["fak"].items():
            bewo[mod] = bewo_kg*f
    
    results.append({
        "lc_uuid": s["lc_uuid"], "layer": s["layer"], "material": s["material"],
        "datensatz": dn, "volumen_m3": round(V,8),
        "masse_kg": round(m + m_beton, 4),
        "laenge_m": round(L,4),
        "co2_A1A3_kg": round(co2["A1-A3"],6),
        "co2_C_sum_kg": round(sum(co2[m] for m in ["C1","C2","C3","C4"]),6),
        "co2_D_kg": round(co2["D"],6),
        "bewehrung_kg": round(bewo_kg,4),
        "bewehrung_co2_A1A3_kg": round(bewo.get("A1-A3",0),6),
    })

by = defaultdict(lambda:{"n":0,"V":0,"M":0,"A1A3":0,"C":0,"D":0,"bA":0})
for r in results:
    b=by[r["material"]]; b["n"]+=1; b["V"]+=r["volumen_m3"]
    b["M"]+=r["masse_kg"]; b["A1A3"]+=r["co2_A1A3_kg"]
    b["C"]+=r["co2_C_sum_kg"]; b["D"]+=r["co2_D_kg"]; b["bA"]+=r["bewehrung_co2_A1A3_kg"]

print("=== CO2e-BILANZ ===")
for m in sorted(by):
    b=by[m]
    print(f"\n  {m}: {b['n']} Stk, V={b['V']:.3f}m3")
    if b["M"]>0: print(f"    Masse: {b['M']:.1f}kg")
    print(f"    A1-A3: {b['A1A3']:.2f}kg  C: {b['C']:.4f}kg  D: {b['D']:.4f}kg")
    if b["bA"]>0: print(f"    + Bewehrung A1-A3: {b['bA']:.2f}kg")

tA1=sum(b["A1A3"]+b["bA"] for b in by.values())
tC=sum(b["C"] for b in by.values()); tD=sum(b["D"] for b in by.values())
print(f"\n  SUMME: A1-A3={tA1:.2f}kg ({tA1/1000:.3f}t)  C={tC:.2f}kg  D={tD:.2f}kg")

csv_f="data/staebe_mit_co2.csv"
with open(csv_f,"w",newline="",encoding="utf-8-sig") as f:
    w=csv.DictWriter(f,fieldnames=["lc_uuid","layer","material","datensatz","masse_kg","laenge_m","volumen_m3","co2_A1A3_kg","co2_C_sum_kg","co2_D_kg","bewehrung_kg","bewehrung_co2_A1A3_kg"],extrasaction="ignore")
    w.writeheader()
    for r in results: w.writerow(r)
print(f"\nCSV: {csv_f} ({len(results)})")

with open("data/staebe_mit_co2.json","w",encoding="utf-8") as f:
    json.dump(results,f,indent=2,ensure_ascii=False,default=str)
print("JSON: data/staebe_mit_co2.json")