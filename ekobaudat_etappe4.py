"""
Etappe 4: Embodied Carbon (GWP-total) je Stab aus der ÖKOBAUDAT.

Eingaben:
- Volumen V [m³] und Länge aus output/excel/etappe2_querschnitt_volumen.xlsx (Blatt Detail)
- Material aus output/excel/etappe3_materialzuordnung.xlsx (Blatt Materialzuordnung)
- Live-Abruf der ÖKOBAUDAT-Datensätze (OEKOBAU.DAT, view=extended), GWP-total

Einheiten (aus dem Datensatz, Feld referenceToReferenceFlow / resultingflowAmount):
- Baustahl (Profile/Stabstahl, Grobblech): Referenzmenge 1000 kg -> Wert je kg = Wert / 1000
- Beton C25/30 (Standard, EcoPact): Referenzmenge 1 m³ -> Wert je m³
- Betonstahl in Stäben: Referenzmenge 1 kg -> Wert je kg (A1–A3 = A1 + A2 + A3)

Masse:
- Stahl: m = V * rho, rho = 7850 kg/m³ (Standardwert für Baustahl; Annahme, siehe Logbuch)
- Beton: m = V * 2500 kg/m³ (nur zur Information; GWP wird je m³ gerechnet)
- Betonstahl: 85 kg je m³ Beton (vom Team vorgegeben)

Module: A1, A2, A3 (A1–A3), A4, A5, B1, C1–C4, D (sofern im Datensatz vorhanden)
"""
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent
EX2 = ROOT / "output" / "excel" / "etappe2_querschnitt_volumen.xlsx"
EX3 = ROOT / "output" / "excel" / "etappe3_materialzuordnung.xlsx"
OUT_XLSX = ROOT / "output" / "excel" / "etappe4_co2e.xlsx"
OEKO_JSON = Path(r"C:\Users\user\AppData\Local\Temp\cline\oeko_final.json")

RHO_STAHL = 7850.0      # kg/m³ (Annahme, Baustahl)
RHO_BETON = 2500.0      # kg/m³ (Annahme, nur Information)
BETONSTAHL_KG_M3 = 85.0  # kg/m³ (Vorgabe Team)

# Module, die in den Datensätzen vorkommen und für A1–A3 gebraucht werden
MODULE_STAHL = ["A1-A3", "C1", "C2", "C3", "C4", "D"]


def lade_oeko():
    return json.loads(OEKO_JSON.read_text(encoding="utf-8"))


SZENARIO = "S3"  # Standardszenario laut Datensatz (default: true), European average


def stahl_faktor_je_kg(oeko):
    """Stahl: Referenzmenge 1000 kg -> Wert je kg. Module mit Szenario S3 (Standard)."""
    ref = oeko["steel_std"]["referenzmenge"]
    assert ref == 1000.0, f"Unerwartete Referenzmenge Stahl: {ref}"
    g = oeko["steel_std"]["gwp_total"]
    faktoren = {"A1-A3": float(g["A1-A3"]) / 1000.0,
                "C1": float(g["C1"]) / 1000.0,
                "C2": float(g["C2"]) / 1000.0,
                "C3": float(g[f"C3 [{SZENARIO}]"]) / 1000.0,
                "C4": float(g[f"C4 [{SZENARIO}]"]) / 1000.0,
                "D": float(g[f"D [{SZENARIO}]"]) / 1000.0}
    return faktoren


def beton_faktor_je_m3(oeko):
    ref = oeko["concrete_std"]["referenzmenge"]
    assert ref == 1.0, f"Unerwartete Referenzmenge Beton: {ref}"
    return {m: float(v) for m, v in oeko["concrete_std"]["gwp_total"].items() if v is not None}


def betonstahl_faktor_je_kg(oeko):
    ref = oeko["rebar_std"]["referenzmenge"]
    assert ref == 1.0, f"Unerwartete Referenzmenge Betonstahl: {ref}"
    g = oeko["rebar_std"]["gwp_total"]
    a13 = sum(float(g[k]) for k in ["A1 [Standard Szenario]", "A2 [Standard Szenario]", "A3 [Standard Szenario]"])
    return {"A1-A3": a13}


def lade_zeilen():
    """Volumen (Etappe 2) und Material (Etappe 3) je Stab zusammenführen."""
    wb2 = openpyxl.load_workbook(EX2, data_only=True)
    ws2 = wb2["Detail"]
    h2 = [c.value for c in ws2[1]]
    i = {k: h2.index(k) for k in ["Stab-ID", "Typ", "Layer", "Länge L [m]", "Volumen V [m³]", "Prüfstatus"]}
    vol = {}
    for r in ws2.iter_rows(min_row=2, values_only=True):
        vol[r[i["Stab-ID"]]] = {"layer": r[i["Layer"]], "laenge": r[i["Länge L [m]"]],
                                "volumen": r[i["Volumen V [m³]"]], "status_e2": r[i["Prüfstatus"]]}
    wb3 = openpyxl.load_workbook(EX3, data_only=True)
    ws3 = wb3["Materialzuordnung"]
    h3 = [c.value for c in ws3[1]]
    j = {k: h3.index(k) for k in ["Stab-ID", "Material (Zuordnung)", "Stufe", "Layer"]}
    zeilen = []
    for r in ws3.iter_rows(min_row=2, values_only=True):
        sid = r[j["Stab-ID"]]
        v = vol.get(sid, {})
        zeilen.append({"stab_id": sid, "layer": r[j["Layer"]], "material": r[j["Material (Zuordnung)"]],
                       "stufe": r[j["Stufe"]], "laenge": v.get("laenge"), "volumen": v.get("volumen"),
                       "status_e2": v.get("status_e2")})
    return zeilen


def berechne(zeilen, oeko):
    """kg CO2e je Stab und Modul. Nicht berechenbar -> Status, kein Schätzwert."""
    st = stahl_faktor_je_kg(oeko)
    bt = beton_faktor_je_m3(oeko)
    bs = betonstahl_faktor_je_kg(oeko)
    out = []
    for z in zeilen:
        zz = dict(z)
        zz.update({"masse_stahl_kg": None, "masse_beton_m3": None, "masse_betonstahl_kg": None,
                   "modul_werte": {}, "status_co2": "", "hinweis_co2": ""})
        if z["material"] in ("Stahl S355",) and z["volumen"] is not None:
            m = z["volumen"] * RHO_STAHL
            zz["masse_stahl_kg"] = m
            zz["modul_werte"] = {mod: m * f for mod, f in st.items()}
            zz["status_co2"] = "berechnet"
            zz["hinweis_co2"] = "Masse = V × 7850 kg/m³ (Annahme). GWP je kg aus Baustahl-Datensatz (1000 kg → /1000)."
        elif z["material"] == "Stahlbeton C25/30" and z["volumen"] is not None:
            vb = z["volumen"]
            mbs = vb * BETONSTAHL_KG_M3
            zz["masse_beton_m3"] = vb
            zz["masse_betonstahl_kg"] = mbs
            beton = {mod: vb * f for mod, f in bt.items()}
            stahl = {mod: mbs * f for mod, f in bs.items()}
            zz["modul_werte"] = {"Beton": beton, "Betonstahl": stahl}
            zz["status_co2"] = "berechnet"
            zz["hinweis_co2"] = ("Beton je m³ (Datensatz C25/30, Referenz 1 m³). Betonstahl 85 kg/m³ (Vorgabe). "
                                 "Modul-Summe ohne Betonstahl-Modul D im A1-A3-Ergebnis.")
        else:
            zz["status_co2"] = "nicht berechnet"
            zz["hinweis_co2"] = {
                "Manuelle Prüfung erforderlich": "Material ungeklärt (Stufe 3). Keine Berechnung.",
            }.get(z["material"], "Keine Berechnung möglich.")
            if z["volumen"] is None:
                zz["hinweis_co2"] += " Querschnitt/Volumen fehlt (Etappe 2)."
        out.append(zz)
    return out


def gesamt(zeilen):
    """A1–A3 je Material, Summe nur über berechnete Stäbe."""
    summe = defaultdict(float)
    anzahl = Counter()
    for z in zeilen:
        if z["status_co2"] != "berechnet":
            continue
        mv = z["modul_werte"]
        if "A1-A3" in mv:  # Stahl
            summe[z["material"]] += mv["A1-A3"]
        else:  # Beton + Betonstahl
            summe["Stahlbeton C25/30 (Beton)"] += mv["Beton"].get("A1-A3", 0.0)
            summe["Stahlbeton C25/30 (Betonstahl)"] += mv["Betonstahl"].get("A1-A3", 0.0)
        anzahl[z["material"]] += 1
    return summe, anzahl


def schreibe_excel(zeilen, summe, anzahl, datei=OUT_XLSX):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    datei.parent.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    wb.remove(wb.active)
    kopf = PatternFill("solid", fgColor="305496")
    schrift = Font(bold=True, color="FFFFFF")

    def blatt(name, headers, rows):
        ws = wb.create_sheet(name)
        ws.append(headers)
        for c in ws[1]:
            c.fill, c.font = kopf, schrift
            c.alignment = Alignment(wrap_text=True, vertical="center")
        for r in rows:
            ws.append(r)
        for ci, h in enumerate(headers, 1):
            vals = [len(str(r[ci - 1])) for r in rows[:300] if r[ci - 1] is not None]
            ws.column_dimensions[get_column_letter(ci)].width = min(max(12, max([len(str(h))] + vals) + 2), 60)
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        return ws

    head = ["Stab-ID", "Layer", "Material", "Stufe", "Länge [m]", "Volumen V [m³]",
            "Masse Stahl [kg]", "Betonstahl [kg]", "Status", "Hinweis",
            "A1–A3 [kg CO₂e]", "A4 [kg CO₂e]", "A5 [kg CO₂e]", "B1 [kg CO₂e]",
            "C1 [kg CO₂e]", "C2 [kg CO₂e]", "C3 [kg CO₂e]", "C4 [kg CO₂e]", "D [kg CO₂e]"]
    rows = []
    for z in zeilen:
        mv = z["modul_werte"]
        if "A1-A3" in mv:
            a13 = mv.get("A1-A3")
            mod = {k: mv.get(k) for k in ["A4", "A5", "B1", "C1", "C2", "C3", "C4", "D"]}
            bs = None
            masse_st = z["masse_stahl_kg"]
        elif "Beton" in mv:
            a13 = mv["Beton"].get("A1-A3", 0) + mv["Betonstahl"].get("A1-A3", 0)
            mod = {k: mv["Beton"].get(k, 0) + mv["Betonstahl"].get(k, 0)
                   for k in ["A4", "A5", "B1", "C1", "C2", "C3", "C4", "D"]}
            bs = z["masse_betonstahl_kg"]
            masse_st = None
        else:
            a13, mod, bs, masse_st = None, {}, None, None
        rows.append([z["stab_id"], z["layer"], z["material"], z["stufe"], z["laenge"], z["volumen"],
                     masse_st, bs, z["status_co2"], z["hinweis_co2"], a13,
                     mod.get("A4"), mod.get("A5"), mod.get("B1"), mod.get("C1"), mod.get("C2"),
                     mod.get("C3"), mod.get("C4"), mod.get("D")])
    fmt_cols = {"K": "#,##0.00", "L": "#,##0.00", "M": "#,##0.00", "N": "#,##0.00", "O": "#,##0.00",
                "P": "#,##0.00", "Q": "#,##0.00", "R": "#,##0.00", "S": "#,##0.00", "G": "#,##0.0", "H": "#,##0.0"}
    ws = blatt("Stabergebnisse", head, rows)
    for col, f in fmt_cols.items():
        for cell in ws[col][1:]:
            cell.number_format = f

    sheet_sum = [["Material", "Anzahl berechnet", "A1–A3 [kg CO₂e]"]]
    for mat in sorted({k for k in summe}):
        sheet_sum.append([mat, None, round(summe[mat], 2)])
    # Anzahl je Material
    anz_map = {"Stahl S355": anzahl.get("Stahl S355", 0), "Stahlbeton C25/30": anzahl.get("Stahlbeton C25/30", 0)}
    for r in sheet_sum[1:]:
        if r[0] == "Stahl S355":
            r[1] = anz_map["Stahl S355"]
        elif r[0].startswith("Stahlbeton"):
            r[1] = anz_map["Stahlbeton C25/30"]
    gesamt_a13 = sum(summe.values())
    sheet_sum.append(["Summe A1–A3 (alle berechneten Stäbe)", None, round(gesamt_a13, 2)])
    sheet_sum.append(["Nicht berechnet (Stufe 3, RD 12 / Flachstäbe 162,5/20)", None, None])
    blatt("Zusammenfassung", sheet_sum[0], sheet_sum[1:])
    wb.save(datei)
    return gesamt_a13


if __name__ == "__main__":
    oeko = lade_oeko()
    zeilen_roh = lade_zeilen()
    zeilen = berechne(zeilen_roh, oeko)
    summe, anzahl = gesamt(zeilen)
    total = schreibe_excel(zeilen, summe, anzahl)
    print("Stäbe:", len(zeilen), "berechnet:", sum(1 for z in zeilen if z["status_co2"] == "berechnet"))
    print("Summe A1-A3 [kg CO2e]:", round(total, 2))
    print("Excel:", OUT_XLSX)

