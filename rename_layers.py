"""Benenne Layer in Bauteilnamen um in allen Daten.Dateien."""
import json, csv, re

mapping = {
    # Flachstahle
    "Flat Bar 33.3/20": "Flachstahl 33x20",
    "Flat Bar 162.5/12": "Flachstahl 163x12",
    "Flat Bar 162.5/20": "Flachstahl 163x20",
    "Flat Bar 175/12": "Flachstahl 175x12",
    "Flat Bar 175/20": "Flachstahl 175x20",
    "Flat Bar 200/12": "Flachstahl 200x12",
    "Flat Bar 200/20": "Flachstahl 200x20",
    "Flat Bar 225/12": "Flachstahl 225x12",
    "Flat Bar 225/20": "Flachstahl 225x20",
    "Flat Bar 237.5/12": "Flachstahl 238x12",
    "Flat Bar 237.5/20": "Flachstahl 238x20",
    "Flat Bar 275/12": "Flachstahl 275x12",
    "Flat Bar 275/20": "Flachstahl 275x20",
    # Rundrohr
    "RO 139.7x8.0 | EN 10210-2:2006": "Rundrohr 140x8",
    # Fundamente
    "Rectangle 500/500": "Fundament 500x500",
    # Zugstabe
    "RD 12": "Zugstab D12",
}

def rename_layer(ln):
    return mapping.get(ln, ln)

# Alle JSON-Dateien mit "layer" duchgehen
files = [
    "data/staebe_mit_querschnitt.json",
    "data/staebe_mit_material.json",
    "data/staebe_mit_co2.json",
    "data/stab_analyse.json",
    "data/staebe_export.json",
    "data/co2_nach_layer.json",
    "data/material_nach_layer.json",
    "data/staebe_layer_tabelle.json",
]

for path in files:
    try:
        data = json.load(open(path))
    except: continue
    if isinstance(data, dict):
        # stab_analyse.json und staebe_export haben linecurves/breps Listen
        for key in ["linecurves","breps","summary"]:
            if key in data:
                for item in (data[key] if isinstance(data[key], list) else []):
                    if "layer" in item:
                        item["layer"] = rename_layer(item["layer"])
        if "layer_comparison" in data:
            for k in ["both","only_lines","only_breps"]:
                if k in data["layer_comparison"]:
                    data["layer_comparison"][k] = [rename_layer(x) for x in data["layer_comparison"][k]]
    elif isinstance(data, list):
        for item in data:
            if "layer" in item:
                item["layer"] = rename_layer(item["layer"])
    json.dump(data, open(path,"w"), indent=2, ensure_ascii=False, default=str)
    print(f"  {path}")

# CSV-Dateien
csv_files = [
    "data/staebe_mit_querschnitt.csv", "data/staebe_mit_material.csv",
    "data/staebe_mit_co2.csv", "data/co2_nach_layer.csv",
    "data/material_nach_layer.csv", "data/staebe_layer_tabelle.csv",
]
for path in csv_files:
    try:
        with open(path, encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
    except: continue
    changed = False
    for row in rows:
        if "layer" in row and row["layer"] in mapping:
            row["layer"] = mapping[row["layer"]]
            changed = True
        if "Layer" in row and row["Layer"] in mapping:
            row["Layer"] = mapping[row["Layer"]]
            changed = True
        if "Material" in row and row["Material"] in mapping:
            row["Material"] = mapping[row["Material"]]
            changed = True
    if changed:
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=rows[0].keys())
            w.writeheader(); w.writerows(rows)
    print(f"  {path}")

print("\nAlle Layer umbenannt.")