// Die Bauteil-Infokarte: ein kleines Panel am linken unteren Rand des 3D-Viewports. Es erscheint,
// sobald ein Bauteil ausgewählt ist, und beschreibt das Bauteil in denselben deutschen Worten wie die
// Bauteiltabelle (die Benennungslogik steckt in src/de.ts, die Daten in src/parts.ts).
//
// Die Karte zeigt nur, was die Datei hergibt: fehlende Werte stehen als „Nicht vorhanden" da, und
// berechnete Werte sind als solche gekennzeichnet. Die Originaldaten bleiben im erweiterten Bereich
// sichtbar – die Karte ersetzt die IFC-Datei nicht, sie erklärt sie.

import { h } from "./dom";
import {
  area as fmtArea, elevation as fmtElevation, length as fmtLength, MISSING, number as fmtNumber,
  propertyLabel, psetLabel, thickness as fmtThickness, volume as fmtVolume, yesNo,
} from "./de";
import type { Part, Parts } from "./parts";

/** Eine Zeile der Infokarte: Bezeichnung, Wert und Belegklasse. */
type Row = [string, string, "source" | "computed" | "unknown"];

export class InfoCard {
  private readonly root: HTMLElement;
  private readonly head: HTMLElement;
  private readonly body: HTMLElement;
  private readonly moreButton: HTMLButtonElement;
  private readonly focusButton: HTMLButtonElement;
  private extended = false;
  private ids: string[] = [];

  /** Wird aufgerufen, wenn die Kamera auf die Auswahl zoomen soll. */
  onFocus: () => void = () => {};

  constructor(private readonly parts: Parts, container: HTMLElement) {
    this.head = h("div", { class: "info-head" });
    this.body = h("div", { class: "info-body" });
    this.moreButton = h("button", { class: "info-btn", type: "button", "aria-expanded": "false" },
      "Weitere Details") as HTMLButtonElement;
    this.focusButton = h("button", { class: "info-btn", type: "button" }, "Auf Bauteil zoomen") as HTMLButtonElement;
    this.moreButton.onclick = () => {
      this.extended = !this.extended;
      this.moreButton.textContent = this.extended ? "Weniger Details" : "Weitere Details";
      this.moreButton.setAttribute("aria-expanded", this.extended ? "true" : "false");
      this.render();
    };
    this.focusButton.onclick = () => this.onFocus();
    this.root = h("aside", { class: "info-card", "aria-label": "Bauteil-Info", hidden: true },
      this.head, this.body, h("div", { class: "info-actions" }, this.moreButton, this.focusButton));
    container.append(this.root);
  }

  /** Ist die Karte sichtbar? */
  get visible(): boolean {
    return !this.root.hasAttribute("hidden");
  }

  /** Zeigt die Auswahl – ein Bauteil oder mehrere. */
  show(ids: string[]): void {
    this.ids = ids;
    if (!ids.length) {
      this.hide();
      return;
    }
    this.root.removeAttribute("hidden");
    this.render();
  }

  /** Schließt die Karte. */
  hide(): void {
    this.root.setAttribute("hidden", "");
    this.ids = [];
  }

  /** Baut den Inhalt neu auf. */
  private render(): void {
    const parts = this.ids.map((id) => this.parts.get(id)).filter((p): p is Part => !!p);
    if (!parts.length) {
      this.head.replaceChildren(h("strong", {}, "Auswahl"));
      this.body.replaceChildren(h("p", { class: "info-empty" }, "Für dieses Bauteil liegen keine Daten vor."));
      return;
    }
    if (parts.length > 1) this.renderMany(parts);
    else this.renderOne(parts[0]);
  }

  /** Die Standardansicht: ein Bauteil mit seinen wichtigsten Angaben. */
  private renderOne(p: Part): void {
    this.head.replaceChildren(
      h("strong", { title: p.fullName }, p.fullName),
      h("span", { class: "muted" }, p.modelCode),
      this.closeButton(),
    );
    const rows: [string, Row[]][] = [
      ["Bauteil", [
        ["Typ", p.type, "source"],
        ["IFC-Klasse", p.ifcClass, "source"],
        ["IFC-Modell", `${p.modelCode} – ${p.modelFile}`, "source"],
      ]],
      ["Material", [
        ["Material", p.materialLabel.label, p.material ? "source" : "unknown"],
        ["Schichten", p.layers.length ? p.layers.map((l) => l.label).join(", ") : MISSING,
          p.layers.length ? "source" : "unknown"],
        ["Gesamtdicke", fmtThickness(p.thickness), p.thickness !== null ? "source" : "unknown"],
      ]],
      ["Geometrie", [
        ["Länge", fmtLength(p.length.value as number | null), p.length.evidence],
        ["Breite", fmtLength(p.width.value as number | null), p.width.evidence],
        ["Höhe", fmtLength(p.height.value as number | null), p.height.evidence],
        ["Fläche", fmtArea(p.area.value as number | null), p.area.evidence],
        ["Volumen", fmtVolume(p.volume.value as number | null), p.volume.evidence],
      ]],
      ["Position", [
        ["Geschoss", p.storeyLabel.label, p.storey ? "source" : "unknown"],
        ["Höhenlage", fmtElevation(p.storeyElevation), p.storeyElevation !== null ? "computed" : "unknown"],
      ]],
      ["Funktion", [
        ["Tragend", yesNo(p.loadBearing.value === null ? null : Boolean(p.loadBearing.value)), p.loadBearing.evidence],
        ["Außen- oder Innenbauteil", yesNo(p.isExternal.value === null ? null : Boolean(p.isExternal.value)),
          p.isExternal.evidence],
      ]],
    ];
    this.body.replaceChildren(...rows.map(([title, list]) => this.section(title, list)));
    if (this.extended) this.body.append(...this.extendedSections(p));
  }

  /** Die erweiterte Ansicht: alles, was die Datei über das Bauteil hergibt. */
  private extendedSections(p: Part): HTMLElement[] {
    const out: HTMLElement[] = [];

    // Identifikation: hier stehen die Originalbezeichnungen der IFC-Datei.
    out.push(this.section("Identifikation", [
      ["Ursprünglicher Name", p.name || MISSING, "source"],
      ["GlobalId", p.globalId, "source"],
      ["ObjectType", p.objectType ?? MISSING, "source"],
      ["PredefinedType", p.predefinedType ?? MISSING, "source"],
      ["Bauteiltyp", p.type, "source"],
      ["Typ (IFC-Klasse)", p.naming.base, "source"],
    ]));

    // Material: der ganze Schichtaufbau mit den Dicken.
    const mat: Row[] = [
      ["Material", p.materialLabel.label, p.material ? "source" : "unknown"],
      ["Original", p.material ?? MISSING, p.material ? "source" : "unknown"],
      ["Gesamtdicke", fmtThickness(p.thickness), p.thickness !== null ? "source" : "unknown"],
    ];
    for (const l of p.layers) {
      mat.push([`Schicht: ${l.label}`, fmtThickness(l.thickness), l.thickness !== null ? "source" : "unknown"]);
      mat.push([`  Original: ${l.material}`, "", "source"]);
    }
    out.push(this.section("Material", mat));

    // Geometrie: alle Maße, dazu die verfügbaren Flächenangaben der Datei.
    const geo: Row[] = [
      ["Länge", fmtLength(p.length.value as number | null), p.length.evidence],
      ["Breite", fmtLength(p.width.value as number | null), p.width.evidence],
      ["Höhe", fmtLength(p.height.value as number | null), p.height.evidence],
      ["Fläche", fmtArea(p.area.value as number | null), p.area.evidence],
      ["Volumen", fmtVolume(p.volume.value as number | null), p.volume.evidence],
    ];
    out.push(this.section("Geometrie", geo));

    // Bauphysikalische Eigenschaften.
    const phys: Row[] = [
      ["Wärmedurchgangskoeffizient", p.thermalTransmittance.value === null
        ? MISSING
        : `${fmtNumber(Number(p.thermalTransmittance.value), 2)} W/m²K`, p.thermalTransmittance.evidence],
      ["Feuerwiderstand", p.fireRating.value === null ? MISSING : String(p.fireRating.value),
        p.fireRating.evidence],
    ];
    out.push(this.section("Bauphysikalische Eigenschaften", phys));

    // Die Property-Sets der Datei, nach Satz gruppiert. Der deutsche Name steht vor dem originalen.
    const known = new Set(["LoadBearing", "IsExternal", "FireRating", "ThermalTransmittance", "Reference"]);
    const rest = p.psets.filter((x) => !known.has(x.name));
    const byPset = new Map<string, { name: string; value: string }[]>();
    for (const x of rest) {
      const list = byPset.get(x.pset) ?? [];
      list.push(x);
      byPset.set(x.pset, list);
    }
    for (const [pset, props] of byPset) {
      out.push(this.section(psetLabel(pset), props.map((x) =>
        [`${propertyLabel(x.name)} (${x.name})`, x.value, "source"] as Row)));
    }
    return out;
  }

  /** Die Übersicht bei mehreren ausgewählten Bauteilen. */
  private renderMany(parts: Part[]): void {
    const types = [...new Set(parts.map((p) => p.type))];
    const materials = [...new Set(parts.map((p) => p.materialLabel.label).filter((m) => m !== MISSING))];
    const models = [...new Set(parts.map((p) => p.modelCode))];
    let volume = 0;
    let hasVolume = false;
    for (const p of parts) {
      if (typeof p.volume.value === "number") { volume += p.volume.value; hasVolume = true; }
    }
    this.head.replaceChildren(
      h("strong", {}, `${parts.length} Bauteile ausgewählt`),
      this.closeButton(),
    );
    const rows: [string, Row[]][] = [
      ["Übersicht", [
        ["Bauteiltypen", types.join(", "), "source"],
        ["Materialien", materials.length ? materials.join(", ") : MISSING, materials.length ? "source" : "unknown"],
        ["Modelle", models.join(", "), "source"],
        ["Gesamtvolumen", hasVolume ? fmtVolume(volume) : MISSING, hasVolume ? "computed" : "unknown"],
      ]],
    ];
    const list = this.section("Ausgewählte Bauteile", []);
    const ul = h("ul", { class: "info-list" });
    for (const p of parts.slice(0, 60)) {
      ul.append(h("li", {}, `${p.fullName}`, h("span", { class: "muted" }, ` – ${p.modelCode}`)));
    }
    if (parts.length > 60) ul.append(h("li", { class: "muted" }, `… und ${parts.length - 60} weitere`));
    this.body.replaceChildren(...rows.map(([title, r]) => this.section(title, r)), list);
    list.append(ul);
    if (this.extended) {
      for (const p of parts.slice(0, 8)) {
        this.body.append(h("h5", { class: "info-sub" }, p.fullName), ...this.extendedSections(p));
      }
    }
  }

  /** Ein Abschnitt der Karte. */
  private section(title: string, rows: Row[]): HTMLElement {
    const dl = h("dl", { class: "info-list-defs" });
    for (const [k, v, evidence] of rows) {
      const dot = h("i", {
        class: `evd ${evidence === "source" ? "ev-source" : evidence === "computed" ? "ev-computed" : "ev-unknown"}`,
        title: evidence === "source" ? "aus der IFC-Datei gelesen"
          : evidence === "computed" ? "vom Core berechnet" : "in der IFC-Datei nicht vorhanden",
      });
      dl.append(h("dt", {}, k), h("dd", {}, v, v ? dot : ""));
    }
    return h("section", { class: "info-section" }, h("h4", {}, title), dl);
  }

  /** Der Knopf zum Schließen der Karte. */
  private closeButton(): HTMLElement {
    const b = h("button", { class: "info-close", type: "button", title: "Karte schließen" }, "×");
    b.onclick = () => this.hide();
    return b;
  }
}