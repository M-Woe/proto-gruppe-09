# Zwischenergebnisse

Stand der Arbeit zum Modell `data/Stockerau Rhino Export from RFEM.3dm` (Pavillon Stockerau). Dieser Ordner ist neu angelegt, kein bestehender Inhalt des Repos wurde verändert.

| Inhalt | Beschreibung |
|---|---|
| `Staebe_Auswertung_Stockerau.xlsx` | Auswertung: 736 Stäbe, 16 Querschnitte, Anzahl, Querschnittsfläche, Längen, Volumen |
| `export_staebe_xlsx.py` | erzeugt die Excel-Datei (`openpyxl`) |
| `webapp_staebe/` | Web-App: 3D-Modell + Stäbetabelle, Klick im Modell markiert den Stab in der Tabelle |
| `webapp_material/` | wie `webapp_staebe`, zusätzlich mit Materialzuordnung (Beton/Stahl), Plausibilitätsprüfung und Excel-Export |

## Web-App starten

Python mit `rhino3dm`, `fastapi`, `uvicorn`, `openpyxl` nötig (`pip install -r requirements.txt` plus `pip install openpyxl`).

```
cd zwischenergebnisse/webapp_material
python -m uvicorn app.main:app --port 8000
```

Dann `http://127.0.0.1:8000` öffnen (Windows: Doppelklick auf `start_app.bat`). Die Apps finden das Modell automatisch in `../../data/`. `three.js` liegt lokal im Ordner, es braucht kein Internet.

## Wichtige Hinweise

- Das Modell enthält nur bei 60 von 1297 Objekten eine Materialangabe. Die übrigen Materialien sind aus Profil, Maßen und Lage **abgeleitet** (Begründung je Querschnitt in `webapp_material/app/materials.json`).
- Flat Bar 162.5/20 (18 Stäbe) steht im Modell als „Concrete C25/30“, was bei 20 mm Dicke nicht plausibel ist. Die App ordnet Stahl zu und markiert den Widerspruch.
- Die RD‑12‑Zugstäbe (175) sind im Modell nur Achslinien, ihr Volumen ist als A × L berechnet.
- Die Rohre RO 139.7x8.0 sind im Modell massiv modelliert (Volumen = Vollzylinder).
