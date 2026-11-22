// Das Bedienfeld fuer die Darstellung: es liegt im 3D-Viewport (oben links) und bedient die
// Explosionsdarstellung und die Sichtbarkeit im 3D. Die Bauteiltabelle rechts bleibt davon unberuehrt.
//
// Alles ist deutsch beschriftet, und die Anzeige nennt die Gruppen, die gerade auseinandergezogen
// werden - so ist die Darstellung nachvollziehbar.

import { h } from "./dom";
import type { ExplosionCriterion, ExplosionGroup, VisibilityMode } from "./explosion";

export interface ExplosionState {
  /** Explosion an (true) oder Normalansicht (false). */
  exploded: boolean;
  /** Wonach gruppiert wird. */
  criterion: ExplosionCriterion;
  /** Der Explosionsgrad von 0 bis 1. */
  factor: number;
  /** Was im 3D zu sehen ist. */
  visibility: VisibilityMode;
}

const CRITERIA: [ExplosionCriterion, string][] = [
  ["class", "Nach Bauteiltyp"],
  ["storey", "Nach Geschoss"],
  ["material", "Nach Material"],
  ["selection", "Nach Auswahl"],
];

const VISIBILITY: [VisibilityMode, string, string][] = [
  ["all", "Alle", "Alle Bauteile zeigen"],
  ["selection", "Auswahl", "Nur die ausgewählten Bauteile zeigen"],
  ["filter", "Filter", "Nur die Bauteile zeigen, die der Tabellenfilter findet"],
];

export class ExplosionPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly slider: HTMLInputElement;
  private readonly readout: HTMLElement;
  private readonly groupsLine: HTMLElement;
  private state: ExplosionState = { exploded: false, criterion: "class", factor: 0.6, visibility: "all" };

  /** Wird aufgerufen, wenn sich etwas aendert. */
  onChange: (state: ExplosionState) => void = () => {};

  constructor(container: HTMLElement) {
    const collapse = h("button", { class: "explosion-collapse", type: "button", title: "Bedienfeld einklappen" }, "–");
    this.body = h("div", { class: "explosion-body" });
    this.root = h("section", { class: "explosion-panel", "aria-label": "Darstellung" },
      h("div", { class: "explosion-head" }, h("strong", {}, "Darstellung"), collapse), this.body);
    collapse.onclick = () => {
      const off = this.root.classList.toggle("collapsed");
      collapse.textContent = off ? "+" : "–";
      collapse.title = off ? "Bedienfeld ausklappen" : "Bedienfeld einklappen";
    };

    // Normalansicht / Explosionsdarstellung
    const mode = h("div", { class: "explosion-seg", role: "group", "aria-label": "Darstellungsmodus" });
    const normal = h("button", { type: "button", "data-mode": "normal" }, "Normal");
    const explode = h("button", { type: "button", "data-mode": "explode" }, "Explosion");
    normal.onclick = () => this.set({ exploded: false });
    explode.onclick = () => this.set({ exploded: true });
    mode.append(normal, explode);

    // Gruppierung
    const select = h("select", { class: "explosion-select", "aria-label": "Gruppierung" }) as HTMLSelectElement;
    for (const [value, label] of CRITERIA) select.append(h("option", { value }, label));
    select.onchange = () => this.set({ criterion: select.value as ExplosionCriterion });

    // Explosionsgrad
    this.slider = h("input", {
      class: "explosion-range", type: "range", min: "0", max: "100", step: "1",
      "aria-label": "Explosionsgrad",
    }) as HTMLInputElement;
    this.readout = h("output", { class: "explosion-value" }, "60 %");
    this.slider.oninput = () => this.set({ factor: Number(this.slider.value) / 100, exploded: Number(this.slider.value) > 0 });

    // Sichtbarkeit im 3D
    const vis = h("div", { class: "explosion-seg small", role: "group", "aria-label": "Sichtbarkeit im 3D" });
    const visButtons: HTMLButtonElement[] = [];
    for (const [value, label, title] of VISIBILITY) {
      const b = h("button", { type: "button", "data-vis": value, title }, label) as HTMLButtonElement;
      b.onclick = () => this.set({ visibility: value });
      vis.append(b);
      visButtons.push(b);
    }

    const reset = h("button", { class: "explosion-btn", type: "button", title: "Alle Bauteile an ihre Ausgangsposition" },
      "Zurücksetzen");
    reset.onclick = () => this.set({ exploded: false, factor: 0 });
    const showAll = h("button", { class: "explosion-btn", type: "button", title: "Alle Bauteile im 3D zeigen" }, "Alle anzeigen");
    showAll.onclick = () => this.set({ visibility: "all" });

    this.groupsLine = h("div", { class: "explosion-groups muted" });

    this.body.append(
      mode,
      h("label", { class: "explosion-field" }, h("span", {}, "Gruppierung"), select),
      h("label", { class: "explosion-field" }, h("span", {}, "Grad"), this.slider, this.readout),
      h("div", { class: "explosion-actions" }, reset, showAll),
      vis,
      this.groupsLine,
    );
    container.append(this.root);
    this.paint();
  }

  /** Setzt einen Teil des Zustands und meldet die Änderung. */
  set(patch: Partial<ExplosionState>): void {
    const before = JSON.stringify(this.state);
    this.state = { ...this.state, ...patch };
    if (JSON.stringify(this.state) === before) return;
    this.paint();
    this.onChange(this.state);
  }

  /** Der aktuelle Zustand. */
  getState(): ExplosionState {
    return { ...this.state };
  }

  /** Blendet das Bedienfeld aus (im Bauteilkatalog gibt es keine Explosionsdarstellung). */
  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  /** Die Gruppen der aktuellen Gruppierung (für die Anzeige). */
  setGroups(groups: ExplosionGroup[]): void {
    const text = groups.length
      ? `${groups.length} Gruppen: ${groups.slice(0, 4).map((g) => g.label).join(", ")}${groups.length > 4 ? " …" : ""}`
      : "";
    this.groupsLine.textContent = text;
    this.groupsLine.title = groups.map((g) => `${g.label}: ${g.count} Bauteile`).join(" · ");
  }

  /** Zeigt den Zustand in den Bedienelementen an. */
  private paint(): void {
    const s = this.state;
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-mode]")) {
      const on = b.dataset.mode === (s.exploded ? "explode" : "normal");
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-vis]")) {
      const on = b.dataset.vis === s.visibility;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    const select = this.root.querySelector<HTMLSelectElement>(".explosion-select");
    if (select && select.value !== s.criterion) select.value = s.criterion;
    const percent = Math.round(s.factor * 100);
    if (this.slider.value !== String(percent)) this.slider.value = String(percent);
    this.readout.textContent = `${percent} %`;
    this.root.classList.toggle("exploded", s.exploded);
  }
}