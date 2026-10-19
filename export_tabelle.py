"""Export der Stab-Layer-Tabelle als CSV und JSON."""
import csv, json

# Daten aus der Analyse
rows = [
    {"Layer": "Flat Bar 33.3/20",        "Anzahl": 116, "Profil": "Flachstab 33,3 × 20 mm",           "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 275/12",         "Anzahl":  70, "Profil": "Flachstab 275 × 12 mm",            "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 275/20",         "Anzahl":  41, "Profil": "Flachstab 275 × 20 mm",            "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 162.5/12",       "Anzahl":  35, "Profil": "Flachstab 162,5 × 12 mm",          "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 175/12",         "Anzahl":  35, "Profil": "Flachstab 175 × 12 mm",            "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 200/12",         "Anzahl":  35, "Profil": "Flachstab 200 × 12 mm",            "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 225/12",         "Anzahl":  35, "Profil": "Flachstab 225 × 12 mm",            "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 237.5/12",       "Anzahl":  35, "Profil": "Flachstab 237,5 × 12 mm",          "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 162.5/20",       "Anzahl":  18, "Profil": "Flachstab 162,5 × 20 mm",          "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 200/20",         "Anzahl":  18, "Profil": "Flachstab 200 × 20 mm",            "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 237.5/20",       "Anzahl":  18, "Profil": "Flachstab 237,5 × 20 mm",          "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 175/20",         "Anzahl":  23, "Profil": "Flachstab 175 × 20 mm",            "Kategorie": "Flachstab"},
    {"Layer": "Flat Bar 225/20",         "Anzahl":  23, "Profil": "Flachstab 225 × 20 mm",            "Kategorie": "Flachstab"},
    {"Layer": "RO 139.7x8.0 | EN 10210-2:2006", "Anzahl": 12, "Profil": "Rundrohr Ø 139,7 × 8 mm",  "Kategorie": "Rundrohr"},
    {"Layer": "Rectangle 500/500",       "Anzahl":  47, "Profil": "Kastenprofil 500 × 500 mm",        "Kategorie": "Kastenprofil"},
]

# CSV schreiben
with open("data/staebe_layer_tabelle.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=["Layer", "Anzahl", "Profil", "Kategorie"])
    w.writeheader()
    w.writerows(rows)
    # Summenzeile
    w.writerow({"Layer": "Summe", "Anzahl": sum(r["Anzahl"] for r in rows), "Profil": "", "Kategorie": ""})

print("CSV: data/staebe_layer_tabelle.csv")

# JSON schreiben
with open("data/staebe_layer_tabelle.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, indent=2, ensure_ascii=False)

print("JSON: data/staebe_layer_tabelle.json")

# Ausgabe
print(f"\n{len(rows)} Einträge + Summe exportiert.")