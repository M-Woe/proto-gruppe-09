# struktur-oekologie-gruppe-XX

Vibe Coding Studio · SE Struktur und Ökologie · Universität Innsbruck · WS 2026/27

**Das ist die Vorlage für euer Gruppen-Repo.** Nicht hier arbeiten, sondern:

1. Oben rechts **Use this template → Create a new repository**
2. Owner: euer eigenes Konto · Name: `struktur-oekologie-gruppe-XX` mit eurer Gruppennummer statt `XX` (z. B. `struktur-oekologie-gruppe-03`)
3. **Private** wählen → **Create repository**
4. Weiter mit der Aufgabe „Etappe 0“ in OLAT

## Was drin ist

| Datei | Wofür |
|---|---|
| `check_setup.py` | prüft Python, Pakete, Git, VS Code und euren API-Key (`python check_setup.py`, Mac: `python3`) |
| `requirements.txt` | die Python-Pakete für den Kurs |
| `.gitignore` | sorgt dafür, dass `.env` (euer Key) und `.venv` nie auf GitHub landen |
| `LOGBUCH.md` | euer Prompt-Logbuch, gehört zur Abgabe |
| `.env.example` | Vorlage für eure `.env`: kopieren, in `.env` umbenennen, eigenen Key eintragen |

Nicht im Repo, das legt jede:r lokal selbst an: `.venv` (VS Code: „Python: Create Environment“) und `.env` (Kopie von `.env.example`) mit dem eigenen Key.

## Web-App: Stäbe-Viewer (Stockerau)

3D-Ansicht des Modells `Data/Stockerau Rhino Export from RFEM.3dm` neben der Stäbe-Tabelle. Klick auf einen Stab im Modell markiert die Zeile in der Tabelle (und umgekehrt). Excel-Export über den Button oben rechts.

```
python -m uvicorn app.main:app --port 8000
```

Dann im Browser `http://127.0.0.1:8000` öffnen. Die Python-Umgebung muss `rhino3dm`, `fastapi`, `uvicorn` und `openpyxl` enthalten (`pip install -r requirements.txt`). Three.js liegt lokal in `app/static/vendor/`, die App braucht also kein Internet.

| Datei | Wofür |
|---|---|
| `app/model.py` | liest das 3dm, verbindet Volumenkörper und Achslinien über die RFEM-BeamId, berechnet Volumen und Querschnitt |
| `app/main.py` | FastAPI-Server (`/api/members`, `/api/geometry`, `/api/export.xlsx`) |
| `app/static/` | Frontend (`index.html`, `app.js`, `style.css`) |
| `export_staebe_xlsx.py` | schreibt die Auswertung als Excel-Datei nach `Data/` |

**Variante mit Materialien:** `Data/webapp_material/` (Start per Doppelklick auf `Data/webapp_material/start_app.bat`). Gleiche App, zusätzlich mit Materialbereich unter dem 3D-Modell (Beton, Stahl, Holz, Glas), Materialspalte in den Tabellen, Farbumschalter „Material/Querschnitt“, Plausibilitätsprüfung und erweitertem Excel-Export. Die Zuordnung Querschnitt → Material steht samt Begründung in `Data/webapp_material/app/materials.json` und lässt sich dort ändern (Server danach neu starten).

Eine eigenständige Kopie der App liegt in `Data/webapp/` (Start per Doppelklick auf `Data/webapp/start_app.bat`). Sie findet das Modell in `Data/` automatisch. Änderungen an der App bitte in `app/` machen und danach nach `Data/webapp/app/` kopieren, sonst laufen die beiden Versionen auseinander.

---

**English:** This is the template for your group repo. Don't work here. Click **Use this template → Create a new repository**, choose your own account, name it `struktur-oekologie-gruppe-XX` with your group number instead of `XX`, select **Private**, then continue with “Stage 0” in OLAT. `.venv` and `.env` are created locally by each person and never go to GitHub.
