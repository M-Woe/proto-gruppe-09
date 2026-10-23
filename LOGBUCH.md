# Logbuch

Pro Etappe ein Eintrag. Kurz reicht. Das Logbuch ist Teil der Abgabe und Grundlage eurer Demo.
One entry per stage. Short is fine. The log is part of the submission and the basis for your demo.

## Etappe 0

- **Was wir gemacht haben:**
- **Wichtigste Prompts** (wörtlich kopieren):
  > (Dieser Prompt wurde zu Etappe 1 verschoben)
- **Was schiefging und woran wir es gemerkt haben:**
- **Was wir selbst geprüft haben** (von Hand, im Plan, im Modell):

---

# Sprint 1: Carbon-Inventur Pavillon Stockerau

## Etappe 1: Modell lesen

**Test:** Wie viele Stäbe hat der Pavillon? Prüft die Zahl am Modell nach.

**Wichtigste Prompts:**
> Bitte untersuche zuerst mein Repository und prüfe, ob die Datei vorhanden ist. Unsere Aufgabe ist es, eine vollständige Liste aller Stäbe des Pavillons zu erstellen. Das Rhino-Modell enthält Stäbe in zwei unterschiedlichen Darstellungen, deshalb müssen wir genau untersuchen, welche Objekte zu den tatsächlichen Stäben gehören und ob es doppelte Darstellungen gibt. Gehe bitte schrittweise vor: Prüfe, welche Dateien und Ordner vorhanden sind. Erkläre mir, wie wir die Rhino-Datei mit Python und rhino3dm auslesen können. Untersuche, welche Objekttypen, Layer und Attribute im Modell vorhanden sind. Erstelle ein Skript, das die erkannten Stäbe mit einer eindeutigen ID, ihrer Geometrie, Länge und vorhandenen Objektinformationen in eine CSV- oder JSON-Datei schreibt. Zeige mir die ermittelte Anzahl der Stäbe und erkläre, wie ich diese Zahl in Rhino überprüfen kann. Bitte ändere nicht unnötig bestehende Dateien. Lösche keine Objekte, nur weil sie ähnlich aussehen. Erfinde keine fehlenden Informationen. Erkläre mir die einzelnen Schritte und warte bei wichtigen Entscheidungen auf meine Rückmeldung.

**Ergebnis:** Der Pavillon hat **736 Stäbe** (561 + 175 RD 12 Rundstäbe). Davon haben 561 eine 1:1-Doppelrepräsentation aus LineCurve + Brep. Die 175 RD 12-Rundstäbe (Ø12 mm) sind nur als LineCurve vorhanden.

**Im Detail (Layer / Profil – Anzahl):**

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
| RD 12 | 175 | Rundstab Ø 12 mm |
| **Summe** | **736** | |

**Längenstatistik der 736 Stäbe:**
- Min: 0,02 m / Max: 3,74 m / Mittel: 0,93 m
- Gesamtlänge aller Stäbe: 686,38 m (davon RD 12: 367,17 m)

**Learning oder Besonderheit:**

- Das Rhino-Modell (Export aus RFEM) enthält **zwei Darstellungen** jedes Stabs: eine 1D-Linie (LineCurve, Mittellinie) und einen 3D-Volumenkörper (Brep). Beide liegen exakt 1:1 im selben Layer.
- Für die reine Stabliste reichen die LineCurves – Länge, Start- und Endpunkt sind direkt auslesbar.
- Die Breps enthalten die vollständige Querschnittsgeometrie (z. B. Flachstab 275×12 mm) als 3D-Körper.
- Rundstäbe (`RD 12`, 175×) sind nur als Linie ohne 3D-Körper vorhanden – vermutlich Zugstäbe oder Aussteifungen der Tragstruktur. Querschnitt: Ø12 mm (A = 113 mm²). Nach Vorgabe als Baustahl S355JR klassifiziert.
- Bemaßungs- und Layout-Linien (Layer `A-ANNO-NOTE` u. a.) sind ebenfalls als LineCurve abgelegt und müssen beim Zählen der Tragstruktur ignoriert werden.
- Das Auslesen mit `rhino3dm` funktioniert über `File3dm.FromByteArray(data)`; die Layer-Zuordnung steckt in `obj.Attributes.LayerIndex`.

## Etappe 2: Querschnitte verstehen

**Test:** Rechnet einen Stab, dessen Querschnitt sich über die Länge ändert, von Hand nach und vergleicht mit eurem Programm.

**Wichtigste Prompts:**
> Wir beginnen mit Etappe 2: Querschnitte verstehen. Untersuche die Stabliste und die Rhino-Geometrien aus Etappe 1. Bestimme für jeden Stab die Querschnittsfläche in m² und das Volumen in m³. Unterscheide zwischen konstanten und veränderlichen Querschnitten. Nutze vorhandene 3D-Körper, Profilinformationen und Geometrien, soweit verfügbar. Falls Informationen fehlen, kennzeichne das ausdrücklich, statt Werte zu schätzen.

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

**Wichtigste Prompts:**
> Wir bearbeiten jetzt Etappe 3 "Material zuordnen". Untersuche die vorhandenen Projektdaten und die Ergebnisse aus Etappe 1 und 2. Lies alle vorhandenen Materialinformationen aus dem Modell aus. Ordne jedem Stab ein Material zu. Verwende folgende Entscheidungsleiter: Regeln > Sprachmodell > Teamentscheidung. Dokumentiere für jeden Stab die Stab-ID, das vorhandene Material, das zugeordnete Material, die verwendete Entscheidungsstufe und die Begründung.

**Verfügbare Materialinformationen im Modell:**
- **Materialtabelle:** 15 Materialien definiert (B+G steel, B+G steel-00..03, B+G concrete-00..02, B+G timber-00..02, B+G glass, B+G default)
- **MaterialIndex:** **-1 (keine Zuordnung) für alle 2986 Objekte** – die Materialien sind zwar in der Datei, aber keinem einzigen Stab zugewiesen
- **UserStrings:** Keine materialbezogenen Metadaten

**⇒ Keine direkte Materialangabe im Modell vorhanden.** Die Zuordnung erfolgte daher regelbasiert durch Team-Vorgabe.

**Entscheidungsleiter:**

| Stufe | Angewandt auf | Begründung |
|---|---|---|
| **1. Regel** (Team-Vorgabe) | Alle 561 Stäbe | Klare Profil-Typologie: Flachstahl → Baustahl, Rundrohr → Baustahl, Rechteck 500×500 → Beton |
| **2. Sprachmodell** | – | Nicht nötig, da Team-Vorgabe alle Fälle abdeckt |
| **3. Team** | – | Grundsatzentscheidung zu Beginn getroffen |

**Materialzuordnung:**

| Material | Stäbe | Volumen (m³) | Anteil am Gesamtvolumen |
|---|---|---|---|
| **Baustahl S355JR** | 514 | 0,823 | 6,5 % |
| **Beton C25/30** | 47 | 11,756 | 93,5 % |

**Detail pro Layer:**

| Layer | Stk | Material | Volumen (m³) |
|---|---|---|---|
| Flat Bar 33.3/20 | 116 | Baustahl S355JR | 0,0009 |
| Flat Bar 162.5/12 | 35 | Baustahl S355JR | 0,0235 |
| Flat Bar 162.5/20 | 18 | Baustahl S355JR | 0,0196 |
| Flat Bar 175/12 | 35 | Baustahl S355JR | 0,0533 |
| Flat Bar 175/20 | 23 | Baustahl S355JR | 0,0576 |
| Flat Bar 200/12 | 35 | Baustahl S355JR | 0,0297 |
| Flat Bar 200/20 | 18 | Baustahl S355JR | 0,0254 |
| Flat Bar 225/12 | 35 | Baustahl S355JR | 0,0711 |
| Flat Bar 225/20 | 23 | Baustahl S355JR | 0,0776 |
| Flat Bar 237.5/12 | 35 | Baustahl S355JR | 0,0359 |
| Flat Bar 237.5/20 | 18 | Baustahl S355JR | 0,0306 |
| Flat Bar 275/12 | 70 | Baustahl S355JR | 0,1293 |
| Flat Bar 275/20 | 41 | Baustahl S355JR | 0,1329 |
| RO 139.7×8.0 | 12 | Baustahl S355JR | 0,1359 |
| Rectangle 500/500 | 47 | Beton C25/30 | 11,7559 |

**Plausibilitätsprüfung (Test an 2 Stäben):**

**Stab 1: Flat Bar 275/12 (Baustahl)**
| Prüfpunkt | Wert | Erwartung |
|---|---|---|
| Länge | 0,8452 m | – |
| Volumen | 0,002543 m³ | – |
| Querschnittsfläche (aus V/L) | 3008,53 mm² | ≈ 3000 mm² für 275×12 ✓ |
| Dichte | ~7850 kg/m³ (Stahl) | Plausibel |
| **Fazit:** Profilgeometrie und Volumen passen zu einem Stahl-Flachstab 275×12 mm.

**Stab 2: Rectangle 500/500 (Beton C25/30)**
| Prüfpunkt | Wert | Erwartung |
|---|---|---|
| Länge | 1,0005 m | – |
| Volumen | 0,250120 m³ | – |
| Querschnittsfläche (aus V/L) | 0,2500 m² | 0,25 m² (500×500 mm) ✓ |
| **Fazit:** Die Geometrie passt exakt zu einem quadratischen Fundamentkörper 500×500 mm. Beton C25/30 ist die Standardfestigkeitsklasse für Fundamente.

**Learning oder Besonderheit:**

- Das Rhino-Modell enthält zwar 15 Materialdefinitionen (aus RFEM-Export), aber **kein einziges Objekt hat einen MaterialIndex ≥ 0**. Die Materialinformation aus RFEM wurde beim Export in das .3dm-Format nicht mitübertragen.
- Die Zuordnung konnte daher nur **regelbasiert über die Profiltypen** erfolgen – nicht über Modellattribute.
- 93,5 % des Gesamtvolumens entfallen auf die 47 Betonfundamente (Rectangle 500/500), nur 6,5 % auf die 514 Stahlstäbe. Das ist für ein Fundament typisch.
- Die Material-Standards wurden nach üblichen Normen ergänzt: S355JR (DIN EN 10025-2) für Flachstahl, EN 10210-2 für Rundrohre, C25/30 (DIN EN 206) für Beton.


## Etappe 4: Embodied Carbon aus der ÖKOBAUDAT

**Test:** Rechnet einen Stab von seiner Länge bis zu kg CO₂e (A1–A3) von Hand nach.

**Wichtigste Prompts:**
> Wir bearbeiten Etappe 4 "Embodied Carbon aus der ÖKOBAUDAT". Rufe die vorgegebenen Datensätze live über die öffentliche API ab. Lies den Indikator GWP-total aus und untersuche die tatsächliche JSON-Struktur. Ermittle für jeden Datensatz die Bezugseinheit und die vorhandenen Werte der Lebenszyklusmodule A1–A3, C und D. Berechne die kg CO₂e für jeden Stab anhand seiner Materialzuordnung und seiner Materialmenge. Dokumentiere verwendete Dichten oder andere Umrechnungsfaktoren und begründe sie.

**API-Anbindung ÖKOBAUDAT:**

Fünf Datensätze live über die öffentliche API abgerufen:
```
https://oekobaudat.de/OEKOBAU.DAT/resource/processes/<UUID>?format=json&view=extended
```

| Datensatz | UUID | Bezugseinheit | Dichte |
|---|---|---|---|
| **Baustahl Profile und Stabstahl** | `20c29cbd-…` | kg | 7.850 kg/m³ |
| Baustahl Grobblech (Alternative) | `04d1311a-…` | kg | 7.850 kg/m³ |
| **Beton C25/30** | `8347f9a7-…` | m³ | 2.400 kg/m³ |
| Beton C25/30 EcoPact (Alternative) | `69dc12cf-…` | m³ | 2.259 kg/m³ |
| **Betonstahl in Stäben** | `a8ebf8f2-…` | kg | 7.850 kg/m³ |

**Gefundene GWP-total-Werte (kg CO₂e pro Einheit):**

| Modul | Baustahl S355JR (/kg) | Beton C25/30 (/m³) | Betonstahl (/kg) |
|---|---|---|---|
| A1–A3 | 0,5603 | 181,0 | 0,593 |
| C1 | 0,00219 | 3,32 | 0 |
| C2 | 0,00251 | 10,3 | 0,0071 |
| C3 | 0 | 5,05 | 0,00015 |
| C4 | 0,00015 | 0 | 0,00029 |
| D (S3) | 0,2096 | −12,1 | 0,0598 |

**Berechnungsmethode:**
- **Stahl:** Masse = Volumen × 7.850 kg/m³ → CO₂ = Masse × Faktor
- **Beton:** CO₂ = Volumen (m³) × Faktor (direkt)
- **Bewehrung:** 85 kg Betonstahl/m³ Beton → CO₂ = Bewehrungsmasse × Faktor Betonstahl
- Module A1–A3, C, D werden **getrennt** ausgewiesen

**CO₂e-Bilanz für den gesamten Pavillon:**

| Material | Stk | Vol./Masse | A1–A3 | C | D |
|---|---|---|---|---|---|
| **Baustahl S355JR** (inkl. RD 12) | 689 | 7.531 kg | 3.804 kg CO₂e | 36 kg | 1.578 kg |
| **Beton C25/30** | 47 | 11,8 m³ | 2.128 kg CO₂e | 219 kg | −142 kg |
| **+ Bewehrung** | (47) | 1.000 kg | 593 kg CO₂e | — | — |
| **∑ Gesamt** | **736** | — | **6.525 kg CO₂e (6,53 t)** | **255 kg** | **1.436 kg** |

**Test: Handrechnung (Flat Bar 275/12, UUID b8cc1b87-...)**

| Schritt | Rechnung | Ergebnis |
|---|---|---|
| Volumen | 0,002543 m³ | — |
| Masse | 0,002543 m³ × 7.850 kg/m³ | **19,96 kg** |
| GWP A1–A3 | 19,96 kg × 0,5603 kg CO₂e/kg | **11,18 kg CO₂e** |
| GWP C | 19,96 kg × 0,00485 kg CO₂e/kg | **0,097 kg CO₂e** |
| GWP D | 19,96 kg × 0,2096 kg CO₂e/kg | **4,18 kg CO₂e** |

✅ Handrechnung und Programmrechnung stimmen überein.

**Export-Dateien:**
- `data/staebe_mit_co2.csv` – 561 Stäbe mit CO₂e-Werten
- `data/staebe_mit_co2.json` – gleicher Inhalt als JSON
- Excel-Sheet `staebe_mit_co2` – in der Excel-Tabelle

**Learning oder Besonderheit:**

- Die ÖKOBAUDAT-API liefert die JSON-Daten im ILCD-Format. Schlüsselpfad zu GWP-total: `LCIAResults.LCIAResult[]` → `referenceToLCIAMethodDataSet.shortDescription` → Wert in `other.anies[]` nach Modulen.
- Baustahl (Profile und Stabstahl) hat einen Konversionsfaktor von 0,001: die GWP-Rohwerte gelten für 1.000 kg, Umrechnung auf 1 kg erforderlich.
- Die Dichte von Stahl (7.850 kg/m³) ist im API-Datensatz als `materialProperties` hinterlegt und wurde daraus übernommen.
- Für Beton C25/30 liegt die Bezugseinheit in m³ vor – die Dichte (2.400 kg/m³) dient nur als Referenz, die Berechnung erfolgt direkt über das Volumen.
- Die Bewehrung (85 kg/m³) ist eine statische Annahme für diese Planungsphase.
- GWP-total D ist bei Stahl positiv (Recycling-Aufwand), bei Beton negativ (Gutschrift für Recycling).


## Etappe 5: Web-App

**Test:** Schaltet beim Stahl auf die Alternative um. Was erwartet ihr vorher, was passiert, und warum?

**Wichtigste Prompts:**
> Wir bearbeiten Etappe 5 "Web-App". Baue eine lokal ausführbare Web-App auf Basis unserer bisherigen Ergebnisse aus Etappe 1–4. Anforderungen: Interaktives 3D-Modell des Pavillons mit Farbcodierung nach CO₂e, Umschaltung zwischen Standard- und Alternativdatensatz sowie zwischen A1–A3, C und D, Rangliste der Top 10 Stäbe, Klick-Interaktion für Stabdetails.

**Umsetzung:** Lokale Web-App mit FastAPI + Plotly.js

| Komponente | Technologie | Zweck |
|---|---|---|
| **Backend** | FastAPI (Python) | REST-API für Stabdaten, CO₂-Werte, Alternativdatensätze |
| **3D-Visualisierung** | Plotly.js (JavaScript) | Drehbare 3D-Ansicht aller 561 Stäbe als farbcodierte Linien |
| **Frontend** | HTML + CSS | Steuerung, Rangliste, Infopanel, Farbskala |

**Funktionen:**
- **3D-Modell:** Jeder Stab als Linie zwischen seinen Start-/Endpunkten aus den Modelldaten
- **Farbcodierung:** Grün (niedrig) → Gelb → Rot (hoch) je nach CO₂e im gewählten Modul
- **Modul-Umschaltung:** A1–A3 / C / D – Farben und Werte aktualisieren sich live
- **Datensatz-Umschaltung:** Standard ↔ Alternative (Grobblech für Stahl, EcoPact für Beton)
- **Rangliste:** Top 10 der Stäbe mit höchsten CO₂e, aktualisiert sich bei jeder Änderung
- **Stab-Info:** Beim Klick auf einen Stab werden Details eingeblendet
- **Zusammenfassung:** CO₂e summiert nach Materialgruppe + Gesamtsumme

**Test: Umschalten von Standardstahl auf Alternative**

| Schritt | Erwartung | Beobachtung | Erklärung |
|---|---|---|---|
| **Vor dem Umschalten** | Stahl A1–A3 = 0,560 kg CO₂e/kg | Stäbe grün-gelb (niedrige Werte) | Standard-Baustahl hat relativ geringen CO₂-Fussabdruck durch 100% Recycling |
| **Alternative Stahl** (Grobblech) | A1–A3 steigt auf 2,529 kg CO₂e/kg | **Stahlstäbe werden deutlich röter**, Werte steigen um Faktor ~4,5 | Grobblech hat höheren CO₂-Wert (2,529 vs 0,560 kg CO₂e/kg) |
| **Alternative Beton** (EcoPact) | A1–A3 sinkt auf 0,044 kg CO₂e/m³ | **Betonfundamente werden grüner**, Werte sinken drastisch | EcoPact ist ein rezeptoptimierter CO₂-reduzierter Beton |
| **Nur betroffene Gruppe ändert sich** | Stahl bleibt bei Alt.Stahl, Beton bleibt Standard | ✅ Bestätigt: Nur die jeweils aktive Materialgruppe wechselt | Alternativdatensätze sind materialgruppenspezifisch zugeordnet |

**Start der App:**

```bash
cd C:\Users\madel\Documents\GitHub\struktur-oekologie-gruppe-XX
.venv\Scripts\uvicorn webapp.main:app --port 8000
# Im Browser: http://localhost:8000
```

**Dateistruktur:**
```
webapp/
  main.py              # FastAPI-Backend (API-Endpunkte)
  __init__.py          # (leer)
  templates/
    index.html          # Plotly.js Frontend (3D + Steuerung)
```

**Learning oder Besonderheit:**

- Plotly.js kann 561 Linien in 3D darstellen – die Performance ist auf einem Präsentationslaptop akzeptabel, solange `scatter3d` mit `mode='lines'` verwendet wird.
- Die Alternative "Baustahl Grobblech" hat einen **4,5× höheren** GWP-Wert (2,53 vs 0,56 kg CO₂e/kg). Dies liegt daran, dass der Standard-Baustahl zu 100% aus Schrott recycelt wird, während Grobblech Primärmaterial enthält.
- Die Alternative "Beton EcoPact" hat einen **wesentlich niedrigeren** GWP-Wert (0,044 vs 181 kg CO₂e/m³). EcoPact ist ein speziell CO₂-optimiertes Betonrezept mit reduziertem Zementanteil.
- Die Farbcodierung muss sich bei jeder Änderung dynamisch anpassen, da sich die Wertebereiche zwischen A1–A3, C und D stark unterscheiden.
- Fehlende Werte (z. B. Modul D bei Beton im Alternativmodus) werden als `k. A.` gekennzeichnet und nicht stillschweigend auf null gesetzt.


## Zum Schluss

Wie habt ihr mit dem Agenten gearbeitet, und was würdet ihr der nächsten Gruppe mitgeben?