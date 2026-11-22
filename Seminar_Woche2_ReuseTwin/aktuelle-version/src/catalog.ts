// Der Bauteilkatalog: alle geometrisch verfuegbaren Bauteile der geladenen Modelle, aus ihrem
// Gebaeudeverband herausgeloest und wie in einem Bauteillager geordnet.
//
// Die Ordnung folgt vier Ebenen: Kategorie (nach Funktion/IFC-Klasse), Material, Bauteiltyp und
// Geometrie, dann die Groesse. Innerhalb einer Gruppe stehen gleiche Bauteile unmittelbar
// nebeneinander, aehnliche in benachbarten Gruppen.
//
// Wichtig: der Katalog aendert nichts an den Daten. Die Bauteile bekommen nur eine zusaetzliche,
// temporaere Verschiebung und Drehung fuer das Bild (wie die Explosionsdarstellung); beim
// Zuruecksetzen ueber die Gebaeudeansicht stehen sie exakt wieder an ihrer IFC-Position.
//
// Die Abmessungen kommen aus der Geometrie selbst (nicht aus der Welt-Bounding-Box, die bei
// gedrehten Bauteilen viel zu gross waere) - so bleiben die echten Proportionen erhalten.

import type { Part, Parts } from "./parts";
import type { ElementFrame } from "./viewer";

/** Die Kategorien des Katalogs, in der Reihenfolge der Regale. */
export type Category = "column" | "beam" | "wall" | "slab" | "roof" | "window" | "door" | "stair" | "furniture" | "other";

/** Der deutsche Name einer Kategorie. */
export const CATEGORY_NAMES: Record<Category, string> = {
  column: "Stützen",
  beam: "Träger",
  wall: "Wände",
  slab: "Decken und Bodenplatten",
  roof: "Dächer",
  window: "Fenster",
  door: "Türen",
  stair: "Treppen",
  furniture: "Einrichtungen",
  other: "Sonstige Bauteile",
};

/** Die Reihenfolge der Regale. */
export const CATEGORY_ORDER: Category[] = [
  "column", "beam", "wall", "slab", "roof", "window", "door", "stair", "furniture", "other",
];

// --- Die Kategorie eines Bauteils -----------------------------------------------------------------------
// Die verlaesslichste Grundlage ist die IFC-Klasse: die steht in der Datei und wird nicht aus einem
// Namen geraten. Nur fuer die Bauteile ohne eigene Klasse - vor allem die Proxys - entscheidet der
// deutsche Typname, der aus Klasse, Typname und Material abgeleitet ist (src/de.ts).

/** Welche IFC-Klasse zu welcher Kategorie gehoert. */
const CATEGORY_BY_CLASS: Record<string, Category> = {
  IfcColumn: "column", IfcColumnStandardCase: "column",
  IfcBeam: "beam", IfcBeamStandardCase: "beam",
  IfcMember: "beam", IfcMemberStandardCase: "beam",
  IfcWall: "wall", IfcWallStandardCase: "wall", IfcWallElementCase: "wall", IfcCurtainWall: "wall",
  IfcSlab: "slab", IfcSlabStandardCase: "slab", IfcSlabElementedCase: "slab",
  IfcFooting: "slab", IfcPile: "slab",
  IfcRoof: "roof",
  IfcWindow: "window",
  IfcDoor: "door",
  IfcStair: "stair", IfcStairFlight: "stair", IfcRamp: "stair", IfcRampFlight: "stair",
  IfcFurniture: "furniture", IfcFurnishingElement: "furniture", IfcSystemFurnitureElement: "furniture",
};

/**
 * Der PredefinedType kann die Klasse praezisieren: ein Pfosten ist eine Stuetze, ein Deckentraeger
 * ein Traeger. Die Klasse allein sagt das nicht.
 */
const CATEGORY_BY_PREDEFINED: Record<string, Category> = {
  COLUMN: "column", POST: "column", PIER: "column",
  BEAM: "beam", STRUT: "beam", MEMBER: "beam", CHORD: "beam", JOIST: "beam",
};

/**
 * Die Art am Ende des deutschen Typs - der Notfall fuer die Proxys, die keine eigene IFC-Klasse
 * haben: aus "Holztraeger" wird "Traeger", aus "Geschossdecke" wird "Decke". Laengste zuerst, damit
 * "Bodenplatte" vor "Decke" kommt.
 */
const SUFFIXES: [string, Category][] = Object.entries({
  "Vorhangfassade": "wall", "Trennwand": "wall", "Bodenplatte": "slab", "Geschossdecke": "slab",
  "Dachdecke": "slab", "Einrichtung": "furniture", "Heizkörper": "furniture", "Dachfenster": "window",
  "Stütze": "column", "Pfeiler": "column", "Träger": "beam", "Unterzug": "beam", "Stürze": "beam",
  "Wand": "wall", "Fassade": "wall", "Decke": "slab", "Dach": "roof", "Fenster": "window",
  "Tür": "door", "Tor": "door", "Treppe": "stair", "Möbel": "furniture", "Schrank": "furniture",
} as Record<string, Category>).sort((a, b) => b[0].length - a[0].length);

/**
 * Die Kategorie eines Bauteils: zuerst die IFC-Klasse (mit dem PredefinedType), dann - nur wenn es
 * keine gibt - der deutsche Typname.
 */
export function categoryOf(part: Part): Category {
  const byClass = CATEGORY_BY_CLASS[part.ifcClass];
  if (byClass) {
    const pre = part.predefinedType ? CATEGORY_BY_PREDEFINED[part.predefinedType.toUpperCase()] : undefined;
    return pre ?? byClass;
  }
  // Gross-/Kleinschreibung egal: im deutschen Kompositum steht der Anfangsbuchstabe klein
  // ("Holzträger" endet auf "träger").
  const type = part.type.toLowerCase();
  for (const [word, category] of SUFFIXES) {
    if (type.endsWith(word.toLowerCase())) return category;
  }
  return "other";
}

// --- Die Abstaende und Toleranzen -----------------------------------------------------------------------

/** Der Abstand zwischen zwei Bauteilen in einer Reihe (Meter). */
const GAP = 0.3;
/** Der Abstand zwischen zwei Materialgruppen (Meter). */
const GROUP_GAP = 2.5;
/** Der Abstand zwischen zwei Bauteilkategorien (Meter). */
const CATEGORY_GAP = 5;
/** Die Zielbreite einer Reihe: danach geht es in die naechste Reihe (Meter). */
const ROW_WIDTH = 56;
/** Die Mass-Toleranz: zwei Bauteile gelten als gleich, wenn sie um weniger als 1 mm abweichen. */
const EXACT_TOLERANCE = 0.001;
/** Die aehnliche Toleranz: bis hierher werden Proportionen als gleich beschrieben. */
const SIMILAR_TOLERANCE = 0.03;

/**
 * Die Zielrichtung der drei Ausdehnungen eines Bauteils im Katalog: die Szenenachse (0 = X,
 * 1 = Y, 2 = Z), in die die senkrechte Ausdehnung, die Laenge und die Breite zeigen sollen.
 *
 * Die Ausdehnungen werden nicht ueber die lokalen Achsen des Bauteils benannt, sondern ueber ihre
 * Groesse und ihre Lage: die senkrechte Ausdehnung ist die, die in der Szene nach oben zeigt. So
 * stimmt die Zuordnung, egal ob das Modell die Platzierung in die Geometrie gerechnet hat oder
 * nicht - die beiden Testmodelle machen es unterschiedlich.
 */
const CANONICAL: Record<Category, { vertical: number; length: number; width: number }> = {
  column: { vertical: 1, length: 0, width: 2 },   // steht senkrecht
  beam: { vertical: 2, length: 0, width: 1 },     // liegt flach: die Breite zeigt nach oben
  wall: { vertical: 1, length: 0, width: 2 },     // steht aufrecht
  slab: { vertical: 1, length: 0, width: 2 },     // liegt flach: die Dicke zeigt nach oben
  roof: { vertical: 1, length: 0, width: 2 },
  window: { vertical: 1, length: 0, width: 2 },
  door: { vertical: 1, length: 0, width: 2 },
  stair: { vertical: 1, length: 0, width: 2 },
  furniture: { vertical: 1, length: 0, width: 2 },
  other: { vertical: 1, length: 0, width: 2 },
};

/** Ein Bauteil im Katalog. */
export interface CatalogItem {
  /** Die eindeutige Id: Modell + NUL + IFC-Key. */
  id: string;
  model: string;
  key: string;
  /** Der Eintrag im Katalog aus src/parts.ts. */
  part: Part;
  category: Category;
  /** Der Schluessel der Materialgruppe. */
  materialKey: string;
  /** Der deutsche Name der Materialgruppe. */
  materialLabel: string;
  /** Der Schluessel der Geometriegruppe (Typ und Masse). */
  geometryKey: string;
  /** Der deutsche Name der Geometriegruppe. */
  geometryLabel: string;
  /** True, wenn die Masse nachgewiesen gleich sind (innerhalb von 1 mm). */
  identical: boolean;
  /** Die Masse des Bauteils im eigenen System: Laenge, Breite, Hoehe (Meter). */
  dims: [number, number, number];
  /** Das Volumen (Kubikmeter), fuer die Groessenreihenfolge. */
  volume: number;
  /** Die Mitte der Geometrie in der Szene. */
  centre: [number, number, number];
  /** Die Richtung der lokalen Achsen in der Szene. */
  axes: ElementFrame["axes"];
  /** Der Platz im Katalog: die untere linke Ecke (Meter). */
  slot: [number, number, number];
  /** Die halben Masse in der Katalogorientierung (X, Y, Z). */
  half: [number, number, number];
  /** Die Drehmatrix, die das Bauteil in die Katalogorientierung bringt (Spaltenmajor). */
  rotation: number[];
}

export type CatalogSort = "standard" | "material" | "storey" | "size";

export interface CatalogFilters {
  model: string;
  category: Category | "";
  material: string;
  storey: string;
  type: string;
  loadBearing: "all" | "true" | "false";
  lengthMin: number | null;
  lengthMax: number | null;
  widthMin: number | null;
  widthMax: number | null;
  heightMin: number | null;
  heightMax: number | null;
  volumeMin: number | null;
  volumeMax: number | null;
}

export const EMPTY_CATALOG_FILTERS: CatalogFilters = {
  model: "", category: "", material: "", storey: "", type: "", loadBearing: "all",
  lengthMin: null, lengthMax: null, widthMin: null, widthMax: null,
  heightMin: null, heightMax: null, volumeMin: null, volumeMax: null,
};

export function filterCatalog(items: CatalogItem[], filters: CatalogFilters): CatalogItem[] {
  return items.filter((item) => {
    const p = item.part;
    if (filters.model && p.model !== filters.model) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.material && p.materialLabel.label !== filters.material) return false;
    if (filters.storey && p.storeyLabel.label !== filters.storey) return false;
    if (filters.type && p.type !== filters.type) return false;
    if (filters.loadBearing !== "all") {
      if (p.loadBearing.value === null) return false;
      if (filters.loadBearing === "true" && p.loadBearing.value !== true) return false;
      if (filters.loadBearing === "false" && p.loadBearing.value !== false) return false;
    }
    const valueInRange = (value: number | null, min: number | null, max: number | null): boolean =>
      (min === null || (value !== null && value >= min)) &&
      (max === null || (value !== null && value <= max));
    const length = typeof p.length.value === "number" ? p.length.value : null;
    const width = typeof p.width.value === "number" ? p.width.value : null;
    const height = typeof p.height.value === "number" ? p.height.value : null;
    if (!valueInRange(length, filters.lengthMin, filters.lengthMax)) return false;
    if (!valueInRange(width, filters.widthMin, filters.widthMax)) return false;
    if (!valueInRange(height, filters.heightMin, filters.heightMax)) return false;
    if (typeof p.volume.value === "number") {
      if (!valueInRange(p.volume.value, filters.volumeMin, filters.volumeMax)) return false;
    } else if (filters.volumeMin !== null || filters.volumeMax !== null) {
      return false;
    }
    return true;
  });
}

export function sortCatalog(items: CatalogItem[], sort: CatalogSort): CatalogItem[] {
  const sizeOf = (item: CatalogItem): number[] => [...item.dims].sort((a, b) => b - a);
  return [...items].sort((a, b) => {
    if (sort === "material") {
      return a.materialLabel.localeCompare(b.materialLabel, "de") ||
        CATEGORY_NAMES[a.category].localeCompare(CATEGORY_NAMES[b.category], "de") ||
        a.geometryKey.localeCompare(b.geometryKey, "de");
    }
    if (sort === "storey") {
      return (a.part.storeyLabel.label).localeCompare(b.part.storeyLabel.label, "de") ||
        CATEGORY_NAMES[a.category].localeCompare(CATEGORY_NAMES[b.category], "de") ||
        a.materialLabel.localeCompare(b.materialLabel, "de");
    }
    if (sort === "size") {
      const aa = sizeOf(a), bb = sizeOf(b);
      for (let i = 0; i < 3; i++) if (Math.abs(aa[i] - bb[i]) > EXACT_TOLERANCE) return aa[i] - bb[i];
      return CATEGORY_NAMES[a.category].localeCompare(CATEGORY_NAMES[b.category], "de");
    }
    return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.materialLabel.localeCompare(b.materialLabel, "de") ||
      a.geometryKey.localeCompare(b.geometryKey, "de") ||
      a.id.localeCompare(b.id);
  });
}

/**
 * Die Materialgruppe eines Bauteils. Bei einem Schichtaufbau bestimmt der Aufbau die Gruppe, nicht
 * nur sein Name: "Standardwand (2 Schichten)" gibt es in mehreren Ausfuehrungen, und die gehoeren
 * nicht in dieselbe Gruppe. Ein Hauptmaterial wird nicht erfunden - der Aufbau steht in der Gruppe.
 */
function materialOf(part: Part): { key: string; label: string } {
  if (!part.material) return { key: "ohne", label: "Ohne Material" };
  if (part.layers.length > 1) {
    const key = part.layers.map((l) => `${l.material}|${l.thickness ?? ""}`).join("/");
    const text = part.layers
      .map((l) => (l.thickness !== null ? `${l.label} ${Math.round(l.thickness * 1000)} mm` : l.label))
      .join(" / ");
    return { key: `set:${part.material}|${key}`, label: `${part.materialLabel.label} – ${text}` };
  }
  return { key: `mat:${part.material}`, label: part.materialLabel.label };
}

/**
 * Die Geometriegruppe: gleicher Typ und gleiche Masse (auf den Millimeter genau). Damit stehen gleiche
 * Bauteile unmittelbar nebeneinander. Gleiche Typen mit anderen Massen kommen in benachbarte Gruppen,
 * weil die Gruppen nach der Groesse sortiert werden. Die Masse sind sortiert, damit die Reihenfolge
 * der lokalen Achsen keine Rolle spielt.
 */
function geometryOf(part: Part, dims: [number, number, number]): { key: string; label: string } {
  const q = (v: number) => Math.round(v / EXACT_TOLERANCE) * EXACT_TOLERANCE;
  const sorted = [...dims].sort((a, b) => b - a);
  const key = `${part.type}|${q(sorted[0]).toFixed(3)}|${q(sorted[1]).toFixed(3)}|${q(sorted[2]).toFixed(3)}`;
  // Die Proportionen auf ein Raster von SIMILAR_TOLERANCE runden: aehnliche Proportionen bekommen
  // dieselbe Formbeschreibung, ohne dass jede kleine Abweichung eine eigene Gruppe macht.
  const max = sorted[0] || 1;
  const step = SIMILAR_TOLERANCE * 100;
  const ratio = (v: number) => Math.round(((v / max) * 100) / step) * step;
  const label = `${part.type} · ${dims.map((v) => v.toFixed(2)).join(" × ")} m (1 : ${ratio(sorted[1])} : ${ratio(sorted[2])})`;
  return { key, label };
}

/** Eine 3x3-Matrix, spaltenweise abgelegt (wie three.js). */
type M3 = number[];

/** Multipliziert zwei 3x3-Matrizen (spaltenweise). */
function mul3(a: M3, b: M3): M3 {
  const out = new Array<number>(9).fill(0);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += a[k * 3 + row] * b[col * 3 + k];
      out[col * 3 + row] = sum;
    }
  }
  return out;
}

/** Multipliziert einen Vektor mit einer 3x3-Matrix. */
function mulV(m: M3, v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

/** Die Determinante einer 3x3-Matrix. */
function det3(m: M3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[3] * (m[1] * m[8] - m[2] * m[7]) +
    m[6] * (m[1] * m[5] - m[2] * m[4])
  );
}

/** Die Katalogorientierung eines Bauteils: welche Szenenachse zeigen die drei Ausdehnungen am Ende? */
export interface Orientation {
  /** Die Szenenachse fuer jede der drei lokalen Achsen. */
  target: [number, number, number];
  /** Die halben Masse in der Katalogorientierung (X, Y, Z). */
  half: [number, number, number];
}

/** Die Katalogorientierung eines Bauteils bestimmen. */
export function orientationOf(
  category: Category,
  axes: ElementFrame["axes"],
  half: [number, number, number],
): Orientation {
  // Welche lokale Achse zeigt in der Szene nach oben?
  const dirs = [axes.x, axes.y, axes.z];
  let vertical = 2;
  let best = -Infinity;
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(dirs[i][1]);
    if (d > best) { best = d; vertical = i; }
  }
  // Die beiden anderen: die groessere ist die Laenge, die kleinere die Breite.
  const rest = [0, 1, 2].filter((i) => i !== vertical).sort((a, b) => half[b] - half[a]);
  const rule = CANONICAL[category];
  const target: [number, number, number] = [0, 0, 0];
  target[vertical] = rule.vertical;
  target[rest[0]] = rule.length;
  target[rest[1]] = rule.width;
  // Die halben Masse in der Katalogorientierung.
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[target[i]] = half[i];
  return { target, half: out };
}

/**
 * Die Drehung, die das Bauteil in die Katalogorientierung bringt: die lokalen Achsen zeigen danach in
 * die Szenenrichtungen, die fuer die Kategorie festgelegt sind. Die Drehung ist immer eine echte
 * Drehung (keine Spiegelung, keine Skalierung); dafuer wird im Zweifel die duennste Ausdehnung
 * umgekehrt - das sieht man bei einem Bauteil am wenigsten.
 */
function rotationFor(
  axes: ElementFrame["axes"],
  half: [number, number, number],
  target: [number, number, number],
): M3 {
  const current: M3 = [
    axes.x[0], axes.x[1], axes.x[2],
    axes.y[0], axes.y[1], axes.y[2],
    axes.z[0], axes.z[1], axes.z[2],
  ];
  // Die Zielmatrix: die Spalte i ist die Szenenachse, in die die lokale Achse i zeigen soll.
  const goal: M3 = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) goal[i * 3 + target[i]] = 1;
  if (det3(goal) < 0) {
    // Die Vertauschung wuerde spiegeln: die duennste Ausdehnung wird umgekehrt.
    let thin = 0;
    for (let i = 1; i < 3; i++) if (half[i] < half[thin]) thin = i;
    goal[thin * 3 + target[thin]] = -1;
  }
  // R = Ziel · Current^T (die Current-Matrix ist orthonormal, ihre Transponierte ist die Inverse).
  const inv: M3 = [current[0], current[3], current[6], current[1], current[4], current[7], current[2], current[5], current[8]];
  return mul3(goal, inv);
}

/**
 * Baut den Katalog aus dem Katalog der Bauteile (src/parts.ts) und den Rahmen aus dem Viewer.
 * Es kommen nur Bauteile hinein, die Geometrie haben - genau die, die auch im 3D zu sehen sind.
 */
export function buildCatalog(parts: Parts, frames: Map<string, Map<string, ElementFrame>>): CatalogItem[] {
  const items: CatalogItem[] = [];
  for (const part of parts.parts) {
    const frame = frames.get(part.model)?.get(part.key);
    if (!frame) continue; // kein Bauteil im 3D (ohne Geometrie)
    const half: [number, number, number] = [
      (frame.max[0] - frame.min[0]) / 2,
      (frame.max[1] - frame.min[1]) / 2,
      (frame.max[2] - frame.min[2]) / 2,
    ];
    const dims: [number, number, number] = [half[0] * 2, half[1] * 2, half[2] * 2];
    const category = categoryOf(part);
    const orientation = orientationOf(category, frame.axes, half);
    const material = materialOf(part);
    const geometry = geometryOf(part, dims);
    items.push({
      id: part.id, model: part.model, key: part.key, part, category,
      materialKey: material.key, materialLabel: material.label,
      geometryKey: geometry.key, geometryLabel: geometry.label,
      identical: true, dims, volume: part.volume.value === null ? 0 : Number(part.volume.value),
      centre: frame.centre, axes: frame.axes,
      slot: [0, 0, 0],
      half: orientation.half,
      rotation: rotationFor(frame.axes, half, orientation.target),
    });
  }
  return items;
}

/** Eine Beschriftung im Katalog: eine Kategorie oder eine Materialgruppe. */
export interface CatalogLabel {
  text: string;
  kind: "category" | "material";
  /** Wo die Beschriftung steht (in der Szene). */
  at: [number, number, number];
}

/**
 * Ordnet den Katalog wie ein Bauteillager: erst nach Kategorie, dann nach Material, dann nach
 * Bauteiltyp und Geometrie, dann nach der Groesse. Innerhalb einer Gruppe stehen die Bauteile
 * nebeneinander in einer Reihe; passt eine Gruppe nicht mehr in die Reihe, geht es in die naechste -
 * die dann wieder links im Regal beginnt, damit alle Reihen auf derselben Kante liegen.
 *
 * Das Ergebnis ist bei gleichen Eingaben immer das gleiche: es wird nichts zufaellig sortiert.
 *
 * Zurueck kommen die Beschriftungen: eine je Kategorie und eine je Materialgruppe (und noch eine,
 * wenn die Gruppe in der naechsten Reihe weitergeht).
 */
export function layoutCatalog(items: CatalogItem[], sort: CatalogSort = "standard"): CatalogLabel[] {
  if (sort !== "standard") {
    const sorted = sortCatalog(items, sort);
    const labels: CatalogLabel[] = [];
    const groups = new Map<string, CatalogItem[]>();
    for (const item of sorted) {
      const key = sort === "material" ? `m:${item.materialKey}`
        : sort === "storey" ? `s:${item.part.storeyKey ?? item.part.storeyLabel.label}`
        : `z:${item.geometryKey}`;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    let z = 0;
    for (const list of groups.values()) {
      let x = 0;
      let rowDepth = 0;
      const label = sort === "material" ? list[0].materialLabel
        : sort === "storey" ? list[0].part.storeyLabel.label
        : list[0].geometryLabel;
      labels.push({ text: label, kind: "category", at: [0, Math.max(...list.map((i) => i.half[1] * 2)) + 1.5, z] });
      for (const item of list) {
        const w = item.half[0] * 2;
        const d = item.half[2] * 2;
        if (x > 0.001 && x + w > ROW_WIDTH) {
          z += rowDepth + GAP;
          rowDepth = 0;
          x = 0;
        }
        item.slot = [x, 0, z];
        x += w + GAP;
        rowDepth = Math.max(rowDepth, d + GAP);
      }
      z += rowDepth + CATEGORY_GAP;
    }
    return labels;
  }
  // Die Bereichsbeschriftungen kommen zuerst: der Viewer laesst bei Ueberlappung die frueheren stehen.
  const bereiche: CatalogLabel[] = [];
  const labels: CatalogLabel[] = [];
  const byCategory = new Map<Category, CatalogItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  let z = 0; // die Tiefe des naechsten Regals
  for (const category of CATEGORY_ORDER) {
    const list = byCategory.get(category);
    if (!list || !list.length) continue;
    // Nach Material, innerhalb des Materials nach Geometrie, darin nach der Groesse.
    const byMaterial = new Map<string, CatalogItem[]>();
    for (const item of list) {
      const group = byMaterial.get(item.materialKey) ?? [];
      group.push(item);
      byMaterial.set(item.materialKey, group);
    }
    const materialKeys = [...byMaterial.keys()].sort((a, b) =>
      (byMaterial.get(a)![0].materialLabel.localeCompare(byMaterial.get(b)![0].materialLabel, "de") || a.localeCompare(b)));
    const categoryZ = z;
    let x = 0; // die Position in der Reihe
    let rowZ = z; // die Tiefe der aktuellen Reihe
    let rowDepth = 0; // die groesste Tiefe in der aktuellen Reihe
    let groupStart = true; // steht der naechste Platz am Anfang einer Gruppe?
    for (const materialKey of materialKeys) {
      const group = byMaterial.get(materialKey)!;
      const byGeometry = new Map<string, CatalogItem[]>();
      for (const item of group) {
        const g = byGeometry.get(item.geometryKey) ?? [];
        g.push(item);
        byGeometry.set(item.geometryKey, g);
      }
      const geometryKeys = [...byGeometry.keys()].sort((a, b) => {
        const ga = byGeometry.get(a)!, gb = byGeometry.get(b)!;
        const va = Math.max(...ga.map((i) => i.volume));
        const vb = Math.max(...gb.map((i) => i.volume));
        return va - vb || a.localeCompare(b);
      });
      for (const geometryKey of geometryKeys) {
        const g = byGeometry.get(geometryKey)!;
        // Nach der Groesse: erst die kleinen, dann die grossen. Sortiert wird nach den Massen (der
        // groessten Kante zuerst), nicht nach dem Volumen: so stehen gleiche Bauteile unmittelbar
        // nebeneinander, auch wenn sie wegen Oeffnungen ein anderes Volumen haben.
        const sizeOf = (i: CatalogItem): number[] => [...i.dims].sort((a, b) => b - a);
        g.sort((a, b) => {
          const sa = sizeOf(a), sb = sizeOf(b);
          for (let i = 0; i < 3; i++) if (Math.abs(sa[i] - sb[i]) > EXACT_TOLERANCE) return sa[i] - sb[i];
          // Gleiche Masse: die Reihenfolge entscheidet die Id.
          return a.id.localeCompare(b.id);
        });
        // Sind die Bauteile dieser Gruppe nachweislich gleich gross?
        const first = g[0];
        for (const item of g) {
          item.identical = g.every((o) =>
            Math.abs(o.dims[0] - first.dims[0]) <= EXACT_TOLERANCE &&
            Math.abs(o.dims[1] - first.dims[1]) <= EXACT_TOLERANCE &&
            Math.abs(o.dims[2] - first.dims[2]) <= EXACT_TOLERANCE);
        }
        for (const item of g) {
          const w = item.half[0] * 2;
          const d = item.half[2] * 2;
          if (x > 0.001 && x + w > ROW_WIDTH) {
            // Die Reihe ist voll: die naechste Reihe beginnt wieder links im Regal.
            rowZ += rowDepth + GAP;
            rowDepth = 0;
            x = 0;
          }
          item.slot = [x, 0, rowZ];
          if (groupStart) {
            // Die erste Materialgruppe der Reihe bekommt ihre Beschriftung ueber dem ersten Bauteil.
            labels.push({
              text: group[0].materialLabel, kind: "material",
              at: [x, item.half[1] * 2 + 1.2, rowZ],
            });
            groupStart = false;
          }
          x += w + GAP;
          rowDepth = Math.max(rowDepth, d + GAP);
        }
      }
      // Die Materialgruppe ist zu Ende: die naechste beginnt mit einem groesseren Abstand und
      // bekommt ihre eigene Beschriftung.
      x += GROUP_GAP - GAP;
      groupStart = true;
    }
    // Die Beschriftung des Bereichs: ueber dem hoechsten Bauteil des Bereichs.
    const top = Math.max(...list.map((i) => i.half[1] * 2));
    bereiche.push({ text: CATEGORY_NAMES[category], kind: "category", at: [0, top + 2.2, categoryZ] });
    // Der Bereich ist zu Ende: der naechste beginnt in einer neuen Reihe darunter.
    z = rowZ + rowDepth + CATEGORY_GAP;
  }
  return [...bereiche, ...labels];
}

/**
 * Die Anordnung fuer den Viewer: je Modell und Bauteil eine Matrix im Szenenraum. Sie entsteht aus der
 * Katalogdrehung und dem Platz im Regal - die Ausgangsmatrix des Bauteils bleibt unangetastet.
 */
export function catalogArrangement(items: CatalogItem[]): Map<string, Map<string, number[]>> {
  const out = new Map<string, Map<string, number[]>>();
  for (const item of items) {
    const r = item.rotation;
    const turned = mulV(r, item.centre);
    // Der Platz im Regal ist die untere linke Ecke der gedrehten Box.
    const target: [number, number, number] = [
      item.slot[0] + item.half[0],
      item.slot[1] + item.half[1],
      item.slot[2] + item.half[2],
    ];
    const d: [number, number, number] = [target[0] - turned[0], target[1] - turned[1], target[2] - turned[2]];
    const matrix = [
      r[0], r[1], r[2], 0,
      r[3], r[4], r[5], 0,
      r[6], r[7], r[8], 0,
      d[0], d[1], d[2], 1,
    ];
    const perModel = out.get(item.model) ?? new Map<string, number[]>();
    perModel.set(item.key, matrix);
    out.set(item.model, perModel);
  }
  return out;
}
