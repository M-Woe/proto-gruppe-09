// Das Bedienfeld des Bauteilkatalogs: der Umschalter zwischen Gebaeudeansicht und Katalog steht
// oben rechts im 3D-Viewport, daneben eine kurze Uebersicht, was im Katalog steht.
//
// Die Beschriftungen der Kategorien und Materialgruppen haengen an den Bauteilen im 3D (der Viewer
// setzt sie an Punkte in der Szene), damit sie beim Drehen mitgehen.

import { h } from "./dom";
import { CATEGORY_NAMES, type CatalogItem } from "./catalog";
import type { Label } from "./viewer";

/** Der Zustand des Katalogs. */
export type CatalogMode = "building" | "catalog";

export class CatalogPanel {
  private readonly root: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly labelRoot: HTMLElement;
  private mode: CatalogMode = "building";

  /** Wird aufgerufen, wenn der Ansichtsmodus wechselt. */
  onChange: (mode: CatalogMode) => void = () => {};

  constructor(container: HTMLElement) {
    this.summary = h("div", { class: "catalog-summary muted" });
    this.labelRoot = h("div", { class: "catalog-labels" });
    const seg = h("div", { class: "catalog-seg", role: "group", "aria-label": "Ansicht" });
    const building = h("button", { type: "button", "data-mode": "building", title: "Das Gebäude in seinen IFC-Koordinaten" }, "Gebäude");
    const catalog = h("button", { type: "button", "data-mode": "catalog", title: "Alle Bauteile sortiert im Bauteillager" }, "Bauteilkatalog");
    building.onclick = () => this.set("building");
    catalog.onclick = () => this.set("catalog");
    seg.append(building, catalog);
    this.root = h("div", { class: "catalog-panel", "aria-label": "Bauteilkatalog" }, seg, this.summary);
    container.append(this.root, this.labelRoot);
    this.paint();
  }

  /** Wechselt zwischen Gebaeudeansicht und Katalog. */
  set(mode: CatalogMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.paint();
    this.onChange(mode);
  }

  /** Der aktuelle Modus. */
  getMode(): CatalogMode {
    return this.mode;
  }

  /** Die Uebersicht: wie viele Bauteile in welcher Kategorie. */
  setSummary(items: CatalogItem[]): void {
    if (!items.length) {
      this.summary.textContent = "";
      return;
    }
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    const parts: string[] = [];
    for (const [category, count] of counts) {
      parts.push(`${CATEGORY_NAMES[category as keyof typeof CATEGORY_NAMES]}: ${count}`);
    }
    this.summary.textContent = `${items.length} Bauteile · ${parts.join(" · ")}`;
    this.summary.title = parts.join("\n");
  }

  /** Die Beschriftungen fuer den Viewer (die Elemente gehoeren dem Panel). */
  labels(texts: { text: string; kind: "category" | "material"; at: [number, number, number] }[]): Label[] {
    this.labelRoot.replaceChildren();
    const out: Label[] = [];
    for (const t of texts) {
      const el = h("span", { class: `catalog-label ${t.kind}` }, t.text);
      this.labelRoot.append(el);
      out.push({ el, at: t.at });
    }
    return out;
  }

  /** Loest die Beschriftungen wieder aus der Szene. */
  clearLabels(): void {
    this.labelRoot.replaceChildren();
  }

  private paint(): void {
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-mode]")) {
      const on = b.dataset.mode === this.mode;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    this.root.classList.toggle("active", this.mode === "catalog");
  }
}
