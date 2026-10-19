"""Liest das RFEM-Export-Modell (Stockerau) aus Data/ und liefert Staebe samt Geometrie.

Jeder Stab hat im 3dm eine RFEM-BeamId (User-String). Sie verbindet
  - den Volumenkoerper (Layer ...::Members::<Querschnitt>)  und
  - die Achslinie       (Layer ...::MemberAxes::<Querschnitt>).
Zugstaebe (RD 12) haben nur eine Achslinie, ihr Volumen wird als A x L berechnet.
"""
from __future__ import annotations

import math
import re
from functools import lru_cache
from pathlib import Path

import rhino3dm

ROOT = Path(__file__).resolve().parent.parent
MODEL_NAME = "Stockerau Rhino Export from RFEM.3dm"


def _find_model() -> Path:
    """Sucht das 3dm: <Projekt>/Data/ (Original-App) oder ein Ordner darueber (Kopie in Data/webapp/)."""
    candidates = [ROOT / "Data" / MODEL_NAME, ROOT / MODEL_NAME, ROOT.parent / MODEL_NAME]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]


MODEL_PATH = _find_model()

K_ID = "BG_RFEM_Exchange_BeamId_bg0246"
K_TYPE = "BG_RFEM_Exchange_Type_bg0247"
K_SEC_END = "BG_RFEM_Exchange_CrosSec_E_bg0251"


def nominal_area_mm2(section: str) -> float | None:
    """Nennquerschnittsflaeche [mm2] aus der Profilbezeichnung."""
    name = section.split("|")[0].strip()
    m = re.match(r"^(?:Flat Bar|Rectangle)\s+([\d.]+)/([\d.]+)$", name)
    if m:
        return float(m.group(1)) * float(m.group(2))
    m = re.match(r"^RD\s+([\d.]+)$", name)
    if m:
        return math.pi / 4 * float(m.group(1)) ** 2
    m = re.match(r"^RO\s+([\d.]+)x([\d.]+)$", name)
    if m:
        d, t = float(m.group(1)), float(m.group(2))
        return math.pi / 4 * (d**2 - (d - 2 * t) ** 2)
    return None


def _layer_path_fn(model: rhino3dm.File3dm):
    by_index = {l.Index: l for l in model.Layers}
    by_id = {str(l.Id): l for l in model.Layers}

    def path(index: int) -> str:
        layer = by_index[index]
        parts = [layer.Name]
        while str(layer.ParentLayerId) in by_id:
            layer = by_id[str(layer.ParentLayerId)]
            parts.append(layer.Name)
        return "::".join(reversed(parts))

    return path


def _brep_mesh_and_volume(brep) -> tuple[list[float], list[int], float]:
    """Vereinigtes Dreiecksnetz aller Brep-Flaechen + Volumen (Divergenzsatz)."""
    positions: list[float] = []
    indices: list[int] = []
    volume = 0.0
    offset = 0
    for face in brep.Faces:
        mesh = face.GetMesh(rhino3dm.MeshType.Any)
        if mesh is None:
            continue
        verts = [(v.X, v.Y, v.Z) for v in mesh.Vertices]
        for x, y, z in verts:
            positions.extend((round(x, 4), round(y, 4), round(z, 4)))
        for i in range(len(mesh.Faces)):
            f = mesh.Faces[i]
            tris = [(f[0], f[1], f[2])]
            if f[2] != f[3]:
                tris.append((f[0], f[2], f[3]))
            for a, b, c in tris:
                indices.extend((a + offset, b + offset, c + offset))
                (ax, ay, az), (bx, by, bz), (cx, cy, cz) = verts[a], verts[b], verts[c]
                volume += (
                    ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
                ) / 6.0
        offset += len(verts)
    return positions, indices, abs(volume)


def _read_members(model: rhino3dm.File3dm) -> tuple[dict, dict]:
    """Liefert (Volumenkoerper, Achslinien) je RFEM-BeamId."""
    path_of = _layer_path_fn(model)
    solids: dict[int, dict] = {}
    axes: dict[int, dict] = {}
    for obj in model.Objects:
        parts = path_of(obj.Attributes.LayerIndex).split("::")
        if "RFEM_Export_260915" not in parts or parts[-2] not in ("Members", "MemberAxes"):
            continue
        kind, section = parts[-2], parts[-1]
        us = dict(obj.Attributes.GetUserStrings())
        beam_id = int(us[K_ID])
        geom = obj.Geometry
        if kind == "Members":
            positions, indices, volume = _brep_mesh_and_volume(geom)
            solids[beam_id] = {"positions": positions, "indices": indices, "volume": volume}
        else:
            p0, p1 = geom.PointAtStart, geom.PointAtEnd
            axes[beam_id] = {
                "section": section,
                "type": us.get(K_TYPE, ""),
                "section_end": us.get(K_SEC_END, "-"),
                "length": math.dist((p0.X, p0.Y, p0.Z), (p1.X, p1.Y, p1.Z)),
                "line": [round(c, 4) for c in (p0.X, p0.Y, p0.Z, p1.X, p1.Y, p1.Z)],
            }
    return solids, axes


def _build_member(beam_id: int, ax: dict, solid: dict | None) -> dict:
    section, length, end = ax["section"], ax["length"], ax["section_end"]
    a_nom = nominal_area_mm2(section)
    notes = []
    if solid:
        volume = solid["volume"]
        geometry = {"mesh": {"p": solid["positions"], "i": solid["indices"]}}
    else:
        volume = (a_nom or 0.0) * 1e-6 * length
        geometry = {"line": ax["line"]}
        notes.append("nur Achslinie im Modell, Volumen = A x L berechnet")
    if end not in ("-", "", section):
        notes.append(f"variabler Querschnitt: {section} -> {end}")
    if section.startswith("RO ") and solid and a_nom:
        notes.append(f"im Modell massiv; Rohr-Volumen A x L = {a_nom * 1e-6 * length:.5f} m3")
    return {
        "id": beam_id,
        "section": section,
        "section_end": end if end not in ("-", "") else None,
        "type": ax["type"],
        "length_m": round(length, 4),
        "area_nom_mm2": round(a_nom, 1) if a_nom is not None else None,
        "area_mean_mm2": round(volume / length * 1e6, 1) if length else None,
        "volume_m3": round(volume, 6),
        "volume_source": "Modell" if solid else "berechnet",
        "note": "; ".join(notes),
        **geometry,
    }


def _summarize(members: list[dict]) -> list[dict]:
    sections: dict[str, dict] = {}
    for m in members:
        s = sections.setdefault(m["section"], {
            "name": m["section"], "count": 0, "area_nom_mm2": m["area_nom_mm2"],
            "length_m": 0.0, "volume_m3": 0.0, "volume_source": m["volume_source"],
        })
        s["count"] += 1
        s["length_m"] += m["length_m"]
        s["volume_m3"] += m["volume_m3"]
    result = sorted(sections.values(), key=lambda s: -s["volume_m3"])
    for s in result:
        s["length_m"] = round(s["length_m"], 3)
        s["volume_m3"] = round(s["volume_m3"], 5)
    return result


@lru_cache(maxsize=1)
def load_model() -> dict:
    model = rhino3dm.File3dm.Read(str(MODEL_PATH))
    if model is None:
        raise FileNotFoundError(f"3dm konnte nicht gelesen werden: {MODEL_PATH}")
    solids, axes = _read_members(model)
    members = [_build_member(i, axes[i], solids.get(i)) for i in sorted(axes)]
    return {
        "source": MODEL_PATH.name,
        "unit": "m",
        "member_count": len(members),
        "sections": _summarize(members),
        "members": members,
    }

