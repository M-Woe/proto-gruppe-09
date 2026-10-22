# Logbuch

Pro Etappe ein Eintrag. Kurz reicht. Das Logbuch ist Teil der Abgabe und Grundlage eurer Demo.
One entry per stage. Short is fine. The log is part of the submission and the basis for your demo.

## Etappe 0

- **Was wir gemacht haben:**
- **Wichtigste Prompts** (wörtlich kopieren):
  > Bitte untersuche zuerst mein Repository und prüfe, ob die Datei vorhanden ist. Unsere Aufgabe ist es, eine vollständige Liste aller Stäbe des Pavillons zu erstellen. Das Rhino-Modell enthält Stäbe in zwei unterschiedlichen Darstellungen, deshalb müssen wir genau untersuchen, welche Objekte zu den tatsächlichen Stäben gehören und ob es doppelte Darstellungen gibt. Gehe bitte schrittweise vor: Prüfe, welche Dateien und Ordner vorhanden sind. Erkläre mir, wie wir die Rhino-Datei mit Python und rhino3dm auslesen können. Untersuche, welche Objekttypen, Layer und Attribute im Modell vorhanden sind. Erstelle ein Skript, das die erkannten Stäbe mit einer eindeutigen ID, ihrer Geometrie, Länge und vorhandenen Objektinformationen in eine CSV- oder JSON-Datei schreibt. Zeige mir die ermittelte Anzahl der Stäbe und erkläre, wie ich diese Zahl in Rhino überprüfen kann. Bitte ändere nicht unnötig bestehende Dateien. Lösche keine Objekte, nur weil sie ähnlich aussehen. Erfinde keine fehlenden Informationen. Erkläre mir die einzelnen Schritte und warte bei wichtigen Entscheidungen auf meine Rückmeldung.
- **Was schiefging und woran wir es gemerkt haben:**
- **Was wir selbst geprüft haben** (von Hand, im Plan, im Modell):

---

# Sprint 1: Carbon-Inventur Pavillon Stockerau

## Etappe 1: Modell lesen

**Test:** Wie viele Stäbe hat der Pavillon? Prüft die Zahl am Modell nach.

**Ergebnis (ÜBERHOLT, siehe Protokoll unten):** Der Pavillon hat **561 Stäbe** (nur Typ `Beam`, ohne RD 12) (Stabachsen als LineCurve) mit jeweils einer korrespondierenden 3D-Darstellung als Brep (Volumenkörper) – insgesamt also 561 Stäbe in 1:1-Doppelrepräsentation.

**Protokoll Etappe 1 (fortlaufend, Stand 22.10.2026)**

**Umgebung und Bibliotheken**
- Python 3.14.8 (`.venv`), `rhino3dm` 8.35.0 (erfüllt `requirements.txt`: `rhino3dm>=8.9`). Keine weiteren Pakete für Etappe 1 nötig; Tests mit `unittest` aus der Standardbibliothek.
- Modell: `data/Stockerau Rhino Export from RFEM.3dm`, 2986 Objekte, 330 Layer, Einheit Meter. Lesen nur lesend (`File3dm.Read`).

**Vorhandene Projektstruktur (nicht verändert)**
- Skripte: `export_staebe.py`, `check_rhino.py`, `calc_querschnitt.py`, `analyze_brep*.py`, `stab_summary.py`, `pruefe_breps.py` u. a.
- Ergebnisdateien: `data/staebe_export.json`, `data/staebe_linecurves.csv`, `data/staebe_breps.csv`, `data/staebe_layer_tabelle.*`, `data/stab_analyse.json`.
- Diese Dateien zählen nur die 561 Brep-/Achs-Paare des Typs `Beam`. Die Linien `RD 12` wurden dort als „vermutlich Bewehrung“ eingestuft (siehe offene Frage 1).

**Untersuchung des Modells**
- Objekttypen: Hatch 245, LineCurve 1462, Text 642, Brep 561, NurbsCurve 39, ArcCurve 11, PolylineCurve 13, PolyCurve 3, GeometryBase 10.
- Stab-Erkennung über die RFEM-Benutzerdaten je Objekt: `BG_RFEM_Exchange_BeamId_bg0246` (Stab-Nummer), `BG_RFEM_Exchange_Type_bg0247` (`Beam` oder `Tension`), `CrosSec_S/E` (Querschnitt Anfang/Ende), `RotAngle`.
- Gefundene Darstellungen:
  - Brep, Typ `Beam`: 561 (Volumenkörper)
  - LineCurve, Typ `Beam`: 561 (Stabachse, dieselben BeamIds wie die Breps, je Layer 1:1)
  - LineCurve, Typ `Tension`: 175 (nur Layer `RD 12`, kein Brep)
- Objekte mit BeamId gesamt: 1297. Eindeutige BeamIds: 736 (561 + 175). Die Differenz 1297 − 736 = 561 ist die Doppelung Brep + Achse.
- Layer-Paarung geprüft: Alle Stablayer außer `RD 12` haben LineCurve-Anzahl = Brep-Anzahl. `RD 12` hat 175 LineCurves und 0 Breps.
- Keine doppelten Achsen: Alle 175 Endpunktpaare der `RD 12`-Linien sind eindeutig.

**Doppelzählung vermeiden**
- Brep und Achse mit gleicher BeamId werden zu einem Stab zusammengeführt. Der Stab wird über die Achse (Start-, Endpunkt, Länge) beschrieben, der Brep nur referenziert (`brep_vorhanden`).

**Ergebnis Etappe 1 (Skript, Stand 22.10.2026)**
- **Stabanzahl: 736** (561 × `Beam`, 175 × `Tension`). Die ursprüngliche Angabe „561 Stäbe“ ist unvollständig, weil sie die 175 `RD 12`-Linien nicht enthält.
- Gesamtlänge laut CSV: 686,38 m (Längen der 561-Stab-Auswertung unten gelten nur für die Beam-Stäbe und sind **nicht** für 736 neu berechnet).

**Erstellte und geänderte Dateien**
- Neu: `stab_liste_etappe1.py` (Liste erzeugen, nur lesen plus CSV/JSON schreiben)
- Neu: `test_stab_liste_etappe1.py` (8 Tests)
- Neu: `data/etappe1_staebe_liste.csv` (736 Zeilen), `data/etappe1_staebe_liste.json`
- Neu: `export_etappe1_excel.py` (Excel-Export aller ausgelesenen Daten)
- Neu: `output/excel/etappe1_modell_export.xlsx` (Speicherort: `<Projekt>/output/excel/`, Ordner wird bei Bedarf automatisch angelegt)
  - Sheets: `Stabliste` (736 Zeilen, 19 Spalten), `Achsen_Rohdaten` (736 Zeilen, alle Benutzerdaten der LineCurves mit BeamId), `Brep_Rohdaten` (561 Zeilen, alle Benutzerdaten), `Objekttypen` (9 Typen), `Layer` (39 Layer mit Objektzahlen je Typ, nur Layer mit Objekten), `Zusammenfassung` (Anzahl und Länge je Typ und Layer, Summenzeile)
  - Geprüft: Zeilenzahlen stimmen mit den Quelldaten überein; Summenzeile 736 Stäbe, 686,3793 m.
- Hinweis: `output/` ist ein neuer Ordner. Die `.xlsx` liegt lokal und ist noch nicht im Git-Stand; ob sie ins Repo soll, ist offen.
- Geändert: `LOGBUCH.md` (dieser Eintrag)
- Nicht verändert: alle bestehenden Skripte und Datendateien (laut `git status`)

**Tests**
- Befehl: `python -m unittest -v test_stab_liste_etappe1`
- Ergebnis: 8 von 8 bestanden. Geprüft: Gesamtanzahl 736; Anzahl je Typ (561/175); eindeutige IDs; keine doppelten Achsen; Länge = Endpunktabstand (Toleranz 2e-4); `Beam` hat Brep, `Tension` nicht; Rohdaten-Zusammenführung (je BeamId genau 1 Achse, bei Beam 1 Brep); CSV und JSON vollständig.
- Zusätzliche Prüfung der Ausgabedateien: CSV 736 Zeilen, Längensumme 686,38 m.

**Technische Probleme und Anpassungen**
- `Point3d` in rhino3dm nicht iterierbar. Zugriff über `.X/.Y/.Z`.
- `LineCurve` hat in rhino3dm 8.35 kein `GetLength()`. Länge wird aus den Endpunkten berechnet.
- Terminal-Ausgaben kamen teilweise nicht zurück. Ergebnisse wurden daher über Dateien (Temp-Dateien, CSV/JSON-Lesen) verifiziert.
- Editor-Limit (6000 Zeichen): Skript in Teilen angelegt, eine Einfügezeile musste nach Prüfung der Zeilenzahl korrigiert werden.
- Excel-Export: `openpyxl` (3.1.5) war in der `.venv` nicht installiert und wurde per `pip install openpyxl` ergänzt. `openpyxl` steht bereits in der Projektvorlage (`excel_neu.py`), ist aber nicht in `requirements.txt` eingetragen. Offen: ob es dort ergänzt werden soll.
- Excel-Export, Fehler beim ersten Lauf: Beim Einfügen in `export_etappe1_excel.py` ist ein `return` an das Dateiende gerutscht (`'return' outside function`). Das Skript brach ab, keine Datei entstand. Behoben durch Verschieben der Rückgabe in `_model_overview` und Entfernen des Überrests. Erneut ausgeführt: Exit 0.

**Offene Fragen (ungeklärt, Entscheidung durch das Team)**
1. `RD 12` (175 Linien, `Type = Tension`): Zugstäbe oder Bewehrung/Referenzachsen? Das Skript führt sie aktuell als Stäbe. Bei Ausschluss muss nur ein Filter in `build_stab_liste` angepasst werden.
2. Rhino-Sichtprüfung der Zahl (Filter nach Layern in Rhino, Zählung) ist **noch nicht durchgeführt**.
3. Andere Geometrietypen (Hatch, Text, NurbsCurve …) wurden nicht auf BeamId geprüft. Ihre Layer sind Anno-/Layout-Layer.
4. Querschnitte und Volumen aus der früheren Auswertung (Abschnitt Etappe 2) sind nur für die 561 Beam-Stäbe berechnet und **nicht verifiziert** für 736.

**RD-12-Untersuchung (nur lesend, 22.10.2026)**
- Skript: Temp-Untersuchung, nicht im Projekt gespeichert. Befunde:
  - Alle 175 Linien: `Type = Tension`, Querschnitt Anfang `RD 12`, Ende `-`, Gelenke 0, Rotwinkel 0.
  - Jede Linie hat eine eigene BeamId (Bereich 3 bis 549, 175 eindeutig).
  - Beide Enden liegen auf Knoten anderer Stäbe (175 von 175). Endknoten: 290× Grad 3, 60× Grad 2. Partner: 840 Flachstab-Enden, 150 RD-12-Enden.
  - Geometrie: Länge 1,49 bis 2,51 m (Mittel 2,10 m), Neigung meist 4 bis 6° zur Horizontalen, Höhe 4,1 bis 4,3 m.
  - Objekte normal, sichtbar, Layer `RD 12` sichtbar und nicht gesperrt.
  - Keine Textnotiz im Modell oder in der Aufgabe-Excel, die RD 12 als Bewehrung oder Referenz kennzeichnet. Die Aufgabe-Excel enthält nur Flachstab-Einträge.
- Bewertung: Die Daten sprechen für tragende Zugstäbe bzw. Verbindungselemente. Sie belegen das aber nicht abschließend. Die Frage „Zugstab oder Referenzlinie“ ist **offen**. Die Stabzahl wird nicht allein aufgrund dieser Vermutung geändert.

**Testergebnisse (Stand vor Commit, 22.10.2026)**
- `python -m unittest -v test_stab_liste_etappe1`: 8 von 8 bestanden.
- Excel-Datei `output/excel/etappe1_modell_export.xlsx`: vorhanden (261 975 Bytes), alle 6 Sheets vorhanden, Stabliste 736 Zeilen, Achsen_Rohdaten 736, Brep_Rohdaten 561.
- Abgleich Excel gegen CSV (Felder BeamId, Start, Ende, Länge, Achsindex, Brep-Flag): 736 Zeilen, 0 numerische Abweichungen.
- Abgleich Excel gegen Modell (unabhängig gezählt): 736 eindeutige BeamIds an LineCurves, Excel-Stabanzahl stimmt überein.
- **Offen:** Rhino-Sichtprüfung der Zahl (Filter nach Layern in Rhino) ist **nicht durchgeführt**.

**Git**
- Vor Commit: Branch `pr/1`, Remote `origin` (`https://github.com/AlinaSchuster/struktur-oekologie-gruppe-XX.git`), Tags: keine.
- Geplanter Commit: `Etappe 1: Stabliste erstellt`, enthält die neuen Skripte, Tests, `data/etappe1_staebe_liste.*` und `output/excel/`.
- Geplantes Tag: `etappe-1` auf diesen Commit, Push von Commit und Tag an `origin`.
- Commit-Hash, Tag-Push und Ergebnis der Push-Prüfung: werden nach Ausführung hier nachgetragen (siehe unten).

**Im Detail (ÜBERHOLT: zählt nur die 561 Typ-`Beam`-Stäbe, ohne 175 × RD 12; Werte nicht auf 736 umgerechnet) (Layer / Profil – Anzahl LineCurve = Anzahl Brep):**

| Layer | Anzahl | Profil |
|---|---|---|
| Flat Bar 33.3/20 | 116 | Flachstab 33,3 × 20 mm |
| Flat Bar 275/12 | 70 | Flachstab 275 × 12 mm |
| Flat Bar 275/20 | 41 | Flachstab 275 × 20 mm |
| Flat Bar 162.5/12 | 35 | Flachstab 162,5 × 12 mm |
| Flat Bar 175/12 | 35 | Flachstab 175 × 12 mm |
| Flat Bar 200/12 | 35 | Flachstab 200 × 12 mm |
| Flat Bar 225/12 | 35 | Flachstab 225 × 12 mm |
| Flat Bar 237.5/12 | 35 | Flachstab 237,5 × 12 mm |
| Flat Bar 162.5/20 | 18 | Flachstab 162,5 × 20 mm |
| Flat Bar 200/20 | 18 | Flachstab 200 × 20 mm |
| Flat Bar 237.5/20 | 18 | Flachstab 237,5 × 20 mm |
| Flat Bar 175/20 | 23 | Flachstab 175 × 20 mm |
| Flat Bar 225/20 | 23 | Flachstab 225 × 20 mm |
| RO 139.7x8.0 EN 10210 | 12 | Rundrohr Ø 139,7 × 8 mm |
| Rectangle 500/500 | 47 | Kastenprofil 500 × 500 mm |
| **Summe** | **561** | |

**Längenstatistik der 561 Stäbe:**
- Min: 0,02 m / Max: 3,74 m / Mittel: 0,57 m
- Gesamtlänge aller Stäbe: 319,21 m

**Learning oder Besonderheit:**

- Das Rhino-Modell (Export aus RFEM) enthält **zwei Darstellungen** jedes Stabs: eine 1D-Linie (LineCurve, Mittellinie) und einen 3D-Volumenkörper (Brep). Beide liegen exakt 1:1 im selben Layer.
- Für die reine Stabliste reichen die LineCurves – Länge, Start- und Endpunkt sind direkt auslesbar.
- Die Breps enthalten die vollständige Querschnittsgeometrie (z. B. Flachstab 275×12 mm) als 3D-Körper.
- Rundstäbe (`RD 12`, 175×) sind nur als Linie ohne 3D-Körper vorhanden – vermutlich Bewehrung oder Referenzachsen.
- Bemaßungs- und Layout-Linien (Layer `A-ANNO-NOTE` u. a.) sind ebenfalls als LineCurve abgelegt und müssen beim Zählen der Tragstruktur ignoriert werden.
- Das Auslesen mit `rhino3dm` funktioniert über `File3dm.FromByteArray(data)`; die Layer-Zuordnung steckt in `obj.Attributes.LayerIndex`.

## Etappe 2: Querschnitte verstehen

**Test:** Rechnet einen Stab, dessen Querschnitt sich über die Länge ändert, von Hand nach und vergleicht mit eurem Programm.

**Ergebnis:** **386 von 502 Flat Bar Breps haben VARIABLEN Querschnitt** – die Breite ändert sich linear entlang der Länge (Verjüngung). Das gilt für **alle Flachstab-Querschnitte außer den quadratischen 33.3/20** (20 mm × 20 mm, konstant). Rundrohre und Kastenprofile sind konstant.

**Prüfung der Brep-Kanten (alle 502 Flat Bar Breps):**

| Zustand | Anzahl | Beschreibung |
|---|---|---|
| **Variable Breite** | 386 | 2 Breiten an den Enden, z. B. 123 → 162,5 mm |
| **Konstant** | 116 | Alle 4 Breitenkanten gleich (nur `Flat Bar 33.3/20`) |

**Beispiele für variable Querschnitte aus den Brep-Kanten:**

| Layer (Soll) | Gemessene Breite Ende 1 (mm) | Gemessene Breite Ende 2 (mm) | Dicke (mm) |
|---|---|---|---|
| Flat Bar 162.5/12 | 123,0 | 162,5 | 12 |
| Flat Bar 200/12 | 160,5 | 200,0 | 12 |
| Flat Bar 237.5/12 | 198,0 | 237,5 | 12 |
| Flat Bar 275/12 | 223,0 / 235,5 | 275,0 | 12 |
| Flat Bar 162.5/20 | 123,0 | 162,5 | 20 |
| Flat Bar 175/20 | 135,5 | 175,0 | 20 |
| Flat Bar 225/20 | 185,5 | 225,0 | 20 |

**Berechnungsmethode für variable Querschnitte:**

Der Querschnitt ändert sich linear. Für einen Flachstab mit konstanter Dicke \(t\) und linear veränderlicher Breite \(w(x)\):

\[
w(x) = w_1 + (w_2 - w_1) \cdot \frac{x}{L}
\]

\[
A(x) = w(x) \times t
\]

Volumen über das Integral:

\[
V = \int_0^L A(x)\,dx = t \times \frac{w_1 + w_2}{2} \times L = \frac{A_1 + A_2}{2} \times L
\]

**Vorgehen für die Stabliste:**
1. Aus den 4 mittleren Brep-Kanten die zwei Breiten \(w_1, w_2\) bestimmen
2. Aus dem Layer-Namen oder den kurzen Kanten die Dicke \(t\) bestimmen
3. Querschnittsflächen \(A_1 = w_1 \times t\), \(A_2 = w_2 \times t\)
4. Volumen \(V = (A_1 + A_2)/2 \times L\)  (\(L\) aus LineCurve)
5. Für Rundrohre und Kastenprofile: konstanter Querschnitt (keine Verjüngung)

**Verfügbare Geometriedaten:**

| Datenquelle | Details |
|---|---|
| **Layer-Name** | Kodiert das Profil (z. B. `Flat Bar 162.5/12` → maximale Breite 162,5 mm, Dicke 12 mm) |
| **Brep-3D-Körper** | 6 Faces, 12 Edges, 8 Vertices – kein direktes Volumen/Fläche, aber Kantenlängen über `PointAtStart`/`PointAtEnd` |
| **LineCurve (Stabachse)** | Länge via `GetLength()` oder Abstand Start-/Endpunkt |
| **BrepEdge-Kanten** | 4 kurze = Profildicke, 4 mittlere = Profilbreite (bei Verjüngung 2+2 unterschiedlich), 4 lange = Stabilänge (durch Ausmessen bestätigt) |

**Prüfung der Querschnittsmaße aus den Brep-Kanten (alle 502 Flat Bar Breps):**

| Layer | Dicke (mm) | Breite min → max (mm) | Verjüngung? |
|---|---|---|---|
| Flat Bar 33.3/20 | 20 | 20 (konstant) | Nein (quadratisch) |
| Flat Bar 162.5/12 | 12 | 123 → 162,5 | Ja |
| Flat Bar 162.5/20 | 20 | 123 → 162,5 | Ja |
| Flat Bar 175/12 | 12 | 135,5 → 175 | Ja |
| Flat Bar 175/20 | 20 | 135,5 → 175 | Ja |
| Flat Bar 200/12 | 12 | 160,5 → 200 | Ja |
| Flat Bar 200/20 | 20 | 160,5 → 200 | Ja |
| Flat Bar 225/12 | 12 | 185,5 → 225 | Ja |
| Flat Bar 225/20 | 20 | 185,5 → 225 | Ja |
| Flat Bar 237.5/12 | 12 | 198 → 237,5 | Ja |
| Flat Bar 237.5/20 | 20 | 198 → 237,5 | Ja |
| Flat Bar 275/12 | 12 | 223/235,5 → 275 | Ja |
| Flat Bar 275/20 | 20 | 223/235,5 → 275 | Ja |
| Rectangle 500/500 | – | 498–500 (konstant) | Nein |
| RO 139.7×8.0 | – | Rund (konstant) | Nein |

**Berechnungsmethode für Querschnittsfläche A und Volumen V:**

| Profiltyp | Querschnittsfläche | Volumen |
|---|---|---|
| **Flachstab konstant** | \(A = b \times t\) | \(V = A \times L\) |
| **Flachstab variabel** | \(A_1 = w_1 \times t,\; A_2 = w_2 \times t\) | \(V = (A_1 + A_2)/2 \times L\) |
| **Rundrohr** | \(A = \pi (D^2 - (D-2t)^2)/4\) | \(V = A \times L\) (konstant) |
| **Kastenprofil** | \(A = b \times h\) | \(V = A \times L\) (konstant) |

**Berechnungsergebnis für alle 561 Stäbe:**

| Layer | Stk | Länge (m) | Volumen (m³) |
|---|---|---|---|
| Flat Bar 162.5/12 | 35 | 13,639 | 0,0235 |
| Flat Bar 162.5/20 | 18 | 6,842 | 0,0196 |
| Flat Bar 175/12 | 35 | 29,586 | 0,0533 |
| Flat Bar 175/20 | 23 | 19,284 | 0,0576 |
| Flat Bar 200/12 | 35 | 13,650 | 0,0297 |
| Flat Bar 200/20 | 18 | 7,020 | 0,0254 |
| Flat Bar 225/12 | 35 | 29,586 | 0,0711 |
| Flat Bar 225/20 | 23 | 19,442 | 0,0776 |
| Flat Bar 237.5/12 | 35 | 13,639 | 0,0359 |
| Flat Bar 237.5/20 | 18 | 7,015 | 0,0306 |
| Flat Bar 275/12 | 70 | 42,639 | 0,1293 |
| Flat Bar 275/20 | 41 | 26,454 | 0,1329 |
| Flat Bar 33.3/20 | 116 | 2,320 | 0,0009 |
| RO 139.7×8.0 | 12 | 41,070 | 0,1359 |
| Rectangle 500/500 | 47 | 47,023 | 11,7559 |
| **Summe** | **561** | **319,21** | **12,579** |

**Learning oder Besonderheit:**

- **386 von 502 Flat Bar Breps haben variablen Querschnitt** (Verjüngung in der Breite). Nur die 116 quadratischen `Flat Bar 33.3/20` sind konstant.
- `rhino3dm` bietet **keine direkte `Volume()`- oder `Area()`-Methode** auf Brep – Volumen muss aus Querschnitt × Länge berechnet werden.
- Für Quader-Breps (6 Faces, 12 Edges) lassen sich Dicke, Breite und Länge über die sortierten Kantenlängen (`PointAtStart` → `PointAtEnd`) bestimmen. Bei Verjüngung splitten sich die 4 Breitenkanten in 2+2 unterschiedliche Längen.
- Für variable Querschnitte wird das Volumen über das Integral der linear veränderlichen Querschnittsfläche berechnet: \(V = (A_1 + A_2)/2 \times L\).
- Rundrohre (`RO …`) haben eine andere Topologie (3F, 3E, 2V – Zylinder) und müssen über die Layer-Name-Parameter berechnet werden.
- Kastenprofile (`Rectangle 500/500`) sind konstant.

--> Update der Excel-Tabelle; Excel hat die "Float-Werte" aus der CSV falsch interpretiert; mit Cline korrigiert.


## Etappe 3: Material zuordnen

**Test:** Sind die Materialangaben, die schon im Modell stehen, plausibel? Zeigt an einem Stab, wie ihr das geprüft habt.


**Learning oder Besonderheit:**


## Etappe 4: Embodied Carbon aus der ÖKOBAUDAT

**Test:** Rechnet einen Stab von seiner Länge bis zu kg CO₂e (A1–A3) von Hand nach.


**Learning oder Besonderheit:**


## Etappe 5: Web-App

**Test:** Schaltet beim Stahl auf die Alternative um. Was erwartet ihr vorher, was passiert, und warum?


**Learning oder Besonderheit:**


## Zum Schluss

Wie habt ihr mit dem Agenten gearbeitet, und was würdet ihr der nächsten Gruppe mitgeben?