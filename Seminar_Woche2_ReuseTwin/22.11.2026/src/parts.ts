// Der Katalog: jedes Element jedes geladenen Modells in einer Liste, fertig für die Bauteiltabelle.
//
// Er liest nur, was der Core aus der IFC gelesen hat (model.json), und behält die Belegklasse jedes
// Werts: was die Datei sagt (source), was der Core aus der Geometrie berechnet hat (computed) und was
// gar nicht da ist (unknown). Nichts wird erfunden: ein fehlender Wert bleibt fehlend.
//
// Die deutschen Bezeichnungen kommen aus src/de.ts – dort steht, wie aus IFC-Klasse, PredefinedType,
// Objekttyp, Name, Material und Eigenschaften ein deutscher Fachbegriff wird. Die Originaldaten
// bleiben unverändert erhalten und stehen in den Details weiterhin zur Verfügung.
//
// Ein Element ist über Modell und IFC-Key eindeutig identifiziert (Modell + NUL + Key) – der Key
// allein ist über Modelle hinweg nicht eindeutig, zwei Dateien hier teilen sich GlobalIds.
import type { IngestResult, SourceElement } from "./api";
import {
  asBool, hasForeignTerm, materialLabel, modelCode, naming, storeyLabel,
  type MaterialFacts, type MaterialLabel, type Naming, type StoreyLabel,
} from "./de";

/** Wie ein Wert belegt ist – dieselben Klassen, die die App in ihrer Legende zeigt. */
export type Evidence = "source" | "computed" | "unknown";

export interface Value {
  /** Der Wert selbst, oder null, wenn die IFC ihn nicht hat. */
  value: string | number | boolean | null;
  evidence: Evidence;
  /** Warum er berechnet ist. */
  note?: string;
}

/** Eine Materialschicht mit ihrem deutschen Namen. */
export interface Layer {
  /** Der ursprüngliche Materialname aus der Datei. */
  material: string;
  /** Der deutsche Name, soweit er sich sicher bestimmen lässt. */
  label: string;
  /** Die Dicke in Metern. */
  thickness: number | null;
}

/** Ein Element eines Modells, mit allem, was die Tabelle zeigt. */
export interface Part {
  /** Eindeutig über alle Modelle: das Modell und der IFC-Key. */
  id: string;
  /** Das Modell, zu dem das Element gehört (sein Ordner in out/). */
  model: string;
  /** Das kurze Kürzel des Modells, z. B. „ARC". */
  modelCode: string;
  /** Der Dateiname des Modells, für die Leserin und den Leser. */
  modelFile: string;
  /** Der IFC-Key (die GlobalId) – eindeutig innerhalb des Modells. */
  key: string;
  globalId: string;
  /** Der ursprüngliche Name aus der Datei. */
  name: string;
  /** Der ursprüngliche ObjectType (der Familienname), wenn die Datei einen nennt. */
  objectType: string | null;
  /** Der Name des Typs (der Bauteilfamilie), wenn die Datei einen nennt. */
  typeName: string | null;
  /** Die IFC-Klasse, unverändert. */
  ifcClass: string;
  predefinedType: string | null;
  /** Die deutsche Bezeichnung: Typ, Beleg und Grundtyp. */
  naming: Naming;
  /** Der deutsche Typ, z. B. „Außenwand". */
  type: string;
  /** Der kurze Anzeigename: Typ und Planbezug, z. B. „Außenwand N3". */
  displayName: string;
  /** Der volle Anzeigename: Typ und Geschoss, z. B. „Außenwand – Ebene 00 · OK Geschoss". */
  fullName: string;
  /** Der Planbezug aus der Datei (die Eigenschaft Reference), wenn die Datei einen nennt. */
  reference: string | null;
  /** Das Geschoss, in dem das Element liegt (sein Name), null wenn die Datei es nicht sagt. */
  storey: string | null;
  /** Der Geschossschlüssel: in jedem Modell desselben Gebäudes derselbe. */
  storeyKey: string | null;
  /** Der deutsche Geschossname. */
  storeyLabel: StoreyLabel;
  /** Das Gebäude, zu dem das Geschoss gehört. */
  building: string | null;
  /** Die Höhe dieses Geschosses über der Bezugsebene, in Metern (vom Core berechnet). */
  storeyElevation: number | null;
  /** Das zugewiesene Material (ursprünglicher Name), null wenn keines da ist. */
  material: string | null;
  /** Der deutsche Materialname. */
  materialLabel: MaterialLabel;
  /** Die Schichten des Materials mit ihrer Dicke in Metern. */
  layers: Layer[];
  /** Die Gesamtdicke des Schichtaufbaus in Metern. */
  thickness: number | null;
  /** Die Maße des Elements in seinem eigenen lokalen System, in Metern (vom Core berechnet). */
  length: Value;
  width: Value;
  height: Value;
  /** Die Oberfläche des Elements in Quadratmetern (berechnet). */
  area: Value;
  /** Das Volumen des Elements in Kubikmetern (berechnet, nur für geschlossene Körper). */
  volume: Value;
  /** Ob das Element Last trägt. */
  loadBearing: Value;
  /** Ob das Element außen liegt. */
  isExternal: Value;
  /** Der Feuerwiderstand, wenn die Datei einen nennt. */
  fireRating: Value;
  /** Der Wärmedurchgangskoeffizient, wenn die Datei einen nennt. */
  thermalTransmittance: Value;
  /** Alle Property-Sets des Elements, für die Details. */
  psets: { pset: string; name: string; value: string }[];
  /** Ob das Element Geometrie in der 3D-Ansicht hat. */
  hasGeometry: boolean;
}

/** Ein Modell im Katalog. */
export interface CatalogueModel {
  label: string;
  /** Das kurze Kürzel, z. B. „ARC". */
  code: string;
  file: string;
  schema: string;
  units: { length: string | null; area: string | null; volume: string | null; lengthToM: number };
  partCount: number;
}

const NONE: Value = { value: null, evidence: "unknown" };

/** Die eindeutige Id eines Elements über alle Modelle hinweg. */
export function partId(model: string, key: string): string {
  return `${model}\0${key}`;
}

/** Zerlegt eine Element-Id wieder in Modell und IFC-Key. */
export function splitPartId(id: string): { model: string; key: string } {
  const i = id.indexOf("\0");
  return i < 0 ? { model: "", key: id } : { model: id.slice(0, i), key: id.slice(i + 1) };
}

/** Der Text eines Werts, wie er in der Datei steht. */
function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}
/** Das Geschoss, in dem ein Element liegt, mit dem Gebäude darüber. */
function storeyOf(el: SourceElement, spatial: Map<string, IngestResult["spatial"][number]>):
  { storey: string | null; storeyKey: string | null; building: string | null; elevation: number | null } {
  const node = el.container_key ? spatial.get(el.container_key) : undefined;
  if (!node) return { storey: null, storeyKey: null, building: null, elevation: null };
  let building: string | null = null;
  let parent = node.parent_key ? spatial.get(node.parent_key) : undefined;
  if (parent && parent.ifc_class === "IfcBuilding") building = parent.name || parent.long_name || null;
  if (!building) {
    // Das Gebäude kann über die Site benannt sein – sonst bleibt es neutral.
    const site = parent?.parent_key ? spatial.get(parent.parent_key) : undefined;
    if (site && site.ifc_class === "IfcSite") building = site.name && site.name !== "Default" ? site.name : null;
  }
  return {
    storey: node.name || node.long_name || null,
    storeyKey: node.key,
    building: building && building.trim() ? building : null,
    elevation: node.elevation_m ?? null,
  };
}

/** Die Materialzuweisung eines Elements: die eigene, sonst die des Typs. */
function materialOf(el: SourceElement, types: Map<string, IngestResult["types"][number]>) {
  const own = el.material;
  const typed = el.type_key ? types.get(el.type_key)?.material : undefined;
  const src = own && own.kind && own.kind !== "none" ? own : typed && typed.kind !== "none" ? typed : own;
  const layers: Layer[] = (src?.layers ?? []).map((l) => {
    const facts: MaterialFacts = { name: l.material, kind: "single", members: [], layerCount: 1 };
    return { material: l.material ?? "", label: materialLabel(facts).label, thickness: l.thickness_m ?? null };
  });
  const facts: MaterialFacts = {
    name: src?.name ?? null,
    kind: src?.kind ?? null,
    members: src?.materials ?? [],
    layerCount: layers.length,
  };
  const label = materialLabel(facts);
  return { material: src?.name ?? null, label, layers, thickness: src?.total_thickness_m ?? null, facts };
}

/** Die Maße des Elements in seinem eigenen lokalen System (vom Core berechnet). */
function dimensions(el: SourceElement): { length: Value; width: Value; height: Value } {
  const e = el.geometry?.local_extent_m;
  if (!e || e.length !== 3 || !e.every((v) => Number.isFinite(v))) {
    const none: Value = { value: null, evidence: "unknown" };
    return { length: none, width: none, height: none };
  }
  const val = (v: number): Value => ({ value: v, evidence: "computed", note: "aus dem lokalen Quader berechnet" });
  return { length: val(e[0]), width: val(e[1]), height: val(e[2]) };
}

/** Die größte Fläche des Elements (die beiden größten Seiten des lokalen Quaders). */
function area(el: SourceElement): Value {
  const e = el.geometry?.local_extent_m;
  if (!e || e.length !== 3 || !e.every((v) => Number.isFinite(v))) return { value: null, evidence: "unknown" };
  const sorted = [...e].sort((a, b) => b - a);
  return { value: sorted[0] * sorted[1], evidence: "computed", note: "aus dem lokalen Quader berechnet" };
}

/** Das Volumen des Elements – nur für geschlossene Körper hat der Core eines. */
function volume(el: SourceElement): Value {
  const v = el.geometry?.volume_m3;
  if (typeof v !== "number" || !Number.isFinite(v)) return { value: null, evidence: "unknown" };
  return { value: v, evidence: "computed" };
}

/** Alle Property-Sets des Elements, flach. */
function allPsets(el: SourceElement): { pset: string; name: string; value: string }[] {
  const out: { pset: string; name: string; value: string }[] = [];
  for (const [pset, props] of Object.entries(el.psets ?? {})) {
    for (const [name, value] of Object.entries(props ?? {})) {
      if (value === null || value === undefined) continue;
      out.push({ pset, name, value: text(value) });
    }
  }
  return out;
}

/** Eine Eigenschaft in den Property-Sets des Elements. */
function findProp(el: SourceElement, name: string): unknown {
  for (const props of Object.values(el.psets ?? {})) {
    const v = (props ?? {})[name];
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * Der Planbezug aus der Datei – aber nur, wenn es wirklich einer ist. Die Eigenschaft Reference
 * trägt je nach Datei einen Achsbezug („N3"), eine Abkürzung („COL_") oder den ganzen Namen
 * („A1_anclajes metálicos"). Letzteres gehört in die Details, nicht in die Tabellenspalte.
 */
function planReference(reference: string | null): string | null {
  if (!reference) return null;
  const r = reference.trim();
  if (!r || r.length > 10) return null;            // zu lang für einen Planbezug
  if (/\s/.test(r)) return null;                    // ein Maß oder ein Name mit Wörtern
  if (/\d\s*[xX×]\s*\d/.test(r)) return null;       // ein Querschnitt, kein Bezug
  if (/\.[a-z]{2,4}$/i.test(r)) return null;        // ein Dateiname
  if (/^[0-9.]+$/.test(r)) return null;              // nur Zahlen
  if (hasForeignTerm(r)) return null;                // ein Name in fremder Sprache, kein Bezug
  return r;
}

/** Der kurze Anzeigename: der deutsche Typ und der Planbezug aus der Datei. */
function shortName(type: string, reference: string | null): string {
  const r = planReference(reference);
  return r ? `${type} ${r}` : type;
}

/** Macht aus einem Element des Modells einen Eintrag im Katalog. */
function toPart(
  el: SourceElement,
  label: string,
  file: string,
  spatial: Map<string, IngestResult["spatial"][number]>,
  types: Map<string, IngestResult["types"][number]>,
): Part {
  const { storey, storeyKey, building, elevation } = storeyOf(el, spatial);
  const mat = materialOf(el, types);
  const dims = dimensions(el);
  const psets = allPsets(el);
  const prop = (name: string): Value => {
    const v = findProp(el, name);
    if (v === undefined || v === null) return NONE;
    if (typeof v === "boolean" || typeof v === "number") return { value: v, evidence: "source" };
    return { value: text(v), evidence: "source" };
  };
  const isExternal = asBool(prop("IsExternal").value);
  const loadBearing = asBool(prop("LoadBearing").value);
  const nm = naming({
    ifcClass: el.ifc_class,
    predefinedType: el.predefined_type ?? null,
    objectType: el.object_type ?? null,
    name: el.name ?? null,
    material: mat.facts,
    isExternal,
    loadBearing,
  });
  const st = storeyLabel(storey);
  const reference = (() => {
    const v = findProp(el, "Reference");
    return typeof v === "string" && v.trim() ? v.trim() : null;
  })();
  const typeName = el.type_key ? types.get(el.type_key)?.name ?? null : null;
  return {
    id: partId(label, el.key),
    model: label,
    modelCode: modelCode(label),
    modelFile: file,
    key: el.key,
    globalId: el.global_id ?? el.key,
    name: el.name || el.tag || el.key,
    objectType: el.object_type ?? null,
    typeName,
    ifcClass: el.ifc_class,
    predefinedType: el.predefined_type ?? null,
    naming: nm,
    type: nm.type,
    displayName: shortName(nm.type, reference),
    fullName: `${nm.type} – ${st.label}`,
    reference,
    storey,
    storeyKey,
    storeyLabel: st,
    building,
    storeyElevation: elevation,
    material: mat.material,
    materialLabel: mat.label,
    layers: mat.layers,
    thickness: mat.thickness,
    ...dims,
    area: area(el),
    volume: volume(el),
    loadBearing: prop("LoadBearing"),
    isExternal: prop("IsExternal"),
    fireRating: prop("FireRating"),
    thermalTransmittance: prop("ThermalTransmittance"),
    psets,
    hasGeometry: el.geometry?.status === "ok",
  };
}

/** Macht aus dem model.json eines Modells seine Einträge im Katalog. */
function partsOf(label: string, file: string, m: IngestResult): Part[] {
  const spatial = new Map(m.spatial.map((s) => [s.key, s]));
  const types = new Map(m.types.map((t) => [t.key, t]));
  return m.elements.map((el) => toPart(el, label, file, spatial, types));
}
/**
 * Der Katalog aller geladenen Modelle. Die model.json-Dateien liest der Aufrufer einmal (die Seite
 * behält sie), so lässt sich die Tabelle neu aufbauen – filtern, sortieren, andere Ansichten – ohne
 * die Dateien noch einmal zu holen.
 */
export class Parts {
  private readonly byId = new Map<string, Part>();

  /** Die Bauteile aller Modelle, in der Reihenfolge, in der die Modelle geladen wurden. */
  parts: Part[] = [];
  models: CatalogueModel[] = [];
  /** Die deutschen Bauteiltypen, die die Filter anbieten. */
  types: string[] = [];
  /** Die deutschen Materialnamen, die die Filter anbieten. */
  materials: string[] = [];
  /** Die deutschen Geschossnamen, die die Filter anbieten. */
  storeys: string[] = [];

  /** Nimmt ein Modell in den Katalog auf (sein model.json ist schon gelesen). */
  add(label: string, file: string, schema: string, units: CatalogueModel["units"], m: IngestResult): void {
    const parts = partsOf(label, file, m);
    this.parts.push(...parts);
    for (const part of parts) this.byId.set(part.id, part);
    this.models.push({ label, code: modelCode(label), file, schema, units, partCount: parts.length });
    this.reindex();
  }

  /** Die Listen, die die Filter anbieten. */
  private reindex(): void {
    const types = new Set<string>();
    const materials = new Set<string>();
    const storeys = new Set<string>();
    for (const p of this.parts) {
      types.add(p.type);
      if (p.material) materials.add(p.materialLabel.label);
      if (p.storey) storeys.add(p.storeyLabel.label);
    }
    this.types = [...types].sort((a, b) => a.localeCompare(b, "de"));
    this.materials = [...materials].sort((a, b) => a.localeCompare(b, "de"));
    this.storeys = [...storeys].sort((a, b) => a.localeCompare(b, "de"));
  }

  /** Ein Element nach seiner eindeutigen Id. */
  get(id: string): Part | undefined {
    return this.byId.get(id);
  }

  /** Ein Element nach Modell und IFC-Key. */
  find(model: string, key: string): Part | undefined {
    return this.byId.get(partId(model, key));
  }
}

/** Die Einheiten eines Modells, für die Kopfzeile der Tabelle. */
export function unitsOf(u: IngestResult["units"]): CatalogueModel["units"] {
  return {
    length: u.length_unit,
    area: u.area_unit,
    volume: u.volume_unit,
    lengthToM: u.length_to_m,
  };
}