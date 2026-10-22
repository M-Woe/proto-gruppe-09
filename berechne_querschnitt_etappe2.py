"""
Etappe 2: Querschnittsfläche A und Volumen V je Stab.

Grundlage: stab_liste_etappe1.build_stab_liste() (eindeutig je RFEM-BeamId).
Zuordnung Achse <-> Brep über BeamId (nicht über Reihenfolge im Layer).

Methoden (geprüft, siehe Logbuch Etappe 2):
- Flachstab (Brep, 4+4 Endecken, 6 Flächen): A je Ende = Fläche der Endfläche,
  Dicke t aus dem Layernamen, Breite = A/t. V = Divergenzsatz am Brep-Netz;
  Kontrolle V_kontrolle = (A0 + A1)/2 * L.
- Kastenprofil (Brep, Rechteck): A = b*h aus Layername, V = A*L, Kontrolle Brep-Netz.
- Rundrohr (Brep mit 3 Flächen): A = pi*(D^2-(D-2t)^2)/4 aus Layername, V = A*L.
  Brep-Volumen nicht über Rechteck-Kontrolle prüfbar -> Status TEILWEISE.
- RD 12 (Tension, kein Brep): nicht berechnet, Status UNKLAR.
"""
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import rhino3dm

from stab_liste_etappe1 import build_stab_liste, read_objects

ROOT = Path(__file__).resolve().parent
MM = 1000.0
OUT_XLSX = ROOT / "output" / "excel" / "etappe2_querschnitt_volumen.xlsx"
TOL_VOL = 0.001     # 0,1 % relative Toleranz Volumen-Kontrolle
TOL_BREITE = 0.001  # 1 mm Toleranz Breite gegen Layer


def parse_profil(layer: str):
    """Profil aus dem Layernamen. Liefert (typ, b_m, h_m, t_m) oder None."""
    if layer.startswith("Flat Bar "):
        b, t = layer.replace("Flat Bar ", "").split("/")
        return ("Flachstab", float(b) / MM, None, float(t) / MM)
    m = re.search(r"RO ([\d.]+)x([\d.]+)", layer)
    if m:
        return ("Rundrohr", float(m.group(1)) / MM, None, float(m.group(2)) / MM)
    if layer.startswith("Rectangle "):
        b, h = layer.split()[-1].split("/")
        return ("Kastenprofil", float(b) / MM, float(h) / MM, None)
    return None


def _tri_volume(a, b, c):
    return (a[0] * (b[1] * c[2] - b[2] * c[1])
            - a[1] * (b[0] * c[2] - b[2] * c[0])
            + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0


def brep_volume(brep):
    """Volumen eines geschlossenen Brep über das Dreiecksnetz (Divergenzsatz).

    Liefert None, wenn nicht alle Flächen vernetzt werden konnten.
    """
    total = 0.0
    for face in brep.Faces:
        mesh = face.GetMesh(rhino3dm.MeshType.Any)
        if mesh is None:
            return None
        verts = [(v.X, v.Y, v.Z) for v in mesh.Vertices]
        for f in mesh.Faces:
            a, b, c = verts[f[0]], verts[f[1]], verts[f[2]]
            total += _tri_volume(a, b, c)
            if f[2] != f[3]:
                total += _tri_volume(a, c, verts[f[3]])
    return abs(total)


def _quad_area(p):
    """Fläche eines ebenen Vierecks (zwei Dreiecke, Punkte zyklisch geordnet)."""
    def tri(a, b, c):
        u = [b[i] - a[i] for i in range(3)]
        v = [c[i] - a[i] for i in range(3)]
        cx = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        return math.sqrt(sum(x * x for x in cx)) / 2
    return tri(p[0], p[1], p[2]) + tri(p[0], p[2], p[3])


def _order_quad(pts):
    """Sortiert die 4 Eckpunkte einer Endfläche zyklisch um den Schwerpunkt."""
    c = [sum(p[i] for p in pts) / 4 for i in range(3)]
    best = None
    for i in range(4):
        for j in range(i + 1, 4):
            for k in range(j + 1, 4):
                u = [pts[j][m] - pts[i][m] for m in range(3)]
                v = [pts[k][m] - pts[i][m] for m in range(3)]
                n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
                ln = math.sqrt(sum(x * x for x in n))
                if ln > 1e-12 and (best is None or ln > best[0]):
                    best = (ln, [x / ln for x in n])
    n = best[1]
    e1 = [pts[0][m] - c[m] for m in range(3)]
    l1 = math.sqrt(sum(x * x for x in e1))
    e1 = [x / l1 for x in e1]
    e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]
    ang = []
    for p in pts:
        d = [p[m] - c[m] for m in range(3)]
        ang.append(math.atan2(sum(d[m] * e2[m] for m in range(3)),
                              sum(d[m] * e1[m] for m in range(3))))
    return [p for _, p in sorted(zip(ang, pts))]


def flachstab_endflaechen(brep, p0, p1):
    """Flächen der Endvierecke (A0, A1) an Start- und Endpunkt der Achse, oder None."""
    L = math.dist(p0, p1)
    u = [(p1[i] - p0[i]) / L for i in range(3)]
    verts = [(v.Location.X, v.Location.Y, v.Location.Z) for v in brep.Vertices]
    s = [sum((p[i] - p0[i]) * u[i] for i in range(3)) for p in verts]
    e0 = [p for p, si in zip(verts, s) if si < L / 2]
    e1 = [p for p, si in zip(verts, s) if si >= L / 2]
    if len(e0) != 4 or len(e1) != 4:
        return None
    return _quad_area(_order_quad(e0)), _quad_area(_order_quad(e1))



def _radius_am_brep(brep, p0, p1) -> float:
    """Außenradius eines Rundstabs: größter Abstand der Brep-Eckpunkte zur Achse."""
    L = math.dist(p0, p1)
    u = [(p1[i] - p0[i]) / L for i in range(3)]
    rmax = 0.0
    for v in brep.Vertices:
        p = (v.Location.X, v.Location.Y, v.Location.Z)
        d = [p[i] - p0[i] for i in range(3)]
        al = sum(d[i] * u[i] for i in range(3))
        perp = [d[i] - al * u[i] for i in range(3)]
        rmax = max(rmax, math.sqrt(sum(x * x for x in perp)))
    return rmax


def berechne_stab(stab: dict, index: dict) -> dict:
    """Berechnet A und V für einen Stab; unklare Fälle werden gekennzeichnet."""
    bid = stab["rfem_beam_id"]
    d = index[bid]
    axis = d["axes"][0]["geom"]
    p0 = (axis.PointAtStart.X, axis.PointAtStart.Y, axis.PointAtStart.Z)
    p1 = (axis.PointAtEnd.X, axis.PointAtEnd.Y, axis.PointAtEnd.Z)
    L = math.dist(p0, p1)
    layer = stab["layer"]
    out = {"stab_id": stab["stab_id"], "rfem_beam_id": bid, "rfem_typ": stab["rfem_typ"],
           "layer": layer, "laenge_m": round(L, 4), "profil": "", "methode": "",
           "A_m2": None, "A_start_m2": None, "A_ende_m2": None,
           "V_m3": None, "V_kontrolle_m3": None, "abweichung_rel": None,
           "pruefstatus": "", "hinweis": ""}

    prof = parse_profil(layer)
    if prof is None:
        out.update({"methode": "nicht berechnet", "pruefstatus": "UNKLAR",
                    "hinweis": "Profil aus Layername nicht ableitbar"})
        return out

    typ, b, h, t = prof
    brep = d["breps"][0]["geom"] if d["breps"] else None

    if typ == "Flachstab":
        out["profil"] = f"Flachstab {b * MM:g} x {t * MM:g} mm"
        if brep is None:
            out.update({"methode": "nicht berechnet", "pruefstatus": "UNKLAR",
                        "hinweis": "kein Brep vorhanden"})
            return out
        ends = flachstab_endflaechen(brep, p0, p1)
        if ends is None:
            out.update({"methode": "nicht berechnet", "pruefstatus": "UNKLAR",
                        "hinweis": "Endflächen nicht als Viereck erkennbar"})
            return out
        A0, A1 = ends
        V = brep_volume(brep)
        V_trap = (A0 + A1) / 2 * L
        rel = abs(V - V_trap) / V_trap if V and V_trap else None
        ok_layer = abs(max(A0 / t, A1 / t) - b) < TOL_BREITE
        ok_vol = rel is not None and rel < TOL_VOL
        hinweis = []
        if not ok_layer:
            hinweis.append(f"größere Endbreite {max(A0, A1) / t * MM:.1f} mm weicht vom Layer {b * MM:g} mm ab")
        if not ok_vol:
            hinweis.append("Volumen-Kontrolle außerhalb Toleranz")
        out.update({
            "methode": "Endflächen (Rechteck) + Dicke aus Layer; V = Divergenzsatz am Brep-Netz; Kontrolle (A0+A1)/2*L",
            "A_m2": (A0 + A1) / 2, "A_start_m2": A0, "A_ende_m2": A1,
            "V_m3": V, "V_kontrolle_m3": V_trap, "abweichung_rel": rel,
            "pruefstatus": "OK" if (ok_layer and ok_vol) else "PRÜFEN",
            "hinweis": "; ".join(hinweis),
        })
        return out

    if typ == "Rundrohr":
        # Modell ist ein VOLLZYLINDER (keine Innenbohrung), gemessen am Brep:
        # alle Eckpunkte liegen auf dem Außenradius. Die Wandstärke aus dem
        # Layername (8 mm) ist im Modell nicht abgebildet.
        out["profil"] = f"Rundrohr-Layer {b * MM:g} x {t * MM:g} mm (Brep: Vollzylinder)"
        if brep is None:
            out.update({"methode": "nicht berechnet", "pruefstatus": "UNKLAR",
                        "hinweis": "kein Brep vorhanden"})
            return out
        R = _radius_am_brep(brep, p0, p1)
        A = math.pi * R * R
        V_netz = brep_volume(brep)
        rel = abs(V_netz - A * L) / (A * L) if V_netz else None
        D_layer = b
        A_rohr_layer = math.pi * (D_layer ** 2 - (D_layer - 2 * t) ** 2) / 4
        out.update({
            "methode": "Vollzylinder aus Brep-Außenradius gemessen; V = pi*R^2*L; Netz-Kontrolle (Polygon)",
            "A_m2": A, "A_start_m2": A, "A_ende_m2": A, "V_m3": A * L,
            "V_kontrolle_m3": V_netz, "abweichung_rel": rel,
            "pruefstatus": "PRÜFEN",
            "hinweis": (f"Layer nennt Rohr {D_layer * MM:g} x {t * MM:g} mm (A={A_rohr_layer * 1e6:.0f} mm²), "
                        f"Modell ist Vollzylinder mit D={2 * R * MM:.1f} mm (A={A * 1e6:.0f} mm²). "
                        f"Widerspruch ungeklärt. Netz-Volumen = {rel * 100:.1f} % Abweichung (Polygonnäherung)."),
        })
        return out

    if typ == "Kastenprofil":
        A = b * h
        out["profil"] = f"Kasten {b * MM:g} x {h * MM:g} mm"
        if brep is None:
            out.update({"methode": "nicht berechnet", "pruefstatus": "UNKLAR",
                        "hinweis": "kein Brep vorhanden"})
            return out
        ends = flachstab_endflaechen(brep, p0, p1)
        if ends is None:
            out.update({"methode": "nicht berechnet", "pruefstatus": "UNKLAR",
                        "hinweis": "Endflächen nicht als Viereck erkennbar"})
            return out
        A0, A1 = ends
        V = brep_volume(brep)
        V_trap = (A0 + A1) / 2 * L
        rel = abs(V - V_trap) / V_trap if V and V_trap else None
        # Endflächen sind gemessen (Modell hat 499,75 x 500 mm statt 500 x 500 mm)
        b_mess0, b_mess1 = A0 / h, A1 / h
        ok_nenn = abs(max(b_mess0, b_mess1) - b) < 0.001  # 1 mm Toleranz (Brep-Kanten 498-500 mm)
        ok_vol = rel is not None and rel < TOL_VOL
        hinweis = []
        if not ok_nenn:
            hinweis.append(f"Endfläche weicht vom Nennmaß {b * MM:g} mm um mehr als 1 mm ab")
        if not ok_vol:
            hinweis.append("Volumen-Kontrolle außerhalb Toleranz")
        out.update({"methode": "Endflächen am Brep gemessen; V = Divergenzsatz am Brep-Netz; Kontrolle (A0+A1)/2*L",
                    "A_m2": (A0 + A1) / 2, "A_start_m2": A0, "A_ende_m2": A1,
                    "V_m3": V, "V_kontrolle_m3": V_trap, "abweichung_rel": rel,
                    "pruefstatus": "OK" if (ok_nenn and ok_vol) else "PRÜFEN",
                    "hinweis": "; ".join(hinweis)})
        return out

    return out


def berechne_alle() -> list:
    stabe = build_stab_liste()
    index = read_objects()
    return [berechne_stab(s, index) for s in stabe]



def schreibe_excel(zeilen: list, datei: Path = OUT_XLSX) -> None:
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    datei.parent.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    kopf_fill = PatternFill("solid", fgColor="305496")
    kopf_font = Font(bold=True, color="FFFFFF")

    def blatt(name, headers, rows, numfmt=None):
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
            ws.column_dimensions[get_column_letter(ci)].width = min(max(10, width + 2), 48)
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        if numfmt:
            for col, fmt in numfmt.items():
                for cell in ws[col][1:]:
                    cell.number_format = fmt
        return ws

    head = ["Stab-ID", "RFEM-BeamId", "Typ", "Layer", "Profil", "Länge L [m]",
            "A Start [m²]", "A Ende [m²]", "A mittel [m²]", "A mittel [mm²]",
            "Volumen V [m³]", "Volumen Kontrolle [m³]", "Abweichung rel.",
            "Methode", "Prüfstatus", "Hinweis"]
    rows = []
    for z in zeilen:
        a_mm2 = z["A_m2"] * 1e6 if z["A_m2"] is not None else None
        rows.append([z["stab_id"], z["rfem_beam_id"], z["rfem_typ"], z["layer"], z["profil"],
                     z["laenge_m"], z["A_start_m2"], z["A_ende_m2"], z["A_m2"], a_mm2,
                     z["V_m3"], z["V_kontrolle_m3"], z["abweichung_rel"],
                     z["methode"], z["pruefstatus"], z["hinweis"]])
    fmt = {"F": "0.000000", "G": "0.000000", "I": "0.000000", "J": "0.0",
           "K": "0.00000000", "L": "0.00000000", "M": "0.000000%"}
    blatt("Detail", head, rows, fmt)

    agg = defaultdict(lambda: {"n": 0, "L": 0.0, "V": 0.0, "A": None})
    status_je = defaultdict(Counter)
    for z in zeilen:
        g = agg[(z["rfem_typ"], z["layer"])]
        g["n"] += 1
        g["L"] += z["laenge_m"]
        if z["V_m3"] is not None:
            g["V"] += z["V_m3"]
        if z["A_m2"] is not None:
            g["A"] = z["A_m2"]
        status_je[(z["rfem_typ"], z["layer"])][z["pruefstatus"]] += 1
    ov = []
    for key, g in sorted(agg.items()):
        st = status_je[key]
        ov.append([key[0], key[1], g["n"], round(g["L"], 4),
                   g["A"] * 1e6 if g["A"] else None, round(g["V"], 8),
                   st["OK"], st["TEILWEISE"], st["PRÜFEN"], st["UNKLAR"]])
    blatt("Übersicht", ["Typ", "Layer", "Anzahl", "Länge gesamt [m]", "A je Stab [mm²]",
                        "Volumen gesamt [m³]", "OK", "TEILWEISE", "PRÜFEN", "UNKLAR"],
          ov, {"D": "0.0000", "E": "0.0", "F": "0.00000000"})

    zaehl = Counter(z["pruefstatus"] for z in zeilen)
    gesamt_V = sum(z["V_m3"] for z in zeilen if z["V_m3"] is not None)
    gesamt_L = sum(z["laenge_m"] for z in zeilen)
    zus = [
        ["Stäbe gesamt", len(zeilen)],
        ["Summe Länge [m]", round(gesamt_L, 4)],
        ["Summe Volumen mit Wert [m³]", round(gesamt_V, 8)],
        ["Status OK", zaehl["OK"]],
        ["Status TEILWEISE", zaehl["TEILWEISE"]],
        ["Status PRÜFEN", zaehl["PRÜFEN"]],
        ["Status UNKLAR", zaehl["UNKLAR"]],
        ["Einheiten", "Länge m, Fläche m² (und mm²), Volumen m³"],
        ["Quelle", "stab_liste_etappe1.py (RFEM-BeamId)"],
    ]
    ws = blatt("Zusammenfassung", ["Kennzahl", "Wert"], zus)
    ws.column_dimensions["A"].width = 34
    ws.column_dimensions["B"].width = 60
    wb.save(datei)


if __name__ == "__main__":
    zeilen = berechne_alle()
    schreibe_excel(zeilen)
    print(f"Stäbe: {len(zeilen)}")
    print(f"Status: {dict(Counter(z['pruefstatus'] for z in zeilen))}")
    print(f"Excel: {OUT_XLSX}")
