# ReuseTwin – Anker-Explorer

Eigenständiger Frontend-Snapshot der weiterentwickelten ReuseTwin-Anwendung. Er enthält den Anker-Explorer samt Detailansicht, Komponentenliste, lokaler Explosionsdarstellung, Schnittfunktion und zuschaltbaren Analyseebenen.

## Status und Abgrenzung

Dieses Modul liegt separat unter `Anker-Explorer/`. Es wurde nicht in die bestehende Anwendung unter `Seminar_Woche2_ReuseTwin/` eingebaut, da deren Viewer- und Page-Schnittstellen nicht vollständig mit dieser Version übereinstimmen. Bestehende Projektdateien wurden nicht geändert.

Enthalten sind die benötigten Frontend-Quellen, Seiten, Assets und Build-Konfigurationen. Nicht kopiert wurden IFC-Dateien, der Python-Core, `out/`, `dist/`, `node_modules/` und lokale Geheimnisse. Die Abhängigkeiten entsprechen den bereits im ReuseTwin-Projekt verwendeten Versionen; dieses Modul führt keine zusätzlichen Bibliotheken ein.

## Starten

Voraussetzung: Node.js/npm und die vorhandenen Projektdateien des ReuseTwin-Backends.

1. In einem Terminal den vorhandenen Core starten:

   ```powershell
   cd .\Seminar_Woche2_ReuseTwin
   npm run core
   ```

2. In einem zweiten Terminal das Frontend starten:

   ```powershell
   cd .\Anker-Explorer
   npm ci
   npm run dev
   ```

3. Die von Vite angezeigte lokale Adresse öffnen (standardmäßig `http://localhost:5173`).

Der Vite-Proxy leitet `/api` an den Core auf Port `8765` weiter. Die optionalen Chat-Funktionen verwenden den lokalen Ollama-Dienst unter Port `11434`.

## Prüfen und bauen

```powershell
npm run typecheck
npm run build
```

Die drei Seiten sind `index.html` (Inventory), `import.html` und `studio.html`. Das Modul benötigt keine IFC-Kopien im Repository; IFC-Modelle werden über den bestehenden Core bereitgestellt.

## Daten- und Analysegrenzen

Die Analyse zeigt IFC-Daten und geometrisch berechnete Beobachtungen getrennt. Geometrischer Kontakt gilt nicht als Nachweis einer mechanischen Verbindung. Mechanische Freiheitsgrade oder eine gesicherte Demontage werden ohne entsprechende Daten nicht behauptet.
