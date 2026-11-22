// Die gemeinsame Auswahlverwaltung: 3D-Viewer, Bauteiltabelle und Infokarte teilen sich eine Auswahl.
//
// Ein Bauteil ist über seine eindeutige Id bestimmt: Modellkennung + NUL + IFC-Key. Das ist hier
// wichtig, weil zwei Modelle dieselben GlobalIds haben können – die GlobalId allein reicht nicht, und
// die räumliche Position erst recht nicht: in einer Explosionsdarstellung steht dasselbe Bauteil an
// einer anderen Stelle, die Auswahl muss trotzdem dieselbe bleiben.
//
// Die Klasse kennt keine Darstellung. Sie merkt sich nur, was ausgewählt ist, und meldet jede Änderung.

import { partId, splitPartId, type Part, type Parts } from "./parts";

/** Ein ausgewähltes Bauteil: die Id und, falls vorhanden, der Eintrag im Katalog. */
export interface SelectedPart {
  /** Die eindeutige Id: Modell + NUL + IFC-Key. */
  id: string;
  /** Das Modell, zu dem das Bauteil gehört. */
  model: string;
  /** Der IFC-Key innerhalb des Modells. */
  key: string;
  /** Der Eintrag im Katalog, falls das Bauteil darin steht. */
  part: Part | null;
}

export class Selection {
  private readonly ids = new Set<string>();
  private readonly listeners: ((ids: string[]) => void)[] = [];

  constructor(private readonly parts: Parts) {}

  /** Wie viele Bauteile ausgewählt sind. */
  get size(): number {
    return this.ids.size;
  }

  /** Die Ids der ausgewählten Bauteile. */
  list(): string[] {
    return [...this.ids];
  }

  /** Ist dieses Bauteil ausgewählt? */
  has(id: string): boolean {
    return this.ids.has(id);
  }

  /**
   * Wählt ein Bauteil. Ohne „additive" ersetzt die Auswahl alles andere, mit „additive" (Strg oder
   * Cmd) kommt das Bauteil dazu – oder es geht wieder heraus, wenn es schon da war.
   */
  select(id: string, additive = false): void {
    if (!additive) {
      if (this.ids.size === 1 && this.ids.has(id)) return;
      this.ids.clear();
      this.ids.add(id);
    } else if (this.ids.has(id)) {
      this.ids.delete(id);
    } else {
      this.ids.add(id);
    }
    this.emit();
  }

  /** Setzt die Auswahl auf genau diese Bauteile. */
  set(ids: Iterable<string>): void {
    this.ids.clear();
    for (const id of ids) this.ids.add(id);
    this.emit();
  }

  /** Hebt die Auswahl auf. */
  clear(): void {
    if (!this.ids.size) return;
    this.ids.clear();
    this.emit();
  }

  /** Die Auswahl, nach Modell gruppiert – so braucht es der 3D-Viewer. */
  byModel(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const id of this.ids) {
      const { model, key } = splitPartId(id);
      const list = out.get(model) ?? [];
      list.push(key);
      out.set(model, list);
    }
    return out;
  }

  /** Die ausgewählten Bauteile, mit ihrem Eintrag im Katalog. */
  selectedParts(): SelectedPart[] {
    return this.list().map((id) => {
      const { model, key } = splitPartId(id);
      return { id, model, key, part: this.parts.get(id) ?? null };
    });
  }

  /** Meldet jede Änderung der Auswahl. */
  onChange(fn: (ids: string[]) => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    const ids = this.list();
    for (const fn of this.listeners) fn(ids);
  }
}

/** Die eindeutige Id eines Bauteils: Modell + NUL + IFC-Key. */
export { partId, splitPartId };