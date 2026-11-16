# Sicherung: Seminar Woche 2 - ReuseTwin IFC Webapp

Dieser Ordner ist eine **eigenstaendige Kopie** (67 Dateien, rund 40 MB) des lokalen Entwicklungsstands der
Reuse-Twin-Webapp. Er wurde am 16.11.2026 in das Repository `M-Woe/proto-gruppe-09`
(Ordner `Seminar_Woche2_ReuseTwin`) gelegt. Die lokale Arbeitsversion wurde dabei
**nicht veraendert**; dieser Ordner ist nur die Sicherung.

## Quelle

    c:\Users\marle\Desktop\Studium Master\Seminar\reuse-twin-student

## Enthalten

| Bereich | Dateien |
|---|---|
| Seiten | `index.html`, `import.html`, `studio.html` |
| Frontend | `src/` mit 21 Dateien (TypeScript, CSS) - darunter `parts.ts`, `parts-panel.ts`, `selection.ts`, `info-card.ts`, `explosion.ts`, `explosion-panel.ts`, `de.ts` |
| Core | `core/reuse_twin/` (Python, kompiliert ausgeliefert), `core/requirements.txt`, `core/VERSION` |
| Projekt | `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts` |
| Start | `scripts/setup.mjs`, `scripts/start.mjs`, `Start Reuse Twin (Windows).bat`, `Start Reuse Twin (Mac).command` |
| Oberflaeche | `public/shell.js`, `public/theme.js`, `src/style.css`, `src/student.css` |
| Daten | `out/` mit den importierten Modellen (`model.json`, `geometry.glb`, `audit.json/md`) und den Original-IFC-Dateien |
| Doku | `README.md` |

## Enthaltene Funktionen

- Mehrere IFC-Modelle gleichzeitig in einer 3D-Ansicht, an ihren IFC-Weltkoordinaten ausgerichtet
- Deutsche Bauteiltabelle in der rechten Panelspalte (5 Reiter, Filter, Suche, Sortierung)
- Gemeinsame Auswahlverwaltung (Modell + IFC-Key) zwischen 3D-Ansicht, Tabelle und Infokarte
- Bauteil-Infokarte am Rand des 3D-Viewports
- Interaktive Explosionsdarstellung (nach Bauteiltyp, Geschoss, Material oder Auswahl)

## Bewusst nicht enthalten

- `node_modules/` - wird von `npm install` neu installiert
- `core/.venv-windows/` und `core/.venv/` - lokale Python-Umgebung, entsteht ueber `npm run setup`
- `dist/` - Build-Artefakt, entsteht ueber `npm run build`
- `__pycache__/` - Cache

Die `.gitignore` dieser Sicherung weicht an einer Stelle vom Projektstand ab: dort ist `out/`
ausgeschlossen, hier ist es **enthalten**, damit die gesicherte Version sofort startklar ist
(die importierten Modelle sind dann schon da). `node_modules/`, `dist/` und die Python-Umgebungen
bleiben ausgeschlossen.

## Wiederherstellen und starten

    npm install
    npm run setup      # einmalig: Python-Umgebung fuer den Core
    npm start          # startet Core (127.0.0.1:8765) und Webapp (localhost:5173)

Danach ist die Seite `http://localhost:5173/index.html` erreichbar; die beiden UPV-Modelle
sind ueber `out/` bereits importiert.

Keine Zugangsdaten, API-Schluessel oder `.env`-Dateien sind Teil dieser Sicherung.