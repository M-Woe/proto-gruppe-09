// Die Explosionsdarstellung: eine nachvollziehbare raeumliche Anordnung, die nur fuer die Darstellung gilt.
//
// Die Bauteile bekommen zusaetzliche, temporaere Verschiebungen; ihre urspruenglichen IFC-Weltkoordinaten
// bleiben unangetastet. Der Viewer merkt sich die Matrix, mit der ein Bauteil geladen wurde, und setzt
// sie beim Zuruecksetzen exakt zurueck.
//
// Gruppierung: nach dem deutschen Bauteiltyp (aus der IFC-Klasse), nach Geschoss, nach Material oder
// nach der Auswahl. Jede Gruppe bekommt eine Richtung und einen Abstand; innerhalb einer Gruppe bleiben
// die Bauteile exakt zusammen, und beide Modelle bekommen fuer dieselbe Gruppe denselben Versatz - so
// bleiben Architektur- und Strukturmodell aufeinander abgestimmt.
//
// Die Regeln im Klaren:
//  - Geschoss: die Geschosse werden in der Hoehe auseinandergezogen. Der Abstand waechst mit dem Grad,
//    die Lage in der Ebene (X und Z) bleibt unveraendert - die Geschossstruktur bleibt lesbar.
//  - Bauteiltyp, Material, Auswahl: die Gruppen wandern waagerecht vom Mittelpunkt des Gebaeudes weg.
//    Die Grundrissform bleibt erhalten, die Gruppen bekommen einen Abstand von 30 % des Gebaeuderadius.

import type { Part, Parts } from "./parts";
import type { Bounds, Viewer } from "./viewer";

/** Wie die Bauteile fuer die Explosion gruppiert werden. */
export type ExplosionCriterion = "class" | "storey" | "material" | "selection";

/** Was im 3D zu sehen ist - unabhaengig von der Filterung der Tabelle. */
export type VisibilityMode = "all" | "selection" | "filter";

/** Eine Gruppe der Explosionsdarstellung. */
export interface ExplosionGroup {
  /** Der Schluessel der Gruppe (stabil, unabhaengig von der Reihenfolge). */
  key: string;
  /** Der deutsche Name der Gruppe. */
  label: string;
  /** Wie viele Bauteile in der Gruppe sind. */
  count: number;
}

interface GroupInfo {
  key: string;
  label: string;
  ids: string[];
  bounds: Bounds;
}

/** Die Mitte einer Box. */
function centre(b: Bounds): [number, number, number] {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

/** Der halbe Durchmesser einer Box - so gross ist die Gruppe. */
function radius(b: Bounds): number {
  return Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2;
}

/** Die Box, die beide umschliesst. */
function union(a: Bounds, b: Bounds): Bounds {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

export class Explosion {
  /** Die Weltboxen der Bauteile, einmal gemessen - sie beschreiben die Ausgangslage. */
  private bounds: Map<string, Map<string, Bounds>> | null = null;

  constructor(private readonly parts: Parts, private readonly viewer: Viewer) {}

  /** Die Gruppen fuer ein Kriterium - fuer die Anzeige im Bedienfeld. */
  groups(criterion: ExplosionCriterion, selection: string[]): ExplosionGroup[] {
    const map = new Map<string, ExplosionGroup>();
    for (const p of this.parts.parts) {
      const g = this.groupOf(p, criterion, new Set(selection));
      const cur = map.get(g.key);
      if (cur) cur.count++;
      else map.set(g.key, { key: g.key, label: g.label, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));
  }

  /**
   * Setzt die Anordnung im 3D. Der Grad 0 ist die Normalansicht: die Bauteile stehen dann exakt dort,
   * wo die IFC-Datei sie hinstellt.
   */
  apply(criterion: ExplosionCriterion, factor: number, selection: string[]): void {
    const f = Math.max(0, Math.min(1, factor));
    if (f <= 0.001) {
      this.viewer.setArrangement(null);
      return;
    }
    const boxes = this.measure();
    const groups = this.buildGroups(criterion, new Set(selection), boxes);
    if (!groups.length) {
      this.viewer.setArrangement(null);
      return;
    }
    // Die Box ueber alle Bauteile: der Mittelpunkt, von dem aus die Gruppen wandern.
    let all: Bounds | null = null;
    for (const g of groups) all = all ? union(all, g.bounds) : g.bounds;
    const arrangements = new Map<string, Map<string, number[]>>();
    for (const p of this.parts.parts) {
      const g = groups.find((x) => x.key === this.groupOf(p, criterion, new Set(selection)).key);
      if (!g) continue;
      const d = this.offset(g, all!, f, groups.indexOf(g), groups.length, criterion);
      const perModel = arrangements.get(p.model) ?? new Map<string, number[]>();
      if (!perModel.has(p.key)) {
        // Eine Verschiebung im Szenenraum: sie aendert die IFC-Koordinaten nicht, nur das Bild.
        perModel.set(p.key, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d[0], d[1], d[2], 1]);
        arrangements.set(p.model, perModel);
      }
    }
    this.viewer.setArrangement(arrangements);
  }

  /** Alle Bauteile zurueck an ihre Ausgangsposition. */
  reset(): void {
    this.viewer.setArrangement(null);
  }

  /** Misst die Weltboxen einmal - sie bleiben ueber die ganze Explosion hinweg gleich. */
  private measure(): Map<string, Map<string, Bounds>> {
    if (!this.bounds) this.bounds = this.viewer.elementBounds();
    return this.bounds;
  }

  /** Die Gruppe, in der ein Bauteil liegt. */
  private groupOf(p: Part, criterion: ExplosionCriterion, selection: Set<string>): { key: string; label: string } {
    switch (criterion) {
      case "class":
        // Der deutsche Bauteiltyp, der aus der IFC-Klasse abgeleitet ist (Wand, Decke, Stuetze ...).
        return { key: `c:${p.type}`, label: p.type };
      case "storey":
        // Der Geschossschluessel: in beiden Modellen desselben Gebaeudes derselbe, so liegen die
        // Geschosse beider Modelle in derselben Gruppe.
        return { key: `s:${p.storeyKey ?? p.storeyLabel.label}`, label: p.storeyLabel.label };
      case "material": {
        // Die Regel fuer Bauteile mit mehreren Materialien: das dickste Material der Schichten
        // bestimmt die Gruppe. Bei einem einfachen Material ist es dieses; ohne Material gibt es
        // eine eigene Gruppe.
        let best = p.layers[0];
        for (const l of p.layers) if ((l.thickness ?? -1) > (best?.thickness ?? -1)) best = l;
        if (best) return { key: `m:${best.material}`, label: best.label };
        if (p.material) return { key: `m:${p.material}`, label: p.materialLabel.label };
        return { key: "m:-", label: "Ohne Material" };
      }
      case "selection":
        return selection.has(p.id)
          ? { key: "x:selected", label: "Auswahl" }
          : { key: "x:rest", label: "Übrige Bauteile" };
    }
  }

  /** Die Gruppen mit ihren Boxen. */
  private buildGroups(criterion: ExplosionCriterion, selection: Set<string>, boxes: Map<string, Map<string, Bounds>>): GroupInfo[] {
    const map = new Map<string, GroupInfo>();
    for (const p of this.parts.parts) {
      const g = this.groupOf(p, criterion, selection);
      const box = boxes.get(p.model)?.get(p.key);
      if (!box) continue; // kein Bauteil im 3D (ohne Geometrie)
      const cur = map.get(g.key);
      if (cur) {
        cur.ids.push(p.id);
        cur.bounds = union(cur.bounds, box);
      } else {
        map.set(g.key, { key: g.key, label: g.label, ids: [p.id], bounds: box });
      }
    }
    return [...map.values()];
  }

  /** Der Versatz einer Gruppe: Richtung mal Abstand, mal dem Grad. */
  private offset(
    group: GroupInfo,
    all: Bounds,
    factor: number,
    index: number,
    count: number,
    criterion: ExplosionCriterion,
  ): [number, number, number] {
    if (criterion === "storey") {
      const c = centre(group.bounds);
      const a = centre(all);
      return [0, (c[1] - a[1]) * factor * 1.7, 0];
    }
    const c = centre(group.bounds);
    const a = centre(all);
    let dx = c[0] - a[0];
    let dz = c[2] - a[2];
    let len = Math.hypot(dx, dz);
    if (len < 1e-4) {
      // Die Gruppe sitzt im Mittelpunkt: sie bekommt einen festen Platz auf dem Kreis, damit sich die
      // Gruppen nicht ueberlagern.
      const angle = ((index + 0.5) / Math.max(count, 1)) * Math.PI * 2;
      dx = Math.cos(angle);
      dz = Math.sin(angle);
      len = 1;
    }
    dx /= len;
    dz /= len;
    const gap = radius(all) * 0.3;
    const d = (radius(group.bounds) + gap) * factor;
    return [dx * d, 0, dz * d];
  }
}