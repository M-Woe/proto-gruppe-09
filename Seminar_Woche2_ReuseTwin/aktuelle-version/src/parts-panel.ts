// Die Bauteiltabelle: sie sitzt in der rechten Panelspalte der Inventory-Seite – in dem Panel, das
// dort schon vorhanden ist („right-top"), nicht in einer eigenen Spalte daneben.
//
// Fünf Reiter mit eigenem Schwerpunkt: Bauteile, Materialien, Geschosse, Geometrie, Eigenschaften.
// Die Übersicht zeigt nur das Wesentliche; alles Weitere steht in den Details zum gewählten Bauteil.
// Jeder Wert behält seine Belegklasse (aus der Datei / berechnet / nicht vorhanden).
//
// Nichts hier verändert die Daten: gesucht, gefiltert und sortiert wird nur, was angezeigt wird.
import { h } from "./dom";
import {
  area as fmtArea, basisLabel, elevation as fmtElevation, length as fmtLength, MISSING,
  number as fmtNumber, propertyLabel, psetLabel, thickness as fmtThickness, volume as fmtVolume, yesNo,
} from "./de";
import type { Evidence, Part, Parts, Value } from "./parts";

/** Wonach sortiert werden kann. */
type SortKey = "displayName" | "type" | "storey" | "model" | "material" | "length" | "width" | "height"
  | "area" | "volume";

interface Column {
  /** Der Schlüssel in der Zeile. */
  key: string;
  /** Die Überschrift, kurz und deutsch. */
  label: string;
  /** Wonach sortiert wird – fehlt, ist die Spalte nicht sortierbar. */
  sort?: SortKey;
  /** Rechtsbündig und mit Tabellenziffern. */
  numeric?: boolean;
  /** Der Erklärtext für den Kopf. */
  title?: string;
}

interface Filters {
  search: string;
  model: string;
  type: string;
  storey: string;
  material: string;
}

const TAB_PARTS = "Bauteile";
const TAB_MATERIAL = "Materialien";
const TAB_STOREYS = "Geschosse";
const TAB_GEOMETRY = "Geometrie";
const TAB_PROPERTIES = "Eigenschaften";
const TABS = [TAB_PARTS, TAB_MATERIAL, TAB_STOREYS, TAB_GEOMETRY, TAB_PROPERTIES];

/** Wie viele Zeilen im DOM sind; der Rest kommt, wenn man ans Ende scrollt. */
const CHUNK = 120;

/** Die Spalten des Reiters „Bauteile". */
const COL_PARTS: Column[] = [
  { key: "displayName", label: "Bauteil", sort: "displayName" },
  { key: "type", label: "Typ", sort: "type" },
  { key: "storey", label: "Geschoss", sort: "storey" },
  { key: "model", label: "Modell", sort: "model" },
];

/** Die Spalten des Reiters „Geometrie". */
const COL_GEOMETRY: Column[] = [
  { key: "displayName", label: "Bauteil", sort: "displayName" },
  { key: "length", label: "Länge", sort: "length", numeric: true },
  { key: "width", label: "Breite", sort: "width", numeric: true },
  { key: "height", label: "Höhe", sort: "height", numeric: true },
  { key: "area", label: "Fläche", sort: "area", numeric: true },
  { key: "volume", label: "Volumen", sort: "volume", numeric: true },
];

/** Der Punkt, der zeigt, woher ein Wert kommt. */
function evDot(v: Value, show = true): HTMLElement | null {
  if (!show) return null;
  const cls = v.evidence === "source" ? "ev-source" : v.evidence === "computed" ? "ev-computed" : "ev-unknown";
  const title = v.evidence === "source" ? "aus der IFC-Datei gelesen"
    : v.evidence === "computed" ? "vom Core aus der Geometrie berechnet" : "in der IFC-Datei nicht vorhanden";
  return h("i", { class: `evd ${cls}`, title, "aria-label": title });
}

/** Der Wert einer Zelle, mit Einheit und Belegpunkt. */
function cellValue(v: Value, format: (n: number) => string): HTMLElement {
  const box = h("span", { class: "v" });
  if (typeof v.value === "number") box.append(format(v.value));
  else if (v.value === null) box.append(h("span", { class: "muted" }, MISSING));
  else box.append(String(v.value));
  const dot = evDot(v, v.evidence !== "source");
  if (dot) box.append(dot);
  box.title = v.note ?? "";
  return box;
}

/** Der Vergleichswert einer Spalte. */
function sortValue(p: Part, key: SortKey): number | string {
  switch (key) {
    case "displayName": return p.displayName;
    case "type": return p.type;
    case "storey": return p.storeyLabel.label;
    case "model": return p.modelCode;
    case "material": return p.materialLabel.label;
    case "length": return typeof p.length.value === "number" ? p.length.value : -Infinity;
    case "width": return typeof p.width.value === "number" ? p.width.value : -Infinity;
    case "height": return typeof p.height.value === "number" ? p.height.value : -Infinity;
    case "area": return typeof p.area.value === "number" ? p.area.value : -Infinity;
    case "volume": return typeof p.volume.value === "number" ? p.volume.value : -Infinity;
  }
}
/** Die Bauteiltabelle in der rechten Panelspalte. */
export class PartsPanel {
  private readonly root: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly filtersEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private tab = TAB_PARTS;
  private sort: { key: SortKey; dir: 1 | -1 } = { key: "displayName", dir: 1 };
  private filters: Filters = { search: "", model: "", type: "", storey: "", material: "" };
  private catalogFilter: Set<string> | null = null;
  /** Die ausgewählten Bauteile (die eindeutigen Ids). Die Auswahl selbst führt die Seite. */
  private selected = new Set<string>();

  /** Wird aufgerufen, wenn in der Tabelle ein Bauteil angeklickt wird (Strg/Cmd: zur Auswahl dazu). */
  onPick: (id: string, additive: boolean) => void = () => {};
  /** Wird aufgerufen, wenn die Kamera auf die Auswahl zoomen soll. */
  onFocus: () => void = () => {};
  /** Wird aufgerufen, wenn sich der Filter aendert (für die Sichtbarkeit im 3D). */
  onFilter: () => void = () => {};

  /** Die Ids der Bauteile, die der aktuelle Filter findet - für die Sichtbarkeit im 3D. */
  filteredIds(): string[] {
    return this.visible().map((p) => p.id);
  }

  /** Beschraenkt die Tabelle auf die Elemente des aktiven Katalogfilters. */
  setCatalogFilter(ids: string[] | null): void {
    this.catalogFilter = ids === null ? null : new Set(ids);
    this.render();
  }

  constructor(private readonly parts: Parts, container: HTMLElement) {
    this.root = h("div", { class: "parts-panel" });
    this.tabsEl = h("div", { class: "parts-tabs", role: "tablist", "aria-label": "Ansicht der Bauteile" });
    this.filtersEl = h("div", { class: "parts-filters" });
    this.bodyEl = h("div", { class: "parts-body" });
    this.root.append(this.tabsEl, this.filtersEl, this.bodyEl);
    container.replaceChildren(this.root);
    this.buildTabs();
    this.buildFilters();
    this.render();
  }

  /** Die Reiter über der Tabelle. */
  private buildTabs(): void {
    for (const name of TABS) {
      const b = h("button", {
        class: "parts-tab", type: "button", role: "tab",
        "aria-selected": name === this.tab ? "true" : "false",
      }, name);
      b.onclick = () => {
        if (this.tab === name) return;
        this.tab = name;
        for (const other of this.tabsEl.children) other.setAttribute("aria-selected", "false");
        b.setAttribute("aria-selected", "true");
        this.render();
      };
      this.tabsEl.append(b);
    }
  }

  /** Suche, Filter und Zurücksetzen. */
  private buildFilters(): void {
    const search = h("input", {
      class: "parts-search", type: "search", placeholder: "Suchen…",
      "aria-label": "Bauteile durchsuchen",
    }) as HTMLInputElement;
    search.oninput = () => {
      this.filters.search = search.value.trim().toLowerCase();
      this.render();
      this.onFilter();
    };
    const model = this.selectFilter(
      "Alle Modelle",
      this.parts.models.map((m) => ({ value: m.label, label: `${m.code} – ${m.file}` })),
      (v) => { this.filters.model = v; this.render(); this.onFilter(); },
    );
    const type = this.selectFilter(
      "Alle Typen",
      this.parts.types.map((t) => ({ value: t, label: t })),
      (v) => { this.filters.type = v; this.render(); this.onFilter(); },
    );
    const storey = this.selectFilter(
      "Alle Geschosse",
      this.parts.storeys.map((s) => ({ value: s, label: s })),
      (v) => { this.filters.storey = v; this.render(); this.onFilter(); },
    );
    const material = this.selectFilter(
      "Alle Materialien",
      this.parts.materials.map((s) => ({ value: s, label: s })),
      (v) => { this.filters.material = v; this.render(); this.onFilter(); },
    );
    const reset = h("button", { class: "parts-reset", type: "button", title: "Alle Filter zurücksetzen" },
      "Zurücksetzen");
    reset.onclick = () => this.resetFilters();
    this.filtersEl.append(search, model, type, storey, material, reset);
  }

  /** Ein Auswahlfeld mit einem Platzhalter an erster Stelle. */
  private selectFilter(
    placeholder: string,
    options: { value: string; label: string }[],
    onChange: (value: string) => void,
  ): HTMLSelectElement {
    const sel = h("select", { class: "parts-select", "aria-label": placeholder }) as HTMLSelectElement;
    sel.append(h("option", { value: "" }, placeholder));
    for (const o of options) sel.append(h("option", { value: o.value }, o.label));
    sel.onchange = () => onChange(sel.value);
    return sel;
  }

  /** Die Bauteile, die den Filtern entsprechen, sortiert. */
  private visible(): Part[] {
    const f = this.filters;
    const q = f.search;
    const list = this.parts.parts.filter((p) => {
      if (this.catalogFilter && !this.catalogFilter.has(p.id)) return false;
      if (f.model && p.model !== f.model) return false;
      if (f.type && p.type !== f.type) return false;
      if (f.storey && p.storeyLabel.label !== f.storey) return false;
      if (f.material && p.materialLabel.label !== f.material) return false;
      if (!q) return true;
      const hay = [
        p.displayName, p.fullName, p.type, p.name, p.objectType ?? "", p.typeName ?? "",
        p.globalId, p.reference ?? "", p.ifcClass, p.materialLabel.label, p.storeyLabel.label, p.modelCode,
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
    const { key, dir } = this.sort;
    return list.sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "de") * dir;
    });
  }

  /** Baut die Ansicht neu auf – mit erhaltenem Scrollstand. */
  private render(): void {
    const top = this.bodyEl.scrollTop;
    const list = this.visible();
    if (this.tab === TAB_PROPERTIES) this.renderDetails();
    else if (this.tab === TAB_MATERIAL) this.renderMaterials(list);
    else if (this.tab === TAB_STOREYS) this.renderStoreys(list);
    else if (this.tab === TAB_GEOMETRY) this.renderTable(list, COL_GEOMETRY);
    else this.renderTable(list, COL_PARTS);
    const notice = this.notice();
    if (notice) this.bodyEl.prepend(notice);
    this.bodyEl.scrollTop = top;
  }

  /** Die Übersichtstabelle (Bauteile und Geometrie). */
  private renderTable(list: Part[], cols: Column[]): void {
    const table = h("table", { class: "parts-table" });
    const head = h("tr");
    for (const c of cols) {
      const th = h("th", { class: `${c.numeric ? "num" : ""} col-${c.key}`, title: c.title ?? "" });
      th.append(c.label);
      const key = c.sort;
      if (key) {
        th.classList.add("sortable");
        if (this.sort.key === key) {
          th.classList.add("sorted");
          th.append(h("span", { class: "parts-arrow" }, this.sort.dir > 0 ? "▲" : "▼"));
        }
        th.onclick = () => {
          if (this.sort.key === key) this.sort = { key, dir: this.sort.dir > 0 ? -1 : 1 };
          else this.sort = { key, dir: 1 };
          this.render();
        };
      }
      head.append(th);
    }
    table.append(h("thead", {}, head));
    const tbody = h("tbody");
    table.append(tbody);

    const caption = this.caption(`${list.length} von ${this.parts.parts.length} Bauteilen`, this.unitsNote());
    if (!list.length) {
      tbody.append(h("tr", {}, h("td", { class: "parts-empty", colspan: cols.length },
        "Keine Bauteile in der Auswahl.")));
      this.bodyEl.replaceChildren(caption, table);
      return;
    }

    // Die Zeilen kommen stückweise dazu, damit auch ein sehr großes Modell flüssig bleibt.
    let shown = 0;
    let observer: IntersectionObserver | null = null;
    const appendChunk = (): void => {
      observer?.disconnect();
      const end = Math.min(shown + CHUNK, list.length);
      const frag = document.createDocumentFragment();
      for (; shown < end; shown++) frag.append(this.row(list[shown], cols));
      tbody.append(frag);
      if (shown < list.length) {
        const more = h("tr", { class: "parts-more" },
          h("td", { colspan: cols.length, title: `${list.length - shown} weitere Bauteile` }, `${list.length - shown} weitere …`));
        tbody.append(more);
        observer = new IntersectionObserver((entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          appendChunk();
        }, { root: this.bodyEl, rootMargin: "160px" });
        observer.observe(more);
      }
    };
    appendChunk();
    this.bodyEl.replaceChildren(caption, table);
  }

  /** Eine Zeile der Übersichtstabelle. */
  private row(p: Part, cols: Column[]): HTMLElement {
    const tr = h("tr", { "data-part": p.id, title: p.fullName });
    if (this.selected.has(p.id)) tr.classList.add("selected");
    for (const c of cols) {
      const td = h("td", { class: c.numeric ? "num" : "" });
      switch (c.key) {
        case "displayName":
          td.append(p.displayName);
          td.title = `${p.fullName}\nOriginal: ${p.name}`;
          break;
        case "type":
          td.append(p.type);
          td.title = `${p.type} – belegt durch ${basisLabel(p.naming.basis)}: ${p.naming.raw}`;
          break;
        case "storey":
          td.append(p.storeyLabel.short);
          td.title = p.storey
            ? `Original: ${p.storey}${p.storeyLabel.translated ? "" : " – das Kürzel ließ sich nicht übersetzen"}`
            : MISSING;
          break;
        case "model":
          td.append(p.modelCode);
          td.title = p.modelFile;
          break;
        case "length": td.append(cellValue(p.length, fmtLength)); break;
        case "width": td.append(cellValue(p.width, fmtLength)); break;
        case "height": td.append(cellValue(p.height, fmtLength)); break;
        case "area": td.append(cellValue(p.area, fmtArea)); break;
        case "volume": td.append(cellValue(p.volume, fmtVolume)); break;
      }
      tr.append(td);
    }
    tr.onclick = (ev) => this.choose(p.id, ev.ctrlKey || ev.metaKey);
    return tr;
  }

  /** Die Zeile über der Tabelle: was gerade steht, und in welchen Einheiten. */
  private caption(text: string, note: string): HTMLElement {
    const cap = h("div", { class: "parts-caption" },
      h("span", {}, text),
      h("span", { class: "muted", title: note }, note));
    if (this.selected.size) {
      const zoom = h("button", { class: "parts-zoom", type: "button", title: "Die Kamera auf die Auswahl richten" },
        "Zoomen");
      zoom.onclick = () => this.onFocus();
      cap.append(zoom);
    }
    return cap;
  }

  /**
   * Der Hinweis über der Tabelle: die Auswahl ist da, aber vom Filter verborgen. Dann ist das
   * Bauteil zwar im 3D-Viewer markiert, in der Liste aber nicht zu sehen – der Hinweis bietet an,
   * die Filter zurückzusetzen.
   */
  private notice(): HTMLElement | null {
    if (!this.selected.size) return null;
    if (this.visible().some((p) => this.selected.has(p.id))) return null;
    const bar = h("div", { class: "parts-notice" },
      h("span", {}, "Die Auswahl ist vom Filter verborgen."),
      h("button", { class: "parts-notice-btn", type: "button" }, "Filter zurücksetzen"));
    const btn = bar.querySelector("button");
    if (btn) btn.onclick = () => this.resetFilters();
    return bar;
  }

  /** Setzt alle Filter zurück. */
  private resetFilters(): void {
    this.filters = { search: "", model: "", type: "", storey: "", material: "" };
    for (const el of this.filtersEl.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
      el.value = "";
    }
    this.render();
    this.onFilter();
  }

  /** Der Hinweis auf der rechten Seite der Kopfzeile. */
  private unitsNote(): string {
    return this.tab === TAB_GEOMETRY
      ? "Länge, Breite und Höhe in m · Fläche in m² · Volumen in m³"
      : `${this.parts.models.length} Modelle`;
  }
  /** Der Reiter „Materialien": die Bauteile nach Material gruppiert. */
  private renderMaterials(list: Part[]): void {
    interface Mat {
      label: string;
      raw: string;
      count: number;
      volume: number;
      hasVolume: boolean;
      layers: Map<string, { count: number; thickness: number | null; label: string }>;
    }
    const mats = new Map<string, Mat>();
    let without = 0;
    let withoutVolume = 0;
    let withoutHasVolume = false;
    for (const p of list) {
      if (!p.material) {
        without++;
        if (typeof p.volume.value === "number") { withoutVolume += p.volume.value; withoutHasVolume = true; }
        continue;
      }
      const key = p.materialLabel.raw;
      let m = mats.get(key);
      if (!m) {
        m = { label: p.materialLabel.label, raw: key, count: 0, volume: 0, hasVolume: false, layers: new Map() };
        mats.set(key, m);
      }
      m.count++;
      if (typeof p.volume.value === "number") { m.volume += p.volume.value; m.hasVolume = true; }
      for (const l of p.layers) {
        const cur = m.layers.get(l.material) ?? { count: 0, thickness: null, label: l.label };
        cur.count++;
        if (l.thickness !== null) cur.thickness = Math.max(cur.thickness ?? 0, l.thickness);
        m.layers.set(l.material, cur);
      }
    }
    const rows = [...mats.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));
    const table = h("table", { class: "parts-table" });
    const head = h("tr");
    const matHeads: [string, string, boolean][] = [
      ["Material", "col-material", false],
      ["Schichten", "col-layers", false],
      ["Schichtdicke", "col-thickness", true],
      ["Bauteile", "col-count", true],
      ["Volumen", "col-volume", true],
    ];
    for (const [label, cls, num] of matHeads) {
      head.append(h("th", { class: `${cls}${num ? " num" : ""}` }, label));
    }
    table.append(h("thead", {}, head));
    const tbody = h("tbody");
    for (const m of rows) {
      const layers = [...m.layers.values()].map((l) => `${l.label} (${l.count}×)`).join(", ");
      const thick = [...m.layers.values()].map((l) => (l.thickness === null ? MISSING : fmtThickness(l.thickness)))
        .join(" / ");
      const tr = h("tr", { title: `Original: ${m.raw}` },
        h("td", {}, m.label),
        h("td", { title: layers }, layers || MISSING),
        h("td", { class: "num" }, thick || MISSING),
        h("td", { class: "num" }, String(m.count)),
        h("td", { class: "num" }, m.hasVolume ? fmtVolume(m.volume) : MISSING));
      tbody.append(tr);
    }
    if (without) {
      tbody.append(h("tr", { class: "parts-muted" },
        h("td", {}, "Ohne Materialzuordnung"),
        h("td", {}, MISSING),
        h("td", { class: "num" }, MISSING),
        h("td", { class: "num" }, String(without)),
        h("td", { class: "num" }, withoutHasVolume ? fmtVolume(withoutVolume) : MISSING)));
    }
    if (!rows.length && !without) {
      tbody.append(h("tr", {}, h("td", { class: "parts-empty", colspan: 5 }, "Keine Materialien in der Auswahl.")));
    }
    table.append(tbody);
    this.bodyEl.replaceChildren(this.caption(`${rows.length} Materialien`, this.unitsNote()), table);
  }

  /** Der Reiter „Geschosse": die Bauteile nach Gebäude und Geschoss gruppiert. */
  private renderStoreys(list: Part[]): void {
    interface Storey {
      building: string;
      name: string;
      raw: string;
      translated: boolean;
      elevation: number | null;
      parts: Part[];
      models: Set<string>;
    }
    const storeys = new Map<string, Storey>();
    for (const p of list) {
      // Der Geschossschlüssel ist in jedem Modell desselben Gebäudes derselbe, so landen die
      // Geschosse beider Modelle in derselben Gruppe.
      const key = `${p.building ?? ""} ${p.storeyKey ?? p.storeyLabel.label}`;
      let s = storeys.get(key);
      if (!s) {
        s = {
          building: p.building ?? "Gebäude", name: p.storeyLabel.label, raw: p.storey ?? "",
          translated: p.storeyLabel.translated,
          elevation: p.storeyElevation, parts: [], models: new Set(),
        };
        storeys.set(key, s);
      }
      s.parts.push(p);
      s.models.add(p.modelCode);
    }
    const groups = [...storeys.values()].sort((a, b) =>
      a.building.localeCompare(b.building, "de") || (a.elevation ?? 0) - (b.elevation ?? 0));
    const wrap = h("div", { class: "parts-groups" });
    for (const s of groups) {
      const box = h("details", { class: "parts-group" }) as HTMLDetailsElement;
      box.open = true;
      box.append(h("summary", {},
        h("span", {
          class: "parts-group-name",
          title: s.raw ? `Original: ${s.raw}${s.translated ? "" : " – das Kürzel ließ sich nicht übersetzen"}` : "",
        }, s.name),
        h("span", { class: "muted" }, s.elevation === null ? "" : fmtElevation(s.elevation)),
        h("span", { class: "chip" }, [...s.models].join(" + ")),
        h("span", { class: "chip" }, `${s.parts.length} Bauteile`)));
      const list2 = h("ul", { class: "parts-group-list" });
      for (const p of s.parts.sort((a, b) => a.displayName.localeCompare(b.displayName, "de"))) {
        const li = h("li", { "data-part": p.id, title: p.fullName },
          h("span", { class: "parts-group-item" }, p.displayName),
          h("span", { class: "muted" }, p.type));
        if (this.selected.has(p.id)) li.classList.add("selected");
        li.onclick = (ev) => this.choose(p.id, ev.ctrlKey || ev.metaKey);
        list2.append(li);
      }
      box.append(list2);
      wrap.append(box);
    }
    if (!groups.length) wrap.append(h("p", { class: "parts-empty" }, "Keine Geschosse in der Auswahl."));
    this.bodyEl.replaceChildren(this.caption(`${groups.length} Geschosse`, this.unitsNote()), wrap);
  }

  /** Der Reiter „Eigenschaften": die Details zum gewählten Bauteil. */
  private renderDetails(): void {
    const first = [...this.selected][0];
    const p = first ? this.parts.get(first) : undefined;
    if (!p) {
      this.bodyEl.replaceChildren(
        this.caption("Eigenschaften", this.unitsNote()),
        h("p", { class: "parts-empty" },
          "Kein Bauteil gewählt. Ein Klick in der Übersicht zeigt hier seine Eigenschaften."));
      return;
    }
    const wrap = h("div", { class: "parts-detail" });
    wrap.append(h("div", { class: "parts-detail-head" },
      h("strong", {}, p.fullName),
      h("span", { class: "muted", title: p.name }, `Original: ${p.name}`)));

    // 1. Identifikation
    wrap.append(this.section("Identifikation", [
      ["Bezeichnung", p.fullName, "source"],
      ["Ursprünglicher Name", p.name || MISSING, "source"],
      ["IFC-Klasse", p.ifcClass, "source"],
      ["PredefinedType", p.predefinedType ?? MISSING, "source"],
      ["GlobalId", p.globalId, "source"],
      ["IFC-Modell", `${p.modelCode} – ${p.modelFile}`, "source"],
      ["Geschoss", p.storeyLabel.label, "source"],
      ["Planbezug", p.reference ?? MISSING, "source"],
    ]));

    // 2. Geometrie
    wrap.append(this.section("Geometrie", [
      ["Länge", fmtLength(p.length.value as number | null), p.length.evidence],
      ["Breite", fmtLength(p.width.value as number | null), p.width.evidence],
      ["Höhe", fmtLength(p.height.value as number | null), p.height.evidence],
      ["Fläche", fmtArea(p.area.value as number | null), p.area.evidence],
      ["Volumen", fmtVolume(p.volume.value as number | null), p.volume.evidence],
    ]));

    // 3. Material
    const matRows: [string, string, Evidence][] = [
      ["Material", p.materialLabel.label, p.material ? "source" : "unknown"],
      ["Original", p.material ?? MISSING, p.material ? "source" : "unknown"],
      ["Schichten", p.layers.length ? String(p.layers.length) : MISSING, p.layers.length ? "source" : "unknown"],
      ["Gesamtdicke", fmtThickness(p.thickness), p.thickness !== null ? "source" : "unknown"],
    ];
    for (const l of p.layers) {
      matRows.push([`Schicht: ${l.label}`, fmtThickness(l.thickness), l.thickness !== null ? "source" : "unknown"]);
    }
    wrap.append(this.section("Material", matRows));

    // 4. Weitere Eigenschaften
    const other: [string, string, Evidence][] = [
      ["Tragende Funktion", yesNo(p.loadBearing.value === null ? null : Boolean(p.loadBearing.value)), p.loadBearing.evidence],
      ["Außen- oder Innenbauteil", yesNo(p.isExternal.value === null ? null : Boolean(p.isExternal.value)), p.isExternal.evidence],
      ["Feuerwiderstand", p.fireRating.value === null ? MISSING : String(p.fireRating.value), p.fireRating.evidence],
      ["Wärmedurchgangskoeffizient", p.thermalTransmittance.value === null
        ? MISSING : `${fmtNumber(Number(p.thermalTransmittance.value), 2)} W/m²K`, p.thermalTransmittance.evidence],
    ];
    const known = new Set(["LoadBearing", "IsExternal", "FireRating", "ThermalTransmittance", "Reference"]);
    const rest = p.psets.filter((x) => !known.has(x.name));
    wrap.append(this.section("Weitere Eigenschaften", other));
    if (rest.length) {
      const byPset = new Map<string, { name: string; value: string }[]>();
      for (const x of rest) {
        const list3 = byPset.get(x.pset) ?? [];
        list3.push(x);
        byPset.set(x.pset, list3);
      }
      for (const [pset, props] of byPset) {
        wrap.append(this.section(psetLabel(pset), props.map((x) =>
          [propertyLabel(x.name), x.value, "source"] as [string, string, Evidence])));
      }
    }

    // 5. Wie die deutsche Bezeichnung zustande kam
    const beleg = this.section("Beleg der Bezeichnung", p.naming.sources.map((s) =>
      [s.label, s.value, "source"] as [string, string, Evidence]));
    wrap.append(beleg);
    this.bodyEl.replaceChildren(this.caption("Eigenschaften des gewählten Bauteils", this.unitsNote()), wrap);
  }

  /** Ein Abschnitt der Detailansicht. */
  private section(title: string, rows: [string, string, Evidence][]): HTMLElement {
    const dl = h("dl", { class: "facts" });
    for (const [k, v, evidence] of rows) {
      const dot = evDot({ value: v, evidence }, true);
      dl.append(h("dt", {}, k), h("dd", {}, v, dot ?? ""));
    }
    return h("section", { class: "parts-detail-section" }, h("h4", {}, title), dl);
  }

  /** Ein Bauteil wurde angeklickt: die Seite entscheidet, was das für die Auswahl bedeutet. */
  private choose(id: string, additive: boolean): void {
    this.onPick(id, additive);
  }

  /** Setzt die Auswahl (von der Seite aus) und markiert die Zeilen. */
  setSelection(ids: string[]): void {
    this.selected = new Set(ids);
    this.render();
    for (const row of this.bodyEl.querySelectorAll<HTMLElement>("[data-part]")) {
      if (this.selected.has(row.dataset.part ?? "")) {
        row.scrollIntoView({ block: "nearest" });
        break;
      }
    }
  }
}
