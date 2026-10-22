"""
Etappe 3: Materialzuordnung je Stab nach der Entscheidungsleiter des Kurses.

Stufen (je Stab wird die erste zutreffende Stufe verwendet):
  1. Regel        - eindeutige Modellangabe mit plausiblem Profil
  2. Sprachmodell - in dieser Umgebung nicht angebunden, daher nicht ausgeführt
  3. Manuell      - "Manuelle Prüfung erforderlich", kein Material erfunden

Grundlage: stab_liste_etappe1.build_stab_liste() (736 Stäbe, RFEM-BeamId),
Materialangabe aus den Benutzerdaten (Schlüssel BG_Dlubal-Name (Material)).
"""
from collections import Counter
from pathlib import Path

from stab_liste_etappe1 import build_stab_liste, read_objects

ROOT = Path(__file__).resolve().parent
OUT_XLSX = ROOT / "output" / "excel" / "etappe3_materialzuordnung.xlsx"
KEY_MAT = "BG_Dlubal-Name (Material)_bg0211"

STAHL = "Stahl S355"
MANUELL = "Manuelle Prüfung erforderlich"


def modell_material(raw: str):
    """Modellangabe -> Materialklasse oder None."""
    s = (raw or "").strip().lower()
    if s.startswith("steel") or s.startswith("stahl"):
        return "Stahl"
    if s.startswith("concrete") or s.startswith("beton"):
        return "Beton"
    return None


def stufe1_regel(layer: str, modell_raw: str):
    """Stufe 1. Liefert (material, regel, begründung, unsicherheit) oder None.

    R1: Modellangabe 'Steel S 355' bei Rohrprofil RO (EN 10210-2) -> Stahl S355.
        Begründung: Angabe im Modell und Profil passen zusammen.
    Keine weitere Regel: Die Modellangabe 'Concrete C25/30' bei Flachstab
    162.5/20 (20 mm dick) widerspricht der Profilregel (Stahlbeton braucht
    >= 150 mm), deshalb keine Zuordnung und Stufe 3.
    """
    klasse = modell_material(modell_raw)
    if klasse == "Stahl" and layer.startswith("RO "):
        return (STAHL, "R1: Modellangabe 'Steel S 355' + Rohrprofil EN 10210-2",
                "Modellangabe und Profil widerspruchsfrei", "gering")
    return None


def stufe2_sprachmodell(layer: str, modell_raw: str):
    """Stufe 2. Ein Sprachmodell ist konfiguriert (Schlüssel gesetzt), aber LLM_MODEL
    ist leer. Ohne Modellwahl gibt es keinen Aufruf -> keine Zuordnung auf dieser Stufe.
    Bewusst kein Modellname ergänzt (Auswahl ist eine Entscheidung des Teams)."""
    return None


def stufe3_manuell(layer: str, modell_raw: str):
    """Stufe 3: kein Material erfinden. Begründung enthält den Quellenbefund."""
    if layer.startswith("Flat Bar 162.5/20") and modell_raw.strip():
        grund = ("Modellangabe 'Concrete C25/30' bei 20 mm Dicke widerspricht der Profilregel. "
                 "Pläne nennen Betonbauweise allgemein, nicht für diesen Stab. Prüfung offen.")
    elif layer.startswith("Flat Bar "):
        grund = ("Keine Materialangabe im Modell. Pläne enthalten keinen Hinweis für diesen Stab. "
                 "Stahl wäre eine Annahme aus Profil und Lage, nicht belegt.")
    elif layer == "Rectangle 500/500":
        grund = ("Keine Materialangabe im Modell. Pläne nennen 'Stahlbeton' und 'WU Beton' als Bauweise, "
                 "die Güte C25/30 ist für diese Blöcke nicht belegt.")
    elif layer == "RD 12":
        grund = ("Keine Materialangabe, kein Durchmesser in der RFEM-Quelle (nur Name 'RD 12'). "
                 "Querschnitt und Material nicht belegt.")
    else:
        grund = "Keine eindeutige Zuordnung aus Modell und Plänen."
    return (MANUELL, "Stufe 3: keine eindeutige Regel, Sprachmodell ohne Modellwahl nicht ausgeführt",
            grund, "hoch")


def zuordnen(layer: str, modell_raw: str):
    """Liefert (material, stufe, regel, begründung, unsicherheit)."""
    r = stufe1_regel(layer, modell_raw)
    if r:
        return (r[0], "Regel") + r[1:]
    r = stufe2_sprachmodell(layer, modell_raw)
    if r:
        return (r[0], "Sprachmodell") + r[1:]
    r = stufe3_manuell(layer, modell_raw)
    return (r[0], "Manuell") + r[1:]


def berechne_alle():
    stabe = build_stab_liste()
    index = read_objects()
    zeilen = []
    for s in stabe:
        d = index[s["rfem_beam_id"]]
        raw = dict(d["axes"][0]["userdata"]).get(KEY_MAT, "")
        mat, stufe, regel, begr, unsicher = zuordnen(s["layer"], raw)
        zeilen.append({
            "stab_id": s["stab_id"], "rfem_beam_id": s["rfem_beam_id"],
            "rfem_typ": s["rfem_typ"], "layer": s["layer"],
            "laenge_m": s["laenge_m"], "modell_material": raw.strip(),
            "material": mat, "stufe": stufe, "regel": regel,
            "begruendung": begr, "unsicherheit": unsicher,
        })
    return zeilen


def schreibe_excel(zeilen: list, datei: Path = OUT_XLSX) -> None:
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    datei.parent.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    kopf_fill = PatternFill("solid", fgColor="305496")
    kopf_font = Font(bold=True, color="FFFFFF")
    manuell_fill = PatternFill("solid", fgColor="FCE4D6")

    def blatt(name, headers, rows):
        ws = wb.create_sheet(name)
        ws.append(headers)
        for c in ws[1]:
            c.fill = kopf_fill
            c.font = kopf_font
            c.alignment = Alignment(wrap_text=True, vertical="center")
        for r in rows:
            ws.append(r)
        for ci, h in enumerate(headers, 1):
            vals = [len(str(r[ci - 1])) for r in rows[:300] if r[ci - 1] is not None]
            width = max([len(str(h))] + vals)
            ws.column_dimensions[get_column_letter(ci)].width = min(max(10, width + 2), 60)
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        return ws

    head = ["Stab-ID", "RFEM-BeamId", "Typ", "Layer", "Länge L [m]",
            "Modellangabe Material", "Material (Zuordnung)", "Stufe", "Regel",
            "Begründung", "Unsicherheit"]
    rows = [[z["stab_id"], z["rfem_beam_id"], z["rfem_typ"], z["layer"], z["laenge_m"],
             z["modell_material"], z["material"], z["stufe"], z["regel"],
             z["begruendung"], z["unsicherheit"]] for z in zeilen]
    ws = blatt("Materialzuordnung", head, rows)
    for row in ws.iter_rows(min_row=2):
        if row[7].value == "Manuell":
            for c in row:
                c.fill = manuell_fill
    ws.column_dimensions["E"].number_format = "0.0000"

    agg = Counter((z["layer"], z["stufe"]) for z in zeilen)
    ov = [[layer, stufe, n] for (layer, stufe), n in sorted(agg.items())]
    blatt("Übersicht je Layer", ["Layer", "Stufe", "Anzahl"], ov)

    st = Counter(z["stufe"] for z in zeilen)
    mat = Counter(z["material"] for z in zeilen)
    zus = [["Stäbe gesamt", len(zeilen)],
           ["Stufe 1 Regel", st["Regel"]],
           ["Stufe 2 Sprachmodell (nicht verfügbar, nicht ausgeführt)", st["Sprachmodell"]],
           ["Stufe 3 Manuelle Prüfung", st["Manuell"]],
           ["Zugeordnetes Material 'Stahl S355'", mat[STAHL]],
           ["Manuelle Prüfung erforderlich", mat[MANUELL]],
           ["Quellen", "Etappe 1 (Stabliste), Materialangabe aus RFEM-Benutzerdaten"]]
    ws = blatt("Zusammenfassung", ["Kennzahl", "Wert"], zus)
    ws.column_dimensions["A"].width = 58
    ws.column_dimensions["B"].width = 60
    wb.save(datei)


if __name__ == "__main__":
    zeilen = berechne_alle()
    schreibe_excel(zeilen)
    print(f"Stäbe: {len(zeilen)}")
    print("Stufen:", dict(Counter(z["stufe"] for z in zeilen)))
    print("Materialien:", dict(Counter(z["material"] for z in zeilen)))
    print(f"Excel: {OUT_XLSX}")
