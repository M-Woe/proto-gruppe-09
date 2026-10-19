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

**Ergebnis:** Der Pavillon hat **561 Stäbe** (Stabachsen als LineCurve) mit jeweils einer korrespondierenden 3D-Darstellung als Brep (Volumenkörper) – insgesamt also 561 Stäbe in 1:1-Doppelrepräsentation.

**Im Detail (Layer / Profil – Anzahl LineCurve = Anzahl Brep):**

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