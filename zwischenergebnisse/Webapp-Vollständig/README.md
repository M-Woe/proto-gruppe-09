# Webapp-Vollständig

Stäbe-Viewer für den Pavillon Stockerau, vollständige Version:

- 3D-Modell (Three.js) mit Klick auf einen Stab
- Tabelle Querschnitte und Tabelle Stäbe (Geometrie: Länge, Fläche, Volumen)
- **Tabelle CO₂e je Stab**: kg CO₂e (GWP-total) je Lebenszyklus-Modul A1–A3, A4, A5, B1, C1–C4, D, live aus der ÖKOBAUDAT
- Umschalter Standard/Alternative für Baustahl und Beton, Knopf „Neu abrufen“

## Starten

Python mit `rhino3dm`, `fastapi`, `uvicorn`, `openpyxl` (`pip install -r requirements.txt`).

```
cd zwischenergebnisse/Webapp-Vollständig
python -m uvicorn app.main:app --port 8000
```

Windows: Doppelklick auf `start_app.bat`. Dann `http://127.0.0.1:8000` öffnen. Das Modell wird automatisch in `../../data/` gefunden. Die ÖKOBAUDAT-Abfrage braucht Internet, three.js liegt lokal.

## Dateien

| Datei | Wofür |
|---|---|
| `app/main.py` | FastAPI-Server (`/api/members`, `/api/geometry`, `/api/carbon`, `/api/export.xlsx`) |
| `app/model.py` | liest das 3dm, berechnet Längen, Flächen, Volumen |
| `app/oekobaudat.py` | holt Datensätze live: `…/processes/<UUID>?format=json&view=extended`, liest Bezugseinheit und GWP-total je Modul |
| `app/carbon.py` | Material je Stab, Masse, kg CO₂e je Modul |
| `app/materials.json` | Zuordnung Querschnitt → Material mit Begründung |
| `export_co2_xlsx.py` | schreibt die CO₂e-Tabelle als Excel (`CO2e_Staebe_Stockerau.xlsx`) |

## Annahmen

- Datensätze: Baustahl Profile und Stabstahl (Bezug **1000 kg**), Beton C25/30 (Bezug **1 m³**), Betonstahl (Bezug **1 kg**). Alternativen: Grobblech, EcoPact.
- Stahl: Masse = Volumen × 7850 kg/m³. Beton: Volumen × GWP je m³ plus Bewehrung pauschal 85 kg Betonstahl je m³ Beton.
- Rohrstützen RO 139.7x8.0 sind im Modell massiv, gerechnet wird mit dem Hohlquerschnitt.
- Leere Werte: Modul im Datensatz nicht deklariert. Modul D nicht mit A–C addieren.
