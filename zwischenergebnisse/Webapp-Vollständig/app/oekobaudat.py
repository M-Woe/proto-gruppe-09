"""Live-Abfrage der OEKOBAUDAT (https://oekobaudat.de): GWP-total je Lebenszyklus-Modul.

Schnittstelle (offen, ohne Konto):
    https://oekobaudat.de/OEKOBAU.DAT/resource/processes/<UUID>?format=json&view=extended

Wichtig: Jeder Datensatz hat eine eigene Bezugseinheit, auf die sich ALLE Werte beziehen
(z. B. Baustahl: 1000 kg, Beton: 1 m3, Betonstahl: 1 kg). Sie wird hier aus dem
Referenzfluss gelesen und in `Epd.per_unit()` auf 1 kg bzw. 1 m3 umgerechnet.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache

URL = "https://oekobaudat.de/OEKOBAU.DAT/resource/processes/{uuid}?format=json&view=extended"
GWP_TOTAL_ID = "6a37f984-a4b3-458a-a20a-64418c145fa2"  # LCIA-Methode "GWP-total"

# Reihenfolge der Module nach EN 15804
MODULE_ORDER = ["A1-A3", "A4", "A5", "B1", "B2", "B3", "B4", "B5", "B6", "B7",
                "C1", "C2", "C3", "C4", "D"]
UNIT_ALIASES = {"kg": "kg", "m3": "m3", "m^3": "m3", "m³": "m3"}


class OekobaudatError(RuntimeError):
    pass


@dataclass
class Epd:
    uuid: str
    name: str
    ref_unit: str                 # "kg" oder "m3"
    ref_amount: float             # Menge, auf die sich die Werte beziehen (z. B. 1000 kg)
    density_kg_m3: float | None   # Rohdichte laut Datensatz
    gwp: dict[str, float | None]  # Modul -> kg CO2e je ref_amount (None = nicht deklariert)
    scenarios: dict[str, str]     # Modul -> gewaehltes Szenario (nur wo vorhanden)
    url: str
    fetched: str
    notes: list[str] = field(default_factory=list)

    def per_unit(self, module: str) -> float | None:
        """kg CO2e je 1 kg (ref_unit = kg) bzw. je 1 m3 (ref_unit = m3)."""
        v = self.gwp.get(module)
        return None if v is None else v / self.ref_amount

    @property
    def modules(self) -> list[str]:
        return [m for m in MODULE_ORDER if m in self.gwp]


def _fetch_json(uuid: str, retries: int = 3, timeout: int = 60) -> dict:
    url = URL.format(uuid=uuid)
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json",
                                                       "User-Agent": "struktur-oekologie-gruppe/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            time.sleep(1.5 * attempt)
    raise OekobaudatError(f"ÖKOBAUDAT nicht erreichbar / ungültige Antwort für {uuid}: {last}")


def _text(items, prefer=("de", "en")) -> str:
    if isinstance(items, str):
        return items
    for lang in prefer:
        for it in items or []:
            if it.get("lang") == lang and it.get("value"):
                return it["value"]
    for it in items or []:
        if it.get("value"):
            return it["value"]
    return ""


def _default_scenario(data: dict) -> str | None:
    """Szenario, das der Datensatz selbst als 'default' kennzeichnet (z. B. Baustahl: S3)."""
    anies = data["processInformation"]["dataSetInformation"].get("other", {}).get("anies", [])
    for block in anies:
        for sc in block.get("scenario", []) or []:
            if sc.get("default"):
                return sc.get("name")
    return None


def _reference(data: dict) -> tuple[str, float, float | None]:
    """(Bezugseinheit, Bezugsmenge, Rohdichte) aus dem Referenzfluss."""
    exchanges = data["exchanges"]["exchange"]
    ref_ids = data["processInformation"].get("quantitativeReference", {}).get("referenceToReferenceFlow", [])
    ref = next((e for e in exchanges if e.get("referenceFlow")), None)
    if ref is None:
        ref = next((e for e in exchanges if e.get("dataSetInternalID") in ref_ids), None)
    if ref is None:
        raise OekobaudatError("Referenzfluss nicht gefunden")
    fp = next((p for p in ref.get("flowProperties", []) if p.get("referenceFlowProperty")), None)
    if fp is None:
        raise OekobaudatError("Bezugsgröße (reference flow property) nicht gefunden")
    unit = UNIT_ALIASES.get(str(fp.get("referenceUnit", "")).strip().lower().replace(" ", ""))
    if unit is None:
        raise OekobaudatError(f"Nicht unterstützte Bezugseinheit: {fp.get('referenceUnit')!r}")
    amount = float(fp.get("meanValue") or ref.get("resultingflowAmount") or 1.0)
    density = None
    for mp in ref.get("materialProperties", []):
        if mp.get("name") == "gross density":
            density = float(mp["value"])
    return unit, amount, density


def _gwp_total(data: dict, default_scenario: str | None) -> tuple[dict, dict, list[str]]:
    result = None
    for r in data["LCIAResults"]["LCIAResult"]:
        m = r["referenceToLCIAMethodDataSet"]
        names = " ".join(s.get("value", "") for s in m.get("shortDescription", []))
        if m.get("refObjectId") == GWP_TOTAL_ID or "GWP-total" in names:
            result = r
            break
    if result is None:
        raise OekobaudatError("Indikator GWP-total nicht im Datensatz")

    per_module: dict[str, list[tuple[str | None, float | None]]] = {}
    for a in result["other"]["anies"]:
        if "module" not in a:
            continue
        raw = a.get("value")
        val = None if raw in (None, "") else float(raw)
        per_module.setdefault(a["module"], []).append((a.get("scenario"), val))

    notes: list[str] = []
    gwp: dict[str, float | None] = {}
    scen: dict[str, str] = {}
    for mod, entries in per_module.items():
        if len(entries) == 1:
            sc, val = entries[0]
        else:
            pick = next((e for e in entries if e[0] == default_scenario), None)
            if pick is None:
                pick = entries[0]
                notes.append(f"Modul {mod}: kein Default-Szenario deklariert, '{pick[0]}' gewählt")
            sc, val = pick
        gwp[mod] = val
        if sc:
            scen[mod] = sc

    # Betonstahl liefert A1, A2, A3 einzeln statt A1-A3
    if "A1-A3" not in gwp and all(k in gwp for k in ("A1", "A2", "A3")):
        parts = [gwp.pop(k) for k in ("A1", "A2", "A3")]
        gwp["A1-A3"] = None if any(p is None for p in parts) else sum(parts)
        for k in ("A1", "A2", "A3"):
            scen.pop(k, None)
        notes.append("A1-A3 = A1 + A2 + A3 (im Datensatz einzeln angegeben)")
    return gwp, scen, notes


@lru_cache(maxsize=None)
def load_epd(uuid: str) -> Epd:
    """Holt einen Datensatz live aus der ÖKOBAUDAT (pro Programmlauf einmal)."""
    data = _fetch_json(uuid)
    unit, amount, density = _reference(data)
    gwp, scen, notes = _gwp_total(data, _default_scenario(data))
    name = _text(data["processInformation"]["dataSetInformation"]["name"]["baseName"])
    return Epd(uuid=uuid, name=name, ref_unit=unit, ref_amount=amount, density_kg_m3=density,
               gwp=gwp, scenarios=scen, url=URL.format(uuid=uuid),
               fetched=datetime.now().strftime("%Y-%m-%d %H:%M:%S"), notes=notes)
