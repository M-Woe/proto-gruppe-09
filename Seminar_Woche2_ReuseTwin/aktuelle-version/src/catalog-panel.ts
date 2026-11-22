// Bedienfeld und 2D-Darstellung des Bauteilkatalogs.

import { h } from "./dom";
import {
  CATEGORY_NAMES, EMPTY_CATALOG_FILTERS, type CatalogFilters, type CatalogItem,
  type CatalogSort, type Category,
} from "./catalog";
import type { ProjectionPlane } from "./viewer";
import type { Label } from "./viewer";

export type CatalogMode = "building" | "catalog";
export type CatalogView = "2d" | "3d";

export class CatalogPanel {
  private readonly root: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly labelRoot: HTMLElement;
  private readonly twoDRoot: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly svgGroup: SVGGElement;
  private mode: CatalogMode = "building";
  private view: CatalogView = "3d";
  private sort: CatalogSort = "standard";
  private filters: CatalogFilters = { ...EMPTY_CATALOG_FILTERS };
  private items: CatalogItem[] = [];
  private selected = new Set<string>();
  private projection: ((model: string, key: string, plane: ProjectionPlane) => [number, number][]) =
    () => [];
  private zoom = 1;
  private pan = { x: 0, y: 0 };

  onChange: (mode: CatalogMode) => void = () => {};
  onViewChange: (view: CatalogView) => void = () => {};
  onSortChange: (sort: CatalogSort) => void = () => {};
  onFilterChange: (filters: CatalogFilters) => void = () => {};
  onPick: (id: string, additive: boolean) => void = () => {};
  onFocus: () => void = () => {};

  constructor(container: HTMLElement) {
    this.summary = h("div", { class: "catalog-summary muted" });
    this.labelRoot = h("div", { class: "catalog-labels" });
    this.twoDRoot = h("div", { class: "catalog-2d", hidden: true });
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("aria-label", "2D-Bauteilkatalog");
    this.svgGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.svg.append(this.svgGroup);
    this.twoDRoot.append(this.svg);

    const modeSeg = h("div", { class: "catalog-seg", role: "group", "aria-label": "Gebaeude oder Katalog" });
    const building = h("button", { type: "button", "data-mode": "building", title: "Das Gebäude in seinen IFC-Koordinaten" }, "Gebäude");
    const catalog = h("button", { type: "button", "data-mode": "catalog", title: "Bauteilkatalog" }, "Bauteilkatalog");
    building.onclick = () => this.set("building");
    catalog.onclick = () => this.set("catalog");
    modeSeg.append(building, catalog);

    const viewSeg = h("div", { class: "catalog-view-seg", role: "group", "aria-label": "Katalogansicht" });
    const view2d = h("button", { type: "button", "data-view": "2d" }, "2D");
    const view3d = h("button", { type: "button", "data-view": "3d" }, "3D");
    view2d.onclick = () => this.setView("2d");
    view3d.onclick = () => this.setView("3d");
    const reset = h("button", { type: "button", "data-view-action": "reset" }, "Gesamtansicht");
    const focus = h("button", { type: "button", "data-view-action": "focus" }, "Auswahl");
    reset.onclick = () => this.resetView();
    focus.onclick = () => this.onFocus();
    viewSeg.append(view2d, view3d, reset, focus);

    const sort = h("select", { class: "catalog-sort", "aria-label": "Sortierung" }) as HTMLSelectElement;
    for (const [value, label] of [
      ["standard", "Kategorie → Material → Geometrie → Größe"],
      ["material", "Material → Kategorie → Geometrie → Größe"],
      ["storey", "Geschoss → Kategorie → Material"],
      ["size", "Größe → Kategorie → Material"],
    ] as [CatalogSort, string][]) sort.append(h("option", { value }, label));
    sort.onchange = () => {
      this.sort = sort.value as CatalogSort;
      this.onSortChange(this.sort);
      this.paint();
    };

    const controls = h("div", { class: "catalog-controls" },
      h("label", {}, h("span", {}, "Sortierung"), sort));
    controls.append(this.buildFilters());

    this.root = h("div", { class: "catalog-panel", "aria-label": "Bauteilkatalog" },
      modeSeg, viewSeg, controls, this.summary);
    container.append(this.root, this.labelRoot, this.twoDRoot);
    this.bindSvg();
    this.paint();
  }

  set(mode: CatalogMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.paint();
    this.onChange(mode);
  }

  getMode(): CatalogMode { return this.mode; }
  getView(): CatalogView { return this.view; }
  getSort(): CatalogSort { return this.sort; }
  getFilters(): CatalogFilters { return { ...this.filters }; }

  setView(view: CatalogView): void {
    if (this.view === view) return;
    this.view = view;
    this.twoDRoot.hidden = view !== "2d" || this.mode !== "catalog";
    this.paint();
    this.onViewChange(view);
  }

  setProjection(projection: (model: string, key: string, plane: ProjectionPlane) => [number, number][]): void {
    this.projection = projection;
  }

  setItems(items: CatalogItem[]): void {
    this.items = items;
    const controls = this.root.querySelector(".catalog-controls");
    const old = controls?.querySelector(".catalog-filter-box");
    old?.remove();
    controls?.append(this.buildFilters());
  }

  setSelected(ids: string[]): void {
    this.selected = new Set(ids);
    if (!this.twoDRoot.hidden) this.render2D();
  }

  setSummary(items: CatalogItem[]): void {
    if (!items.length) {
      this.summary.textContent = "";
      return;
    }
    const types = new Set(items.map((i) => i.part.type));
    const materials = new Set(items.map((i) => i.materialKey));
    let volume = 0;
    let withVolume = 0;
    for (const i of items) {
      if (typeof i.part.volume.value === "number") {
        volume += i.part.volume.value;
        withVolume++;
      }
    }
    const counted = new Set(items.filter((i) => i.identical).map((i) => i.geometryKey)).size;
    this.summary.textContent =
      `${items.length} Bauteile · ${types.size} Typen · ${materials.size} Materialgruppen · ` +
      `${counted} ähnliche Geometrien · ${withVolume ? `${volume.toFixed(2)} m³` : "Volumen nicht vollständig verfügbar"}`;
  }

  labels(texts: { text: string; kind: "category" | "material"; at: [number, number, number] }[]): Label[] {
    this.labelRoot.replaceChildren();
    const out: Label[] = [];
    for (const text of texts) {
      const el = h("span", { class: `catalog-label ${text.kind}`, title: text.text }, text.text);
      this.labelRoot.append(el);
      out.push({ el, at: text.at });
    }
    return out;
  }

  clearLabels(): void { this.labelRoot.replaceChildren(); }

  show2D(items: CatalogItem[]): void {
    this.items = items;
    this.twoDRoot.hidden = false;
    this.render2D();
  }

  hide2D(): void { this.twoDRoot.hidden = true; }

  resetView(): void {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.updateSvgTransform();
  }

  private buildFilters(): HTMLElement {
    const details = h("details", { class: "catalog-filter-box" }) as HTMLDetailsElement;
    details.append(h("summary", {}, "Filter"));
    const body = h("div", { class: "catalog-filter-body" });

    const select = (label: string, options: string[], key: "model" | "category" | "material" | "storey" | "type"): HTMLSelectElement => {
      const el = h("select", { "aria-label": label }) as HTMLSelectElement;
      el.append(h("option", { value: "" }, label));
      for (const option of [...new Set(options)].sort((a, b) => a.localeCompare(b, "de"))) {
        el.append(h("option", { value: option }, option));
      }
      el.onchange = () => {
        (this.filters as unknown as Record<string, unknown>)[key] = key === "category" ? el.value : el.value;
        this.emitFilters();
      };
      return el;
    };
    const modelOptions = new Map<string, string>();
    for (const item of this.items) modelOptions.set(item.part.model, item.part.modelFile);
    const modelSelect = h("select", { "aria-label": "Alle Modelle" }) as HTMLSelectElement;
    modelSelect.append(h("option", { value: "" }, "Alle Modelle"));
    for (const [value, label] of [...modelOptions].sort((a, b) => b[1].localeCompare(a[1], "de"))) {
      modelSelect.append(h("option", { value }, label));
    }
    modelSelect.onchange = () => { this.filters.model = modelSelect.value; this.emitFilters(); };

    const categorySelect = h("select", { "aria-label": "Alle Kategorien" }) as HTMLSelectElement;
    categorySelect.append(h("option", { value: "" }, "Alle Kategorien"));
    for (const key of Object.keys(CATEGORY_NAMES) as Category[]) {
      const label = CATEGORY_NAMES[key];
      categorySelect.append(h("option", { value: key }, label));
    }
    categorySelect.onchange = () => { this.filters.category = categorySelect.value as Category | ""; this.emitFilters(); };

    const materials = this.items.map((i) => i.materialLabel);
    const storeys = this.items.map((i) => i.part.storeyLabel.label).filter((v) => v !== "Nicht zugeordnet");
    const types = this.items.map((i) => i.part.type);
    body.append(
      modelSelect,
      categorySelect,
      select("Alle Materialien", materials, "material"),
      select("Alle Geschosse", storeys, "storey"),
      select("Alle Bauteiltypen", types, "type"),
    );

    const load = h("select", { "aria-label": "Tragende Funktion" }) as HTMLSelectElement;
    for (const [value, label] of [["all", "Alle Tragfunktionen"], ["true", "Tragend"], ["false", "Nicht tragend"]] as const) {
      load.append(h("option", { value }, label));
    }
    load.onchange = () => { this.filters.loadBearing = load.value as CatalogFilters["loadBearing"]; this.emitFilters(); };
    body.append(load);

    const ranges: [string, keyof CatalogFilters, keyof CatalogFilters][] = [
      ["Länge in m", "lengthMin", "lengthMax"],
      ["Breite/Dicke in m", "widthMin", "widthMax"],
      ["Höhe in m", "heightMin", "heightMax"],
      ["Volumen in m³", "volumeMin", "volumeMax"],
    ];
    for (const [label, minKey, maxKey] of ranges) {
      const min = h("input", { type: "number", step: "0.01", placeholder: "Min", "aria-label": `${label} mindestens` }) as HTMLInputElement;
      const max = h("input", { type: "number", step: "0.01", placeholder: "Max", "aria-label": `${label} höchstens` }) as HTMLInputElement;
      const update = () => {
        (this.filters as unknown as Record<string, unknown>)[minKey] = min.value === "" ? null : Number(min.value);
        (this.filters as unknown as Record<string, unknown>)[maxKey] = max.value === "" ? null : Number(max.value);
        this.emitFilters();
      };
      min.oninput = update;
      max.oninput = update;
      body.append(h("label", { class: "catalog-range" }, h("span", {}, label), min, max));
    }
    const reset = h("button", { type: "button", class: "catalog-reset" }, "Alle Filter zurücksetzen");
    reset.onclick = () => {
      this.filters = { ...EMPTY_CATALOG_FILTERS };
      for (const el of body.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) el.value = "";
      load.value = "all";
      this.emitFilters();
    };
    body.append(reset);
    details.append(body);
    return details;
  }

  private emitFilters(): void { this.onFilterChange({ ...this.filters }); }

  private planeFor(category: Category): ProjectionPlane {
    if (category === "slab" || category === "roof") return "xy";
    if (category === "beam") return "xz";
    if (category === "column") return "xz";
    return "xz";
  }

  private render2D(): void {
    this.svgGroup.replaceChildren();
    if (!this.items.length) {
      this.svgGroup.append(h("text", { x: 30, y: 40, class: "catalog-2d-empty" }, "Keine Bauteile entsprechen den Filtern."));
      this.updateSvgTransform();
      return;
    }

    const groups = new Map<string, CatalogItem[]>();
    for (const item of [...this.items].sort((a, b) => {
      if (this.sort === "material") return a.materialLabel.localeCompare(b.materialLabel, "de");
      if (this.sort === "storey") return a.part.storeyLabel.label.localeCompare(b.part.storeyLabel.label, "de");
      if (this.sort === "size") return [...a.dims].sort((x, y) => y - x)[0] - [...b.dims].sort((x, y) => y - x)[0];
      return CATEGORY_NAMES[a.category].localeCompare(CATEGORY_NAMES[b.category], "de");
    })) {
      const key = this.sort === "material" ? `Material: ${item.materialLabel}`
        : this.sort === "storey" ? `Geschoss: ${item.part.storeyLabel.label}`
        : this.sort === "size" ? `Größe: ${item.geometryLabel}`
        : `Kategorie: ${CATEGORY_NAMES[item.category]}`;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }

    let y = 90;
    for (const [label, list] of groups) {
      const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
      title.setAttribute("x", "30");
      title.setAttribute("y", String(y - 18));
      title.setAttribute("class", "catalog-2d-heading");
      title.textContent = label;
      this.svgGroup.append(title);
      let x = 30;
      let rowHeight = 0;
      for (const item of list) {
        const points = this.projection(item.model, item.key, this.planeFor(item.category));
        if (!points.length) continue;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const point of points) {
          minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]);
          minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]);
        }
        const pw = Math.max(maxX - minX, 0.001);
        const ph = Math.max(maxY - minY, 0.001);
        const scale = Math.min(110 / pw, 90 / ph);
        const width = pw * scale;
        const height = ph * scale;
        if (x + width > 1120) {
          y += rowHeight + 40;
          x = 30;
          rowHeight = 0;
        }
        const dx = x + (110 - width) / 2 - minX * scale;
        const dy = y + (100 - height) / 2 - minY * scale;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", points.map((p, i) => `${i ? "L" : "M"}${(p[0] * scale + dx).toFixed(2)},${(p[1] * scale + dy).toFixed(2)}`).join(" ") + "Z");
        path.setAttribute("class", `catalog-2d-part${this.selected.has(item.id) ? " selected" : ""}`);
        path.dataset.part = item.id;
        path.onclick = (ev) => this.onPick(item.id, ev.ctrlKey || ev.metaKey);
        this.svgGroup.append(path);
        const name = document.createElementNS("http://www.w3.org/2000/svg", "text");
        name.setAttribute("x", String(x + 55));
        name.setAttribute("y", String(y + 108));
        name.setAttribute("text-anchor", "middle");
        name.setAttribute("class", "catalog-2d-name");
        name.textContent = item.part.displayName;
        this.svgGroup.append(name);
        x += 140;
        rowHeight = Math.max(rowHeight, 130);
      }
      y += rowHeight + 55;
    }
    this.svg.setAttribute("viewBox", `0 0 1200 ${Math.max(800, y + 40)}`);
    this.updateSvgTransform();
  }

  private bindSvg(): void {
    this.svg.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      this.zoom = Math.max(0.5, Math.min(4, this.zoom * (ev.deltaY < 0 ? 1.1 : 0.9)));
      this.updateSvgTransform();
    });
    let down: { x: number; y: number } | null = null;
    this.svg.addEventListener("pointerdown", (ev) => {
      down = { x: ev.clientX, y: ev.clientY };
      this.svg.setPointerCapture(ev.pointerId);
    });
    this.svg.addEventListener("pointermove", (ev) => {
      if (!down) return;
      this.pan.x += ev.clientX - down.x;
      this.pan.y += ev.clientY - down.y;
      down = { x: ev.clientX, y: ev.clientY };
      this.updateSvgTransform();
    });
    this.svg.addEventListener("pointerup", () => { down = null; });
  }

  private updateSvgTransform(): void {
    this.svgGroup.setAttribute("transform",
      `translate(${this.pan.x} ${this.pan.y}) scale(${this.zoom})`);
  }

  private paint(): void {
    for (const button of this.root.querySelectorAll<HTMLElement>("[data-mode]")) {
      const on = button.dataset.mode === this.mode;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
    for (const button of this.root.querySelectorAll<HTMLElement>("[data-view]")) {
      const on = button.dataset.view === this.view;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
    this.root.classList.toggle("active", this.mode === "catalog");
  }
}
