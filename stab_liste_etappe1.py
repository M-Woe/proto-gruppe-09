"""
Etappe 1: Vollständige Stabliste aus dem Rhino-Modell (RFEM-Export) erzeugen.

Identifikation eines Stabs (Annahmen):
- Jeder Stab trägt im RFEM-Export die Benutzerdaten `BG_RFEM_Exchange_BeamId_bg0246`
  (RFEM-BeamId) und `BG_RFEM_Exchange_Type_bg0247` (Beam bzw. Tension).
- Ein Stab kann in zwei Darstellungen vorliegen:
    A) Brep  (3D-Volumenkörper)  -> nur Referenz, keine eigene Zählung
    B) LineCurve (Stabachse)     -> liefert Start-/Endpunkt und Länge
- Die Zählung erfolgt über die RFEM-BeamId: genau ein Datensatz je BeamId.
  Brep und Achslinie mit gleicher BeamId werden zu einem Stab zusammengeführt.
- Stabile ID: `ST` + vierstellige RFEM-BeamId (z. B. `ST0001`).
- Modelleinheit: Meter (laut Rhino-Dateieinstellung).

Ausführung (Projektwurzel):  python stab_liste_etappe1.py
"""
import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import rhino3dm

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "data" / "Stockerau Rhino Export from RFEM.3dm"
OUT_CSV = ROOT / "data" / "etappe1_staebe_liste.csv"
OUT_JSON = ROOT / "data" / "etappe1_staebe_liste.json"

KEY_BEAM_ID = "BG_RFEM_Exchange_BeamId_bg0246"
KEY_TYPE = "BG_RFEM_Exchange_Type_bg0247"
KEY_ROT = "BG_RFEM_Exchange_RotAngle_bg0248"
KEY_CS_START = "BG_RFEM_Exchange_CrosSec_S_bg0252"
KEY_CS_END = "BG_RFEM_Exchange_CrosSec_E_bg0251"

MEMBER_TYPES = ("Beam", "Tension")
CSV_FIELDS = [
    "stab_id", "rfem_beam_id", "rfem_typ", "layer",
    "querschnitt_start", "querschnitt_ende", "rotwinkel_deg",
    "start_x", "start_y", "start_z", "ende_x", "ende_y", "ende_z",
    "laenge_m", "achse_obj_index", "achse_uuid",
    "brep_vorhanden", "brep_obj_index", "brep_uuid",
]


def _stab_id(beam_id: int) -> str:
    return f"ST{beam_id:04d}"


def read_objects(model_path: Path = MODEL_PATH) -> dict:
    """Liest alle Stab-Objekte (LineCurve und Brep mit RFEM-BeamId) aus dem Modell.

    Liefert {beam_id: {"axes": [...], "breps": [...]}}; die Einträge sind Dicts mit
    obj_index, uuid, layer, geom, userdata.
    """
    model = rhino3dm.File3dm.Read(str(model_path))
    if model is None:
        raise FileNotFoundError(f"Rhino-Modell nicht lesbar: {model_path}")
    layer_names = {layer.Index: layer.Name for layer in model.Layers}

    found: dict = defaultdict(lambda: {"axes": [], "breps": []})
    for idx, obj in enumerate(model.Objects):
        geom = obj.Geometry
        if geom is None:
            continue
        gtype = type(geom).__name__
        if gtype not in ("LineCurve", "Brep"):
            continue
        ud = dict(obj.Attributes.GetUserStrings())
        if KEY_BEAM_ID not in ud or ud.get(KEY_TYPE) not in MEMBER_TYPES:
            continue
        entry = {
            "obj_index": idx,
            "uuid": str(obj.Attributes.Id),
            "layer": layer_names.get(obj.Attributes.LayerIndex, ""),
            "geom": geom,
            "userdata": ud,
        }
        beam_id = int(ud[KEY_BEAM_ID])
        if gtype == "LineCurve":
            found[beam_id]["axes"].append(entry)
        else:
            found[beam_id]["breps"].append(entry)
    return dict(found)



def build_stab_liste(model_path: Path = MODEL_PATH) -> list:
    """Erzeugt eine Liste mit genau einem Datensatz je RFEM-BeamId."""
    found = read_objects(model_path)
    stabe = []
    for beam_id in sorted(found):
        axes = found[beam_id]["axes"]
        breps = found[beam_id]["breps"]
        if len(axes) != 1:
            raise ValueError(f"BeamId {beam_id}: {len(axes)} Achslinien statt 1")
        if len(breps) > 1:
            raise ValueError(f"BeamId {beam_id}: {len(breps)} Brep-Körper statt max. 1")

        axis = axes[0]
        ud = axis["userdata"]
        p0 = axis["geom"].PointAtStart
        p1 = axis["geom"].PointAtEnd
        start = (p0.X, p0.Y, p0.Z)
        end = (p1.X, p1.Y, p1.Z)
        length = math.dist(start, end)

        brep = breps[0] if breps else None
        if brep and brep["layer"] != axis["layer"]:
            raise ValueError(f"BeamId {beam_id}: Brep und Achse liegen in unterschiedlichen Layern")

        stabe.append({
            "stab_id": _stab_id(beam_id),
            "rfem_beam_id": beam_id,
            "rfem_typ": ud[KEY_TYPE],
            "layer": axis["layer"],
            "querschnitt_start": ud.get(KEY_CS_START, ""),
            "querschnitt_ende": ud.get(KEY_CS_END, ""),
            "rotwinkel_deg": float(ud.get(KEY_ROT, 0) or 0),
            "start_x": round(start[0], 4), "start_y": round(start[1], 4), "start_z": round(start[2], 4),
            "ende_x": round(end[0], 4), "ende_y": round(end[1], 4), "ende_z": round(end[2], 4),
            "laenge_m": round(length, 4),
            "achse_obj_index": axis["obj_index"],
            "achse_uuid": axis["uuid"],
            "brep_vorhanden": brep is not None,
            "brep_obj_index": brep["obj_index"] if brep else None,
            "brep_uuid": brep["uuid"] if brep else None,
        })
    return stabe


def write_outputs(stabe: list, csv_path: Path = OUT_CSV, json_path: Path = OUT_JSON) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(stabe)

    output = {
        "modell": MODEL_PATH.name,
        "einheit": "m",
        "anzahl_staebe": len(stabe),
        "anzahl_je_typ": dict(Counter(s["rfem_typ"] for s in stabe)),
        "gesamtlaenge_m": round(sum(s["laenge_m"] for s in stabe), 4),
        "staebe": stabe,
    }
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)


def main() -> None:
    print(f"Lese {MODEL_PATH.name} ...")
    stabe = build_stab_liste()
    write_outputs(stabe)
    print(f"Stäbe gesamt:        {len(stabe)}")
    for typ, n in Counter(s["rfem_typ"] for s in stabe).items():
        print(f"  {typ:10s}          {n}")
    print(f"Mit Brep-Körper:     {sum(s['brep_vorhanden'] for s in stabe)}")
    print(f"Gesamtlänge [m]:     {sum(s['laenge_m'] for s in stabe):.2f}")
    print(f"CSV:  {OUT_CSV}")
    print(f"JSON: {OUT_JSON}")


if __name__ == "__main__":
    main()

