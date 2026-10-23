"""Web-App Backend: Carbon-Inventur Pavillon Stockerau."""
import json, os, shutil, csv
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Carbon-Inventur Pavillon Stockerau")
HERE = Path(__file__).parent

# Plotly.js lokal bereitstellen
static_dir = HERE / "static"
static_dir.mkdir(exist_ok=True)
plotly_src = HERE.parent / ".venv" / "Lib" / "site-packages" / "plotly" / "package_data" / "plotly.min.js"
if plotly_src.exists():
    dest = static_dir / "plotly.min.js"
    if not dest.exists():
        shutil.copy2(plotly_src, dest)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Daten laden
with open(HERE.parent / "data" / "staebe_mit_co2.json") as f:
    co2_data = json.load(f)
with open(HERE.parent / "data" / "staebe_mit_querschnitt.json") as f:
    qs_data = json.load(f)
with open(HERE.parent / "data" / "staebe_linecurves.csv", encoding="utf-8-sig") as f:
    lc_reader = csv.DictReader(f)
    lc_data = {r["uuid"]: r for r in lc_reader}

qs_lookup = {r["lc_uuid"]: r for r in qs_data}

members = []
for c in co2_data:
    geo = lc_data.get(c["lc_uuid"], {})
    q = qs_lookup.get(c["lc_uuid"], {})
    members.append({
        "uuid": c["lc_uuid"], "layer": c["layer"], "material": c["material"],
        "datensatz": c["datensatz"],
        "volumen_m3": c["volumen_m3"], "masse_kg": c["masse_kg"], "laenge_m": c["laenge_m"],
        "co2_A1A3": c["co2_A1A3_kg"], "co2_C": c["co2_C_sum_kg"], "co2_D": c["co2_D_kg"],
        "bewehrung_co2": c["bewehrung_co2_A1A3_kg"],
        "fx": float(geo.get("from_x",0)), "fy": float(geo.get("from_y",0)), "fz": float(geo.get("from_z",0)),
        "tx": float(geo.get("to_x",0)), "ty": float(geo.get("to_y",0)), "tz": float(geo.get("to_z",0)),
        "dicke_m": q.get("dicke_m",0) or 0, "breite1_m": q.get("breite1_m",0) or 0, "breite2_m": q.get("breite2_m",0) or 0,
    })

# Alternative Datensaetze
ALTERNATIVEN = {
    "Baustahl S355JR": {"name":"Baustahl Grobblech","uuid":"04d1311a-ae38-4bfb-8e11-8992f1ddb14f","A1-A3":2.528984,"C":0.004848,"D":-1.467394,"bezug":"kg"},
    "Beton C25/30": {"name":"Beton C25/30 EcoPact","uuid":"69dc12cf-ce4d-4251-8ea3-330ed72f2f79","A1-A3":0.043798,"C":0.009681,"D":-0.004122,"bezug":"m3"},
}

@app.get("/", response_class=HTMLResponse)
async def index():
    return (HERE / "templates" / "index.html").read_text(encoding="utf-8")

@app.get("/api/members")
async def get_members():
    return {"members": members, "total": len(members)}

@app.get("/api/alternatives")
async def get_alternatives():
    return ALTERNATIVEN