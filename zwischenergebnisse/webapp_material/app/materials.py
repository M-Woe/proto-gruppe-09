"""Material-Katalog, Abmessungen aus Profilnamen und Plausibilitaetsregeln Material <-> Querschnitt.

Die Zuordnung selbst steht in materials.json (Regeln: Querschnittsname -> Material).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

CONFIG = Path(__file__).with_name("materials.json")
RANK = {"ok": 0, "info": 1, "warn": 2, "fail": 3}


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def normalize_model_material(raw: str) -> str | None:
    """Materialangabe aus dem Modell auf Beton/Stahl/Holz/Glas abbilden ('Steel S 355' -> 'Stahl')."""
    s = (raw or "").strip().lower()
    if not s:
        return None
    if s.startswith(("steel", "stahl")) or re.match(r"s\s?\d{3}\b", s):
        return "Stahl"
    if s.startswith(("concrete", "beton")) or re.match(r"c\d{2}/\d{2}", s):
        return "Beton"
    if s.startswith(("timber", "wood", "holz")) or re.match(r"gl\d{2}", s):
        return "Holz"
    if "glass" in s or "glas" in s:
        return "Glas"
    return raw.strip()


def dims(section: str) -> dict:
    """Abmessungen [mm] aus der Profilbezeichnung (Flat Bar: Hoehe/Dicke)."""
    name = section.split("|")[0].strip()
    m = re.match(r"^Flat Bar ([\d.]+)/([\d.]+)$", name)
    if m:
        return {"kind": "flat", "h": float(m[1]), "t": float(m[2])}
    m = re.match(r"^Rectangle ([\d.]+)/([\d.]+)$", name)
    if m:
        return {"kind": "rect", "b": float(m[1]), "h": float(m[2])}
    m = re.match(r"^RD ([\d.]+)$", name)
    if m:
        return {"kind": "rod", "d": float(m[1])}
    m = re.match(r"^RO ([\d.]+)x([\d.]+)$", name)
    if m:
        return {"kind": "tube", "d": float(m[1]), "t": float(m[2])}
    return {"kind": "unknown"}


def min_dim(d: dict) -> float | None:
    """Massgebendes Mindestmass [mm]: Dicke, Wandstaerke bzw. kleinste Kantenlaenge."""
    k = d["kind"]
    if k in ("flat", "tube"):
        return d["t"]
    if k == "rect":
        return min(d["b"], d["h"])
    if k == "rod":
        return d["d"]
    return None


def profile_check(mat: str, section: str) -> list[tuple[str, str]]:
    """Passt das Material zu Profilform und Abmessungen? Liefert [(Stufe, Text)]."""
    d = dims(section)
    k, md = d["kind"], min_dim(d)
    if md is None:
        return [("info", "Profil nicht erkannt, keine Abmessungsprüfung möglich")]
    ratio = d["h"] / d["t"] if k == "flat" else None
    if mat == "Beton":
        if md < 150:
            return [("fail", f"Mindestmaß {md:g} mm: als Betonstab nicht herstellbar (üblich ≥ 150–200 mm mit Bewehrung und Überdeckung)")]
        return [("ok", f"Mindestmaß {md:g} mm: für Stahlbeton plausibel")]
    if mat == "Stahl":
        if k == "rect" and md >= 300:
            return [("warn", f"Vollquerschnitt {d['b']:g}×{d['h']:g} mm aus Stahl wäre extrem schwer und unwirtschaftlich")]
        if k == "flat":
            if ratio > 20:
                return [("info", f"Flachstahl schlank (h/t = {ratio:.1f}): Kippen/Beulen nachweisen")]
            return [("ok", f"Flachstahl h/t = {ratio:.1f}: übliches Stahlprofil")]
        if k == "rod":
            return [("ok", f"Rundstahl Ø{d['d']:g} mm als Zugglied: üblich")]
        if k == "tube":
            return [("ok", "Stahlrohr (EN 10210-2, warmgefertigt): üblich")]
        return [("ok", "Abmessungen plausibel für Stahl")]
    if mat == "Holz":
        if k in ("rod", "tube"):
            return [("fail", "Rund-/Rohrprofil dieser Art ist ein Stahlprofil, kein Holzquerschnitt")]
        if md < 24:
            return [("fail", f"Dicke {md:g} mm < 24 mm: für tragendes Holz nicht üblich")]
        if ratio and ratio > 10:
            return [("warn", f"sehr schlank (h/t = {ratio:.1f}): Kippgefahr bei Holz")]
        return [("ok", f"Mindestmaß {md:g} mm: für Holz plausibel")]
    if mat == "Glas":
        if k in ("rod", "tube"):
            return [("fail", "Rund-/Rohrprofil aus Glas ist als Tragglied nicht üblich")]
        out = [("warn", "Glas wird i. d. R. als Scheibe (Flächenbauteil) modelliert, nicht als Stab")]
        if k == "flat" and md >= 10:
            out.append(("info", f"als Glasschwert (VSG, Dicke {md:g} mm) denkbar"))
        else:
            out.append(("fail", f"Dicke {md:g} mm für ein Glas-Tragglied zu gering"))
        return out
    return []
