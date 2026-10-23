"""kg CO2e je Stab und Lebenszyklus-Modul (GWP-total) aus der OEKOBAUDAT.

Ablauf je Stab:
  Stahl  : Masse [kg] = Volumen [m3] x Rohdichte (aus dem Datensatz, 7850 kg/m3)
           kg CO2e    = Masse x GWP je kg      (Datensatz-Bezug 1000 kg  ->  Wert / 1000)
  Beton  : kg CO2e    = Volumen [m3] x GWP je m3  (Datensatz-Bezug 1 m3)
           + Bewehrung: 85 kg Betonstahl je m3 Beton x GWP je kg (Datensatz-Bezug 1 kg)

Material je Querschnitt: Regeln aus Data/webapp_material/app/materials.json.
Alle Werte kommen live aus der OEKOBAUDAT (app/oekobaudat.py).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from .model import load_model
from .oekobaudat import MODULE_ORDER, Epd, load_epd

DATASETS = {
    "steel": {"standard": "20c29cbd-f9a2-4518-a1ce-c681246c29c8",     # Baustahl: Profile und Stabstahl
              "alternative": "04d1311a-ae38-4bfb-8e11-8992f1ddb14f"},  # Baustahl: Grobblech
    "concrete": {"standard": "8347f9a7-f4ec-4a36-a266-a0281f5fd16d",   # Beton C25/30
                 "alternative": "69dc12cf-ce4d-4251-8ea3-330ed72f2f79"},  # C25/30 EcoPact (Hersteller)
    "rebar": {"standard": "a8ebf8f2-2fcc-4431-b730-93bf5efd8111"},     # Betonstahl in Staeben
}
REBAR_KG_PER_M3 = 85.0
RULES_FILE = Path(__file__).with_name("materials.json")


def _rules() -> list[tuple[re.Pattern, str]]:
    cfg = json.loads(RULES_FILE.read_text(encoding="utf-8"))
    return [(re.compile(r["match"]), r["material"]) for r in cfg["rules"]]


def _material_of(section: str, rules) -> str:
    name = section.split("|")[0].strip()
    for pattern, material in rules:
        if pattern.search(name):
            return material
    raise ValueError(f"Kein Material für Querschnitt {section!r} in {RULES_FILE.name}")


def _add(total: dict, module: str, value: float | None) -> None:
    if value is not None:
        total[module] = total.get(module, 0.0) + value


def _part(label: str, epd: Epd, amount: float, unit: str) -> dict:
    """Beitrag eines Materials: amount in epd.ref_unit (kg oder m3) -> kg CO2e je Modul."""
    assert unit == epd.ref_unit, f"Einheit passt nicht: {unit} vs {epd.ref_unit}"
    gwp = {m: (None if epd.gwp[m] is None else amount * epd.per_unit(m)) for m in epd.modules}
    return {"label": label, "uuid": epd.uuid, "dataset": epd.name, "amount": amount,
            "unit": unit, "gwp": gwp}


def compute(steel: str = "standard", concrete: str = "standard",
            rebar_kg_per_m3: float = REBAR_KG_PER_M3, hollow_tubes: bool = True) -> dict:
    """Berechnet kg CO2e je Stab und Modul. steel/concrete: 'standard' oder 'alternative'."""
    epd_steel = load_epd(DATASETS["steel"][steel])
    epd_conc = load_epd(DATASETS["concrete"][concrete])
    epd_rebar = load_epd(DATASETS["rebar"]["standard"])
    rules = _rules()

    members = []
    for m in load_model()["members"]:
        material = _material_of(m["section"], rules)
        volume, notes = m["volume_m3"], []
        parts = []
        if material == "Stahl":
            if hollow_tubes and m["section"].startswith("RO ") and m["area_nom_mm2"]:
                solid = volume
                volume = m["area_nom_mm2"] * 1e-6 * m["length_m"]
                notes.append(f"Rohr hohl gerechnet: {volume:.5f} m3 statt massiv {solid:.5f} m3")
            density = epd_steel.density_kg_m3 or 7850.0
            mass = volume * density
            parts.append(_part("Baustahl", epd_steel, mass, "kg"))
        elif material == "Beton":
            rebar_mass = volume * rebar_kg_per_m3
            mass = volume * (epd_conc.density_kg_m3 or 2400.0) + rebar_mass
            parts.append(_part("Beton", epd_conc, volume, "m3"))
            parts.append(_part("Bewehrung", epd_rebar, rebar_mass, "kg"))
        else:
            raise ValueError(f"Material {material!r} (Stab {m['id']}) hat keinen Datensatz")

        total: dict[str, float] = {}
        for p in parts:
            for mod, val in p["gwp"].items():
                _add(total, mod, val)
            missing = [mod for mod, val in p["gwp"].items() if val is None]
            if missing:
                notes.append(f"{p['label']}: {', '.join(missing)} im Datensatz nicht deklariert")
        members.append({
            "id": m["id"], "section": m["section"], "material": material,
            "length_m": m["length_m"], "volume_m3": round(volume, 6), "mass_kg": mass,
            "rebar_kg": parts[1]["amount"] if material == "Beton" else 0.0,
            "parts": parts,
            "gwp": {mod: total.get(mod) for mod in MODULE_ORDER if any(mod in p["gwp"] for p in parts)},
            "note": "; ".join(notes),
        })
    return {"members": members, "epds": [epd_steel, epd_conc, epd_rebar],
            "options": {"steel": steel, "concrete": concrete, "rebar_kg_per_m3": rebar_kg_per_m3,
                        "hollow_tubes": hollow_tubes}}


def module_totals(result: dict) -> dict[str, float]:
    tot: dict[str, float] = {}
    for m in result["members"]:
        for mod, val in m["gwp"].items():
            _add(tot, mod, val)
    return {mod: tot[mod] for mod in MODULE_ORDER if mod in tot}


if __name__ == "__main__":
    res = compute()
    print(f"{len(res['members'])} Staebe")
    for e in res["epds"]:
        print(f"  {e.name[:60]} | Bezug {e.ref_amount:g} {e.ref_unit} | {e.fetched}")
    for mod, v in module_totals(res).items():
        print(f"  {mod:6s} {v:12.1f} kg CO2e")
