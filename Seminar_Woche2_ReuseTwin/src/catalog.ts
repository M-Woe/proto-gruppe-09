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

/** Welcher deutsche Bauteiltyp gehört zu welcher Kategorie. */
const CATEGORY_OF: Record<string, Category> = {
  "Stütze": "column", "Pfeiler": "column",
  "Träger": "beam", "Unterzug": "beam", "Stürze": "beam", "Hohlkernträger": "beam",
  "Außenwand": "wall", "Innenwand": "wall", "Wand": "wall", "Trennwand": "wall",
  "Vorhangfassade": "wall", "Fassade": "wall",
  "Decke": "slab", "Geschossdecke": "slab", "Bodenplatte": "slab", "Dachdecke": "slab", "Treppenabsatz": "slab",
  "Dach": "roof", "Flachdach": "roof", "Pultdach": "roof", "Satteldach": "roof", "Walmdach": "roof",
  "Krüppelwalmdach": "roof", "Tonnendach": "roof", "Schmetterlingsdach": "roof", "Kuppeldach": "roof",
  "Mansarddach": "roof", "Standarddach": "roof",
  "Fenster": "window", "Dachfenster": "window", "Lichtkuppel": "window",
  "Tür": "door", "Tor": "door", "Klappe": "door",
  "Treppe": "stair", "Geradetreppe": "stair", "Treppe mit Podest": "stair", "Wendeltreppe": "stair",
  "Spindeltreppe": "stair", "Rampe": "stair",
  "Einrichtung": "furniture", "Möbel": "furniture", "Schrank": "furniture", "Heizkörper": "furniture",
  "Stuhl": "furniture", "Tisch": "furniture", "Schreibtisch": "furniture", "Regal": "furniture",
};

/**
 * Die Zielrichtung der drei lokalen Achsen: wohin sollen sie im Katalog zeigen?
 * X, Y und Z sind die lokalen Achsen des Bauteils (X = Laenge, Y = Breite/Dicke, Z = Hoehe).
 */
const CANONICAL: Record<Category, [number, number, number]> = {
  //         lokal X → , lokal Y → , lokal Z →
  column: [0, 2, 1],   // steht senkrecht: die Hoehe (Z) zeigt nach oben
  beam: [0, 1, 2],     // liegt flach: die Breite (Y) zeigt nach oben, die Laenge nach X
  wall: [0, 2, 1],     // steht aufrecht: die Hoehe (Z) zeigt nach oben
  slab: [0, 1, 2],     // liegt flach: die Dicke (Z) zeigt nach oben
  roof: [0, 2, 1],
  window: [0, 2, 1],
  door: [0, 2, 1],
  stair: [0, 2, 1],
  furniture: [0, 2, 1],
  other: [0, 2, 1],
};

/** Der Abstand zwischen zwei Bauteilen in einer Reihe (Meter). */
const GAP = 0.3;
/** Der Abstand zwischen zwei Materialgruppen (Meter). */
const GROUP_GAP = 2.5;
/** Der Abstand zwischen zwei Kategorien (Meter). */
const CATEGORY_GAP = 7;
/** Die Zielbreite einer Reihe: danach geht es in die naechste Reihe (Meter). */
const ROW_WIDTH = 46;
/** Die Mass-Toleranz: zwei Bauteile gelten als gleich, wenn sie um weniger als 1 mm abweichen. */
const EXACT_TOLERANCE = 0.001;
/** Die aehnliche Toleranz: bis hierher gehoeren Bauteile zur selben Geometriegruppe. */
const SIMILAR_TOLERANCE = 0.03;

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
  /** Der Schluessel der Geometriegruppe (Typ und Form). */
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

/** Die Kategorie eines Bauteils. */
/**
 * Die Kategorie eines Bauteils. Neben dem genauen Namen zaehlt auch die Endung: aus „Holzstuetze"
 * wird „Stuetze", aus „Geschossdecke" wird „Decke" – das Material steht vor der Art, die Art
 * bleibt dieselbe.
 */
export function categoryOf(part: Part): Category {
  const direct = CATEGORY_OF[part.type];
  if (direct) return direct;
  // Gross-/Kleinschreibung egal: im deutschen Kompositum steht der Anfangsbuchstabe klein
  // („Holzträger" endet auf „träger").
  const type = part.type.toLowerCase();
  for (const [word, category] of SUFFIXES) {
    if (part.type.endsWith(word)) return category;
    if (type.endsWith(word.toLowerCase())) return category;
  }
  return "other";
}

/** Die Art am Ende des Namens, laengste zuerst (damit „Bodenplatte" vor „Decke" kommt). */
export const SUFFIXES: [string, Category][] = Object.entries({
  "Vorhangfassade": "wall", "Trennwand": "wall", "Bodenplatte": "slab", "Geschossdecke": "slab",
  "Dachdecke": "slab", "Einrichtung": "furniture", "Heizkörper": "furniture", "Dachfenster": "window",
  "Stütze": "column", "Pfeiler": "column", "Träger": "beam", "Unterzug": "beam", "Stürze": "beam",
  "Wand": "wall", "Fassade": "wall", "Decke": "slab", "Dach": "roof", "Fenster": "window",
  "Tür": "door", "Tor": "door", "Treppe": "stair", "Möbel": "furniture", "Schrank": "furniture",
} as Record<string, Category>).sort((a, b) => b[0].length - a[0].length);

/** Die Materialgruppe eines Bauteils: bei einem Schichtaufbau der Aufbau selbst, sonst das Material. */
function materialOf(part: Part): { key: string; label: string } {
  if (!part.material) return { key: "ohne", label: "Ohne Material" };
  const layers = part.layers.length;
  if (layers > 1) {
    // Ein Schichtaufbau: die Gruppe heisst nach dem Aufbau, nicht nach einem erfundenen Hauptmaterial.
    const main = [...part.layers].sort((a, b) => (b.thickness ?? 0) - (a.thickness ?? 0))[0];
    return { key: `set:${part.material}`, label: `${part.materialLabel.label} – ${main.label}` };
  }
  return { key: `mat:${part.material}`, label: part.materialLabel.label };
}

/** Die Geometriegruppe: Typ und die Proportionen der Bauteile (auf die groesste Kante bezogen). */
function geometryOf(part: Part, dims: [number, number, number]): { key: string; label: string } {
  // Die Geometriegruppe: gleicher Typ und gleiche Masse (auf den Millimeter genau). Damit stehen
  // gleiche Bauteile unmittelbar nebeneinander. Gleiche Typen mit anderen Massen kommen in
  // benachbarte Gruppen, weil die Gruppen nach der Groesse sortiert werden.
  const q = (v: number) => Math.round(v / EXACT_TOLERANCE) * EXACT_TOLERANCE;
  // Die Masse sortiert, damit die Reihenfolge der lokalen Achsen keine Rolle spielt: zwei Bauteile
  // mit den gleichen Massen sind gleich, auch wenn sie im Modell anders gedreht liegen.
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

/**
 * Die Drehung, die das Bauteil in die Katalogorientierung bringt: die lokalen Achsen zeigen danach in
 * die Szenenrichtungen, die fuer die Kategorie festgelegt sind. Die Drehung ist immer eine echte
 * Drehung (keine Spiegelung); dafuer wird im Zweifel die dünnste Achse umgekehrt - das sieht man
 * bei einem Bauteil am wenigsten.
 */
function rotationFor(category: Category, axes: ElementFrame["axes"], half: [number, number, number]): M3 {
  const target = CANONICAL[category];
  const current: M3 = [
    axes.x[0], axes.x[1], axes.x[2],
    axes.y[0], axes.y[1], axes.y[2],
    axes.z[0], axes.z[1], axes.z[2],
  ];
  // Die Zielmatrix: die Spalten sind die Szenenachsen, in die die lokalen Achsen zeigen sollen.
  const goal: M3 = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) {
    goal[target[i] * 3 + i] = 1;
  }
  if (det3(goal) < 0) {
    // Die Vertauschung würde spiegeln: die dünnste lokale Achse wird umgekehrt.
    let thin = 0;
    for (let i = 1; i < 3; i++) if (half[i] < half[thin]) thin = i;
    goal[target[thin] * 3 + thin] = -1;
  }
  // R = Ziel · Current^T (die Current-Matrix ist orthonormal, ihre Transponierte ist die Inverse).
  const inv: M3 = [current[0], current[3], current[6], current[1], current[4], current[7], current[2], current[5], current[8]];
  return mul3(goal, inv);
}

/** Die halben Masse in der Katalogorientierung: die Spalte der Szenenachse bekommt das Mass. */
function halfInOrientation(category: Category, half: [number, number, number]): [number, number, number] {
  const target = CANONICAL[category];
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[target[i]] = half[i];
  return out;
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
    const material = materialOf(part);
    const geometry = geometryOf(part, dims);
    const centre = frame.centre;
    items.push({
      id: part.id, model: part.model, key: part.key, part, category,
      materialKey: material.key, materialLabel: material.label,
      geometryKey: geometry.key, geometryLabel: geometry.label,
      identical: true, dims, volume: part.volume.value === null ? 0 : Number(part.volume.value),
      centre, axes: frame.axes,
      slot: [0, 0, 0],
      half: halfInOrientation(category, half),
      rotation: rotationFor(category, frame.axes, half),
    });
  }
  return items;
}

/**
 * Ordnet den Katalog wie ein Bauteillager: erst nach Kategorie, dann nach Material, dann nach
 * Bauteiltyp und Geometrie, dann nach der Groesse. Innerhalb einer Gruppe stehen die Bauteile
 * nebeneinander in einer Reihe; passt eine Gruppe nicht mehr in die Reihe, geht es in die naechste.
 *
 * Das Ergebnis ist bei gleichen Eingaben immer das gleiche: es wird nichts zufaellig sortiert.
 */
export function layoutCatalog(items: CatalogItem[]): void {
  for (const item of items) {
    // Die Materialgruppen und die Geometriegruppen bekommen ihre Reihenfolge.
    item.identical = true;
  }
  const byCategory = new Map<Category, CatalogItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  let z = 0;
  for (const category of CATEGORY_ORDER) {
    const list = byCategory.get(category);
    if (!list || !list.length) continue;
    // Nach Material, innerhalb des Materials nach Geometrie, darin nach Groesse.
    const byMaterial = new Map<string, CatalogItem[]>();
    for (const item of list) {
      const group = byMaterial.get(item.materialKey) ?? [];
      group.push(item);
      byMaterial.set(item.materialKey, group);
    }
    const materialKeys = [...byMaterial.keys()].sort((a, b) =>
      (byMaterial.get(a)![0].materialLabel.localeCompare(byMaterial.get(b)![0].materialLabel, "de") || a.localeCompare(b)));
    let categoryX = 0;
    let rowZ = z;
    let rowDepth = 0;
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
      const groupX = categoryX;
      let x = categoryX;
      let depth = 0;
      for (const geometryKey of geometryKeys) {
        const g = byGeometry.get(geometryKey)!;
        // Nach der Groesse: erst die kleinen, dann die grossen.
        // Nach der Groesse: erst die kleinen, dann die grossen. Sortiert wird nach den Massen
        // (der groessten Kante zuerst), nicht nach dem Volumen: so stehen gleiche Bauteile
        // unmittelbar nebeneinander, auch wenn sie wegen Oeffnungen ein anderes Volumen haben.
        const sizeOf = (i: CatalogItem): number[] => [...i.dims].sort((a, b) => b - a);
        g.sort((a, b) => {
          const sa = sizeOf(a), sb = sizeOf(b);
          for (let i = 0; i < 3; i++) if (Math.abs(sa[i] - sb[i]) > EXACT_TOLERANCE) return sa[i] - sb[i];
          // Gleiche Masse: die Reihenfolge entscheidet die Id - so stehen gleiche Bauteile unmittelbar nebeneinander.
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
          if (x > groupX + 0.001 && x - groupX + w > ROW_WIDTH) {
            // Die Reihe ist voll: die naechste Reihe beginnt darunter.
            x = groupX;
            rowZ += rowDepth + GAP;
            rowDepth = 0;
            depth = 0;
          }
          item.slot = [x, 0, rowZ];
          x += w + GAP;
          rowDepth = Math.max(rowDepth, d + GAP);
          depth = Math.max(depth, d);
        }
      }
      // Die Materialgruppe ist zu Ende: die naechste beginnt mit einem groesseren Abstand.
      categoryX = groupX + (x - groupX) + GROUP_GAP;
    }
    // Die Kategorie ist zu Ende: die naechste beginnt in einer neuen Reihe darunter.
    z = rowZ + rowDepth + CATEGORY_GAP;
  }
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

/** Eine Beschriftung im Katalog: eine Kategorie oder eine Materialgruppe. */
export interface CatalogLabel {
  text: string;
  kind: "category" | "material";
  /** Wo die Beschriftung steht (in der Szene). */
  at: [number, number, number];
}

/** Die Beschriftungen fuer die Kategorien und die Materialgruppen. */
export function catalogLabels(items: CatalogItem[]): CatalogLabel[] {
  const labels: CatalogLabel[] = [];
  const seenCategory = new Set<Category>();
  const seenMaterial = new Set<string>();
  for (const item of items) {
    if (!seenCategory.has(item.category)) {
      seenCategory.add(item.category);
      labels.push({
        text: CATEGORY_NAMES[item.category], kind: "category",
        at: [item.slot[0], item.half[1] * 2 + 2.2, item.slot[2]],
      });
    }
    const materialId = `${item.category}|${item.materialKey}`;
    if (!seenMaterial.has(materialId)) {
      seenMaterial.add(materialId);
      labels.push({
        text: item.materialLabel, kind: "material",
        at: [item.slot[0], item.half[1] * 2 + 1.1, item.slot[2]],
      });
    }
  }
  return labels;
}

/** Die Anzahl der Bauteile je Kategorie (für die Übersicht). */
export function catalogSummary(items: CatalogItem[]): { category: Category; label: string; count: number }[] {
  const counts = new Map<Category, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return CATEGORY_ORDER
    .filter((c) => counts.has(c))
    .map((c) => ({ category: c, label: CATEGORY_NAMES[c], count: counts.get(c)! }));
}
