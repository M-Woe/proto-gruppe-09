"""Extrahiere alle GWP-Werte aus Oekobaudat API."""
import urllib.request, json

UUIDs = [
    ("Baustahl: Profile und Stabstahl","20c29cbd-f9a2-4518-a1ce-c681246c29c8"),
    ("Baustahl: Grobblech (Alt.)","04d1311a-ae38-4bfb-8e11-8992f1ddb14f"),
    ("Beton C25/30","8347f9a7-f4ec-4a36-a266-a0281f5fd16d"),
    ("Beton C25/30 EcoPact (Alt.)","69dc12cf-ce4d-4251-8ea3-330ed72f2f79"),
    ("Betonstahl in Staeben","a8ebf8f2-2fcc-4431-b730-93bf5efd8111"),
]

for name, uid in UUIDs:
    data = json.loads(urllib.request.urlopen(
        f"https://oekobaudat.de/OEKOBAU.DAT/resource/processes/{uid}?format=json&view=extended"
    ).read())
    
    de_name = "?"
    try:
        bname = data["processInformation"]["dataSetInformation"]["name"]["baseName"]
        de_name = [b["value"] for b in bname if b.get("lang")=="de"][0]
    except:
        pass
    
    # Bezugseinheit + Dichte aus exchanges
    exchanges = data.get("exchanges", {}).get("exchange", [])
    ref_unit, conv, density = "?", 1.0, None
    for exc in exchanges:
        if isinstance(exc, dict) and exc.get("referenceFlow"):
            for p in exc.get("flowProperties", []):
                if p.get("referenceFlowProperty"):
                    ref_unit = p.get("referenceUnit", "?") or "?"
            for mp in exc.get("materialProperties", []):
                if "density" in mp.get("name", "").lower():
                    density = f"{mp['value']} {mp.get('unit','')}"
                if "conversion factor to 1 kg" in mp.get("name", ""):
                    conv = float(mp["value"])
    
    # GWP-total aus LCIAResults
    lcia = data.get("LCIAResults", {}).get("LCIAResult", [])
    gwp = {}
    for res in lcia:
        if not isinstance(res, dict): continue
        sd = res.get("referenceToLCIAMethodDataSet", {}).get("shortDescription", [{}])[0].get("value", "")
        if "GWP" in sd and "total" in sd:
            for a in res.get("other", {}).get("anies", []):
                if isinstance(a, dict) and "module" in a:
                    mod = a.get("module", "?")
                    val = float(a.get("value", 0))
                    sce = a.get("scenario", "")
                    key = f"{mod}({sce})" if sce else mod
                    gwp[key] = val
    
    print(f"\n{'='*60}")
    print(f"  {de_name}")
    print(f"  UUID: {uid}")
    print(f"  Bezug: {ref_unit}  Konv-Faktor: {conv}  Dichte: {density or '?'}")
    print(f"  GWP-total (pro {ref_unit}):")
    for k, v in sorted(gwp.items()):
        per_kg = v * conv
        print(f"    {k:12s}: {v:12.4f}  -> {per_kg:12.6f} kg CO2e/{ref_unit}")
    if conv != 1.0:
        print(f"  --> GWP je kg: A1-A3 = {gwp.get('A1-A3',0)*conv:.6f} kg CO2e/kg")