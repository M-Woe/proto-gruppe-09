import * as THREE from "three";
import { api, type IngestResult } from "./api";
import { AnchorAnalysisPanel } from "./anchor-analysis";
import {
  classificationLabels,
  connectionLabels,
  errorMessage,
  readAnchorRecords,
  writeAnchorRecords,
  type AnchorComponent,
  type AnchorRecord,
  type ClassificationStatus,
  type IfcReference,
} from "./anchor-data";
import { h, toast } from "./dom";
import type { Page } from "./page";
import { type Part, type Value } from "./parts";
import { partId } from "./selection";
import { Viewer, type Bounds } from "./viewer";

type Relationship = IngestResult["relationships"][number];
type DetailMode = "assembly" | "selected";
type Axis = "x" | "y" | "z";

const statusOptions: [ClassificationStatus, string][] = [
  ["unclassified", "Unclassified"],
  ["candidate", "Candidate"],
  ["manually_confirmed", "Manually confirmed"],
  ["geometrically_detected", "Geometrically detected"],
  ["ifc_relationship_confirmed", "IFC relationship confirmed"],
];
function referenceId(ref: IfcReference): string {
  return partId(ref.model, ref.key);
}

function sameReference(a: IfcReference, b: { model: string; key: string }): boolean {
  return a.model === b.model && a.key === b.key;
}

function overlap(a: Bounds, b: Bounds): boolean {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0]
    && a.min[1] <= b.max[1] && a.max[1] >= b.min[1]
    && a.min[2] <= b.max[2] && a.max[2] >= b.min[2];
}

function optionSelect<T extends string>(options: [T, string][], value: T, label: string): HTMLSelectElement {
  const select = h("select", { "aria-label": label }) as HTMLSelectElement;
  for (const [optionValue, text] of options) {
    const option = h("option", { value: optionValue }, text) as HTMLOptionElement;
    option.selected = optionValue === value;
    select.append(option);
  }
  return select;
}

function partName(part: Part | undefined, ref: IfcReference): string {
  return part?.displayName || part?.name || ref.globalId;
}

function evidenceLabel(evidence: Value["evidence"] | "inferred"): string {
  if (evidence === "source") return "IFC";
  if (evidence === "computed") return "berechnet";
  if (evidence === "inferred") return "abgeleitet";
  return "Nicht vorhanden";
}

function formatValue(value: Value, unit: string): HTMLElement {
  const text = value.value === null || value.value === ""
    ? "Nicht vorhanden"
    : `${typeof value.value === "number" ? value.value.toLocaleString("de-DE", { maximumFractionDigits: 3 }) : value.value}${unit}`;
  const label = value.value === null || value.value === "" ? "unknown" : value.evidence;
  const note = value.note ? ` title="${value.note}"` : "";
  const result = h("span", { class: "anchor-measure" }, text);
  result.append(h("span", { class: `ev ev-${label}`, title: value.note ?? evidenceLabel(value.evidence) }, evidenceLabel(label as Value["evidence"])));
  if (note) result.setAttribute("title", value.note ?? "");
  return result;
}

function rawValue(text: string | null | undefined, evidence: Value["evidence"] | "inferred" = "source"): HTMLElement {
  const available = !!text;
  return h("span", { class: "anchor-measure" },
    available ? text! : "Nicht vorhanden",
    h("span", { class: `ev ev-${available ? evidence : "unknown"}` }, available ? evidenceLabel(evidence) : "Nicht vorhanden"));
}

function infoRow(label: string, value: Node | string): HTMLElement {
  return h("div", { class: "anchor-info-row" }, h("dt", {}, label), h("dd", {}, typeof value === "string" ? value : value));
}

function modelPartLabel(page: Page, model: string, key: string): string {
  const part = page.parts.get(partId(model, key));
  return part?.displayName || part?.name || part?.globalId || key;
}

export class AnchorExplorer {
  private readonly root: HTMLElement;
  private readonly alert: HTMLElement;
  private readonly list: HTMLElement;
  private readonly editor: HTMLElement;
  private readonly modeButton: HTMLButtonElement;
  private readonly modeStatus: HTMLElement;
  private readonly createButton: HTMLButtonElement;
  private readonly createType: HTMLInputElement;
  private readonly createRationale: HTMLTextAreaElement;
  private readonly search: HTMLInputElement;
  private readonly modelFilter: HTMLSelectElement;
  private readonly typeFilter: HTMLSelectElement;
  private readonly detailSlot: HTMLElement;
  private readonly componentList: HTMLElement;
  private readonly selectedInfo: HTMLElement;
  private readonly detail: AnchorDetailViewer;
  private records: AnchorRecord[] = [];
  private activeId: string | null = null;
  private anchorMode = false;
  private storageError = "";
  private readonly relationships = new Map<string, Relationship[]>();
  private readonly relationshipLoading = new Set<string>();
  private readonly relationshipErrors = new Map<string, string>();

  constructor(private readonly page: Page, container: HTMLElement) {
    this.root = h("div", { class: "anchor-explorer" });
    this.alert = h("div", { class: "anchor-alert", role: "alert", hidden: true });
    this.modeButton = h("button", {
      type: "button",
      class: "secondary anchor-mode",
      "aria-pressed": "false",
    }, "Anker-Auswahl: aus") as HTMLButtonElement;
    this.modeButton.onclick = () => this.setAnchorMode(!this.anchorMode);
    const focus = h("button", { type: "button", class: "secondary" }, "Auswahl fokussieren");
    focus.onclick = () => {
      const current = this.currentRecord();
      const ids = current ? [current.root] : this.page.selection.selectedParts()
        .filter((item) => item.part)
        .map((item) => ({ model: item.model, key: item.key }));
      this.page.viewer.focus(ids);
    };
    const toolbar = h("div", { class: "anchor-toolbar" }, this.modeButton, focus);
    this.modeStatus = h("p", { class: "anchor-mode-status", role: "status" },
      "Aktiviere den Auswahlmodus, um IFC-Elemente im Hauptviewer als Anker zu erfassen.");

    this.createType = h("input", { type: "text", maxlength: "120", placeholder: "Ankertyp (z. B. manuell geprüft)", "aria-label": "Ankertyp" }) as HTMLInputElement;
    this.createRationale = h("textarea", { rows: "2", placeholder: "Quelle und Begründung der Klassifizierung", "aria-label": "Quelle und Begründung" }) as HTMLTextAreaElement;
    this.createButton = h("button", { type: "button", class: "primary" }, "Auswahl unklassifiziert erfassen") as HTMLButtonElement;
    this.createButton.onclick = () => this.createFromSelection();
    const createForm = h("div", { class: "anchor-create" },
      h("strong", {}, "Manuelle Erfassung"),
      this.createType,
      this.createRationale,
      this.createButton,
    );
    const help = h("p", { class: "anchor-help" },
      "Es werden keine Elemente automatisch als Anker klassifiziert. Die Metadaten liegen getrennt von den IFC-Dateien im Browserspeicher.");

    this.search = h("input", { type: "search", placeholder: "Name oder GlobalId suchen", "aria-label": "Anker suchen" }) as HTMLInputElement;
    this.modelFilter = h("select", { "aria-label": "Nach IFC-Modell filtern" }) as HTMLSelectElement;
    this.typeFilter = h("select", { "aria-label": "Nach Ankertyp filtern" }) as HTMLSelectElement;
    this.search.oninput = () => this.renderList();
    this.modelFilter.onchange = () => this.renderList();
    this.typeFilter.onchange = () => this.renderList();
    const filters = h("div", { class: "anchor-filters" }, this.search, this.modelFilter, this.typeFilter);
    this.list = h("div", { class: "anchor-list", role: "list", "aria-label": "Erfasste Anker" });
    this.editor = h("section", { class: "anchor-editor", "aria-label": "Ankerinformationen" });
    this.detailSlot = h("section", { class: "anchor-detail-slot", "aria-label": "Anker-Detailviewer" });
    this.componentList = h("section", { class: "anchor-component-list", "aria-label": "Ankerkomponenten" });
    this.selectedInfo = h("section", { class: "anchor-info", "aria-label": "Bauteilinformationen" });
    this.detail = new AnchorDetailViewer(page, this.detailSlot, (ref, additive) => {
      this.page.selection.select(referenceId(ref), additive);
    }, () => this.renderComponentList());

    this.root.append(
      this.alert,
      toolbar,
      this.modeStatus,
      createForm,
      help,
      filters,
      this.list,
      this.editor,
      this.detailSlot,
      this.componentList,
      this.selectedInfo,
    );
    container.replaceChildren(this.root);

    try {
      this.records = readAnchorRecords();
    } catch (error) {
      this.showError(errorMessage(error));
    }
    this.page.onSelect(() => this.selectionChanged());
    this.page.viewer.onPick(({ key, model, double }) => {
      if (!key || !model) return;
      const record = this.records.find((candidate) =>
        [candidate.root, ...candidate.components, ...(candidate.host ? [candidate.host] : [])]
          .some((ref) => ref.model === model && ref.key === key));
      if (record) {
        this.activate(record, false);
        if (double) this.page.viewer.focus([{ model, key }]);
      } else if (this.anchorMode) {
        const part = this.page.parts.get(partId(model, key));
        this.modeStatus.textContent = `Ausgewählt: ${partName(part, { model, key, fingerprint: "", globalId: part?.globalId ?? key })}. Noch kein Ankerdatensatz vorhanden; erfasse das Element ausdrücklich als unklassifiziert.`;
      }
    });
    this.renderAll();
  }

  private setAnchorMode(enabled: boolean): void {
    this.anchorMode = enabled;
    this.modeButton.textContent = `Anker-Auswahl: ${enabled ? "an" : "aus"}`;
    this.modeButton.setAttribute("aria-pressed", String(enabled));
    this.modeStatus.textContent = enabled
      ? "Klicke im Hauptviewer ein Element. Bestehende Anker werden geöffnet; unbekannte Elemente werden nur nach ausdrücklicher Erfassung gespeichert."
      : "Aktiviere den Auswahlmodus, um IFC-Elemente im Hauptviewer als Anker zu erfassen.";
  }

  private currentRecord(): AnchorRecord | undefined {
    return this.records.find((record) => record.anchorId === this.activeId);
  }

  private selectionChanged(): void {
    const selected = this.page.selection.selectedParts();
    const matched = this.records.find((record) => selected.some((item) =>
      [record.root, ...record.components, ...(record.host ? [record.host] : [])].some((ref) => sameReference(ref, item))));
    if (matched && matched.anchorId !== this.activeId) this.activate(matched, false);
    this.updateCreateButton();
    this.refreshEditorActions();
    this.detail.syncSelection();
    this.renderComponentList();
    this.renderSelectedInfo();
  }

  private activate(record: AnchorRecord, selectRoot: boolean): void {
    this.activeId = record.anchorId;
    this.renderAll();
    this.loadRelationships(record);
    void this.openDetail(record);
    if (selectRoot) this.page.selection.select(referenceId(record.root));
  }

  private updateCreateButton(): void {
    const selected = this.page.selection.selectedParts();
    this.createButton.disabled = !!this.storageError || selected.length !== 1 || !selected[0].part;
    this.createButton.title = selected.length !== 1
      ? "Wähle genau ein IFC-Element in der Tabelle oder im Hauptviewer aus."
      : "Erfasst das ausgewählte IFC-Element separat als unklassifiziert.";
  }

  private refreshEditorActions(): void {
    const record = this.currentRecord();
    const selected = this.page.selection.selectedParts();
    const selectedItem = selected.length === 1 ? selected[0] : null;
    const refIsMember = !!record && !!selectedItem && [record.root, ...record.components]
      .some((ref) => ref.model === selectedItem.model && ref.key === selectedItem.key);
    const canAssign = !!selectedItem?.part;
    this.editor.querySelectorAll<HTMLButtonElement>(".anchor-selection-action").forEach((button) => {
      button.disabled = !canAssign || refIsMember;
    });
  }

  private renderAll(): void {
    this.renderFilters();
    this.renderList();
    this.renderEditor();
    this.renderComponentList();
    this.renderSelectedInfo();
    this.updateCreateButton();
    const record = this.currentRecord();
    if (!record) this.detail.clear();
  }

  private renderFilters(): void {
    const selectedModel = this.modelFilter.value;
    const selectedType = this.typeFilter.value;
    const models = [...new Set(this.records.map((record) => record.root.model))].sort();
    const types = [...new Set(this.records.map((record) => record.anchorType))].sort();
    this.modelFilter.replaceChildren(h("option", { value: "" }, "Alle Modelle"));
    for (const model of models) this.modelFilter.append(h("option", { value: model }, model));
    this.typeFilter.replaceChildren(h("option", { value: "" }, "Alle Typen"));
    for (const type of types) this.typeFilter.append(h("option", { value: type }, type));
    this.modelFilter.value = models.includes(selectedModel) ? selectedModel : "";
    this.typeFilter.value = types.includes(selectedType) ? selectedType : "";
  }

  private renderList(): void {
    const search = this.search.value.trim().toLocaleLowerCase();
    const records = this.records.filter((record) => {
      if (this.modelFilter.value && record.root.model !== this.modelFilter.value) return false;
      if (this.typeFilter.value && record.anchorType !== this.typeFilter.value) return false;
      const refs = [record.root, ...record.components, ...(record.host ? [record.host] : [])];
      const terms = [record.anchorType, ...refs.flatMap((ref) => {
        const part = this.part(ref);
        return [ref.globalId, part?.name ?? "", part?.displayName ?? ""];
      })];
      return !search || terms.some((term) => term.toLocaleLowerCase().includes(search));
    });
    this.list.replaceChildren(...records.map((record) => {
      const button = h("button", {
        type: "button",
        class: `anchor-list-item${record.anchorId === this.activeId ? " active" : ""}`,
        role: "listitem",
      },
      h("strong", {}, record.anchorType || "Anker ohne Typ"),
      h("span", {}, `${record.root.model} · ${partName(this.part(record.root), record.root)}`),
      h("small", {}, `${classificationLabels[record.classificationStatus]} · ${record.root.globalId}`)) as HTMLButtonElement;
      button.onclick = () => this.activate(record, true);
      return button;
    }));
    if (!records.length) this.list.append(h("p", { class: "anchor-empty-list" }, "Keine manuell erfassten Anker entsprechen den Filtern."));
  }

  private renderEditor(): void {
    const record = this.currentRecord();
    if (!record) {
      this.editor.replaceChildren(h("p", { class: "anchor-empty" },
        "Wähle einen Anker im 3D-Modell aus, um seine konstruktiven Eigenschaften und Anschlüsse zu untersuchen."));
      return;
    }
    const part = this.part(record.root);
    const status = optionSelect(statusOptions, record.classificationStatus, "Klassifizierungsstatus");
    status.onchange = () => this.updateRecord(record.anchorId, (current) => ({
      ...current,
      classificationStatus: status.value as ClassificationStatus,
      updatedAt: new Date().toISOString(),
    }));
    const type = h("input", { type: "text", value: record.anchorType, "aria-label": "Ankertyp bearbeiten" }) as HTMLInputElement;
    type.onchange = () => this.updateRecord(record.anchorId, (current) => ({
      ...current,
      anchorType: type.value.trim(),
      updatedAt: new Date().toISOString(),
    }));
    const source = h("input", { type: "text", value: record.classificationSource, placeholder: "Quelle", "aria-label": "Klassifizierungsquelle" }) as HTMLInputElement;
    const rationale = h("textarea", { rows: "2", "aria-label": "Klassifizierungsbegründung" }, record.classificationRationale) as HTMLTextAreaElement;
    const evidence = h("textarea", { rows: "2", "aria-label": "Verbindungsevidenz" }, record.connectionEvidence) as HTMLTextAreaElement;
    const save = h("button", { type: "button", class: "secondary" }, "Metadaten speichern");
    save.onclick = () => this.updateRecord(record.anchorId, (current) => ({
      ...current,
      classificationSource: source.value.trim(),
      classificationRationale: rationale.value.trim(),
      connectionEvidence: evidence.value.trim(),
      updatedAt: new Date().toISOString(),
    }));
    const add = h("button", { type: "button", class: "secondary" }, "Auswahl als Komponente zuordnen") as HTMLButtonElement;
    add.classList.add("anchor-selection-action");
    add.disabled = this.page.selection.selectedParts().length !== 1;
    add.onclick = () => this.addSelectedComponent(record);
    const hostButton = h("button", { type: "button", class: "secondary" },
      record.host ? "Ausgewähltes Element als Host zuordnen" : "Auswahl als Host zuordnen") as HTMLButtonElement;
    hostButton.classList.add("anchor-selection-action");
    hostButton.disabled = this.page.selection.selectedParts().length !== 1;
    hostButton.onclick = () => this.setHost(record);
    const check = h("button", { type: "button", class: "secondary" }, "AABB-Überschneidung prüfen") as HTMLButtonElement;
    check.disabled = !record.host || [record.root, ...record.components, record.host].some((ref) => this.isStale(ref));
    check.onclick = () => void this.checkGeometry(record);
    const removeHost = h("button", { type: "button", class: "secondary" }, "Host-Zuordnung lösen");
    removeHost.hidden = !record.host;
    removeHost.onclick = () => this.updateRecord(record.anchorId, (current) => ({
      ...current,
      host: null,
      connectionStatus: "unknown",
      connectionEvidence: "",
      updatedAt: new Date().toISOString(),
    }));
    const remove = h("button", { type: "button", class: "danger" }, "Anker-Metadaten entfernen");
    remove.onclick = () => this.removeRecord(record);

    const hostText = record.host
      ? `${record.host.model} · ${modelPartLabel(this.page, record.host.model, record.host.key)} · ${record.host.globalId}`
      : "Nicht vorhanden";
    const geometryWarning = record.components.length === 0
      ? "Keine Einzelkomponenten zugeordnet; das IFC-Ankerelement wird nicht künstlich zerlegt."
      : `${record.components.length} tatsächlich vorhandene IFC-Komponente(n) zugeordnet; das Ankerelement bleibt eigenständig.`;
    const relationStatus = this.relationshipLoading.has(record.root.model)
      ? "IFC-Beziehungen werden geladen …"
      : this.relationshipErrors.has(record.root.model)
        ? `IFC-Beziehungen nicht verfügbar: ${this.relationshipErrors.get(record.root.model)}`
        : this.relationships.has(record.root.model)
          ? this.relatedRelationships(record).length
            ? `${this.relatedRelationships(record).length} IFC-Beziehung(en) zu den gespeicherten IDs gefunden. Beziehungen belegen nicht automatisch eine mechanische Verbindung.`
            : "Keine IFC-Beziehungen zu den gespeicherten Anker- und Komponenten-IDs gefunden."
          : "IFC-Beziehungen werden geladen …";

    this.editor.replaceChildren(
      h("h3", {}, "Ankerverwaltung"),
      h("p", { class: "anchor-root-name" }, part?.displayName || part?.name || record.root.globalId),
      h("dl", { class: "anchor-metadata" },
        infoRow("IFC-Modell", rawValue(record.root.model)),
        infoRow("Deutscher Bauteilname", rawValue(part?.displayName, "inferred")),
        infoRow("Originalname", rawValue(part?.name)),
        infoRow("IFC-Klasse", rawValue(part?.ifcClass)),
        infoRow("GlobalId", rawValue(record.root.globalId)),
        infoRow("Host-Bauteil", hostText),
      ),
      h("div", { class: "anchor-edit-fields" },
        h("label", {}, "Ankertyp", type),
        h("label", {}, "Klassifizierungsstatus", status),
        h("label", {}, "Klassifizierungsquelle", source),
        h("label", {}, "Begründung", rationale),
        h("label", {}, "Verbindungsstatus", h("span", { class: "anchor-status-value" }, connectionLabels[record.connectionStatus])),
        h("label", {}, "Verbindungsevidenz", evidence),
      ),
      h("p", { class: "anchor-relationship-note" }, `IFC-Verbindungen: ${relationStatus}`),
      ...this.renderRelationshipEvidence(record),
      h("p", { class: "anchor-explosion-note" }, geometryWarning),
      h("div", { class: "anchor-actions" }, add, hostButton, check, removeHost, save, remove),
    );
  }

  private renderRelationshipEvidence(record: AnchorRecord): HTMLElement[] {
    if (!this.relationships.has(record.root.model)) return [];
    const relations = this.relatedRelationships(record).slice(0, 8);
    if (!relations.length) return [];
    const list = h("ul", { class: "anchor-relations" });
    for (const relation of relations) {
      const endpoints = [relation.relating_key, relation.related_key].filter(Boolean).map((key) =>
        modelPartLabel(this.page, record.root.model, key));
      list.append(h("li", {},
        h("strong", {}, relation.ifc_rel_class),
        ` · ${relation.kind}: ${endpoints.join(" ↔ ")}`));
    }
    return [h("div", { class: "anchor-relationship-list" },
      h("strong", {}, "Dokumentierte IFC-Beziehungen"),
      list,
      h("small", {}, "Die IFC-Beziehung wird unverändert angezeigt und ist für sich allein keine mechanische Verbindungsbestätigung."))];
  }

  private relatedRelationships(record: AnchorRecord): Relationship[] {
    const keys = new Set([record.root.key, ...record.components.filter((ref) => ref.model === record.root.model).map((ref) => ref.key)]);
    return (this.relationships.get(record.root.model) ?? []).filter((relation) =>
      keys.has(relation.relating_key) || keys.has(relation.related_key));
  }

  private renderComponentList(): void {
    const record = this.currentRecord();
    this.componentList.replaceChildren(h("h3", {}, "Vorhandene Komponenten"));
    if (!record) {
      this.componentList.append(h("p", {}, "Wähle zuerst einen Anker aus."));
      return;
    }
    if (!record.components.length) {
      this.componentList.append(h("p", {}, "Keine Einzelkomponenten zugeordnet. Die IFC-Geometrie wird nicht künstlich zerlegt."));
      return;
    }
    for (const component of record.components) {
      const part = this.part(component);
      const selected = this.page.selection.has(referenceId(component));
      const visible = this.detail.isComponentVisible(component);
      const select = h("button", { type: "button", class: `anchor-component-select${selected ? " selected" : ""}` },
        h("strong", {}, part?.displayName || part?.name || component.globalId),
        h("span", {}, `${component.role || "Funktion nicht festgelegt"} · ${component.model}`),
        h("small", {}, `${part?.ifcClass ?? "Ifc-Klasse nicht vorhanden"} · ${component.globalId}`));
      select.onclick = () => {
        this.detail.focus(component);
        this.page.selection.select(referenceId(component));
      };
      const show = h("input", { type: "checkbox", checked: visible, "aria-label": `${partName(part, component)} anzeigen` }) as HTMLInputElement;
      show.onchange = () => this.detail.setComponentVisible(component, show.checked);
      const role = h("input", { type: "text", value: component.role, placeholder: "Funktion der Komponente", "aria-label": "Komponentenfunktion" }) as HTMLInputElement;
      role.onchange = () => this.updateRecord(record.anchorId, (current) => ({
        ...current,
        components: current.components.map((candidate) =>
          candidate.model === component.model && candidate.key === component.key
            ? { ...candidate, role: role.value.trim() }
            : candidate),
        updatedAt: new Date().toISOString(),
      }));
      const row = h("article", { class: "anchor-component" },
        h("label", { class: "anchor-component-visibility", title: "Komponente ein- oder ausblenden" }, show, "An"),
        select,
        h("label", { class: "anchor-component-role" }, "Funktion", role),
        h("button", { type: "button", class: "secondary anchor-component-remove" }, "Lösen"));
      const remove = row.querySelector<HTMLButtonElement>(".anchor-component-remove")!;
      remove.onclick = () => this.removeComponent(record, component);
      this.componentList.append(row);
    }
  }

  private renderSelectedInfo(): void {
    const record = this.currentRecord();
    if (!record) {
      this.selectedInfo.replaceChildren();
      this.selectedInfo.hidden = true;
      return;
    }
    this.selectedInfo.hidden = false;
    const within = [record.root, ...record.components, ...(record.host ? [record.host] : [])];
    const selected = this.page.selection.selectedParts().find((item) =>
      within.some((ref) => sameReference(ref, item)));
    const ref: IfcReference = selected
      ? {
        model: selected.model,
        key: selected.key,
        globalId: selected.part?.globalId ?? selected.key,
        fingerprint: this.page.modelFingerprint(selected.model) ?? "",
      }
      : record.root;
    const part = selected?.part ?? this.part(ref);
    if (!part) {
      this.selectedInfo.replaceChildren(h("h3", {}, "Bauteilinformationen"),
        h("p", {}, "Für dieses IFC-Element sind keine importierten Bauteileigenschaften verfügbar."));
      return;
    }
    const diameter = part.psets.find((property) => /diameter|durchmesser/i.test(property.name));
    const materialProperties = part.psets.filter((property) =>
      /material|density|dichte|strength|festigkeit|grade|conductivity|wärmeleit/i.test(`${property.pset} ${property.name}`)).slice(0, 8);
    const properties = part.psets.slice(0, 12);
    const materialRows: HTMLElement[] = [
      infoRow("Materialname", rawValue(part.material)),
      ...part.layers.map((layer) => infoRow("Materialschicht", rawValue(`${layer.material}${layer.thickness === null ? "" : ` · ${layer.thickness.toLocaleString("de-DE", { maximumFractionDigits: 3 })} m`}`))),
    ];
    for (const property of materialProperties) materialRows.push(infoRow(`${property.pset} · ${property.name}`, rawValue(property.value)));
    const psetSection = properties.length
      ? h("ul", { class: "anchor-psets" }, ...properties.map((property) =>
        h("li", {}, h("strong", {}, property.pset), ` · ${property.name}: `, rawValue(property.value))))
      : h("p", {}, "Keine importierten Property-Set-Werte vorhanden.");
    this.selectedInfo.replaceChildren(
      h("h3", {}, "Bauteilinformationen"),
      h("p", { class: "anchor-root-name" }, part.displayName),
      h("h4", {}, "Identifikation"),
      h("dl", { class: "anchor-metadata" },
        infoRow("Deutscher Bauteilname", rawValue(part.displayName, "inferred")),
        infoRow("IFC-Name", rawValue(part.name)),
        infoRow("IFC-Klasse", rawValue(part.ifcClass)),
        infoRow("GlobalId", rawValue(part.globalId)),
        infoRow("IFC-Modell", rawValue(part.modelFile))),
      h("h4", {}, "Material"),
      h("dl", { class: "anchor-metadata" }, ...materialRows),
      h("h4", {}, "Geometrie"),
      h("dl", { class: "anchor-metadata" },
        infoRow("Länge", formatValue(part.length, " m")),
        infoRow("Breite", formatValue(part.width, " m")),
        infoRow("Höhe", formatValue(part.height, " m")),
        infoRow("Durchmesser", diameter ? rawValue(diameter.value) : rawValue(null, "unknown")),
        infoRow("Volumen", formatValue(part.volume, " m³"))),
      h("h4", {}, "Importierte Property-Sets"),
      psetSection,
      h("p", { class: "anchor-provenance-note" }, "IFC-Namen, Klassen, IDs, Material- und Property-Set-Angaben stammen aus dem Import. Maße und Volumen sind mit ihrer Belegklasse gekennzeichnet."),
    );
  }

  private createFromSelection(): void {
    const selected = this.page.selection.selectedParts();
    if (selected.length !== 1 || !selected[0].part) {
      toast("Wähle genau ein IFC-Element mit importierten Eigenschaften aus.", true);
      return;
    }
    const item = selected[0];
    const model = item.model;
    const key = item.key;
    if (this.records.some((record) => [record.root, ...record.components].some((ref) => ref.model === model && ref.key === key))) {
      toast("Dieses Element ist bereits einem Anker oder einer Ankerkomponente zugeordnet.", true);
      return;
    }
    const fingerprint = this.page.modelFingerprint(model);
    if (!fingerprint) {
      toast("Der IFC-Fingerabdruck ist nicht verfügbar; das Element wurde nicht gespeichert.", true);
      return;
    }
    const part = item.part;
    if (!part) return;
    const record: AnchorRecord = {
      anchorId: crypto.randomUUID(),
      root: { model, fingerprint, key, globalId: part.globalId },
      anchorType: this.createType.value.trim() || part.typeName || part.objectType || part.ifcClass,
      components: [],
      host: null,
      classificationStatus: "unclassified",
      classificationSource: "",
      classificationRationale: this.createRationale.value.trim(),
      connectionStatus: "unknown",
      connectionEvidence: "",
      updatedAt: new Date().toISOString(),
    };
    if (!this.commit([...this.records, record])) return;
    this.createType.value = "";
    this.createRationale.value = "";
    this.setAnchorMode(false);
    this.activate(record, false);
    toast("Element separat und unklassifiziert erfasst; die IFC-Datei blieb unverändert.");
  }

  private addSelectedComponent(record: AnchorRecord): void {
    const selected = this.page.selection.selectedParts();
    if (selected.length !== 1 || !selected[0].part) {
      toast("Wähle genau ein IFC-Element mit importierten Eigenschaften aus.", true);
      return;
    }
    const item = selected[0];
    const part = item.part;
    if (!part) return;
    const ref = this.reference(item.model, item.key, part.globalId);
    if (!ref) return;
    if (record.root.model === ref.model && record.root.key === ref.key) {
      toast("Das übergeordnete Element kann nicht zusätzlich als eigene Komponente zugeordnet werden.", true);
      return;
    }
    if (record.components.some((component) => component.model === ref.model && component.key === ref.key)
      || (record.host?.model === ref.model && record.host.key === ref.key)) {
      toast("Das Element ist bereits dieser Baugruppe zugeordnet.", true);
      return;
    }
    const role = window.prompt("Funktion der vorhandenen IFC-Komponente (keine Annahme erforderlich):", part.typeName || part.objectType || "");
    if (role === null) return;
    this.updateRecord(record.anchorId, (current) => ({
      ...current,
      components: [...current.components, { ...ref, role: role.trim() }],
      updatedAt: new Date().toISOString(),
    }));
  }

  private setHost(record: AnchorRecord): void {
    const selected = this.page.selection.selectedParts();
    if (selected.length !== 1 || !selected[0].part) {
      toast("Wähle genau ein Host-Bauteil aus.", true);
      return;
    }
    const item = selected[0];
    const part = item.part;
    if (!part) return;
    if ([record.root, ...record.components].some((ref) => ref.model === item.model && ref.key === item.key)) {
      toast("Der Anker oder eine seiner Komponenten kann nicht zugleich Host sein.", true);
      return;
    }
    const ref = this.reference(item.model, item.key, part.globalId);
    if (!ref) return;
    const evidence = window.prompt("Begründung für die Host-Zuordnung (z. B. dokumentierte Quelle):", "");
    if (evidence === null) return;
    this.updateRecord(record.anchorId, (current) => ({
      ...current,
      host: ref,
      connectionStatus: evidence.trim() ? "manual" : "unknown",
      connectionEvidence: evidence.trim(),
      updatedAt: new Date().toISOString(),
    }));
  }

  private reference(model: string, key: string, globalId: string): IfcReference | null {
    const fingerprint = this.page.modelFingerprint(model);
    if (!fingerprint) {
      toast("Der IFC-Fingerabdruck ist nicht verfügbar; die Zuordnung wurde nicht gespeichert.", true);
      return null;
    }
    return { model, fingerprint, key, globalId };
  }

  private removeComponent(record: AnchorRecord, component: AnchorComponent): void {
    this.updateRecord(record.anchorId, (current) => ({
      ...current,
      components: current.components.filter((candidate) =>
        candidate.model !== component.model || candidate.key !== component.key),
      updatedAt: new Date().toISOString(),
    }));
  }

  private async checkGeometry(record: AnchorRecord): Promise<void> {
    if (!record.host) return;
    if ([record.root, ...record.components, record.host].some((ref) => this.isStale(ref))) {
      toast("Mindestens eine gespeicherte IFC-Zuordnung verweist auf einen anderen Fingerabdruck; die Geometrieprüfung wurde abgebrochen.", true);
      return;
    }
    try {
      await this.detail.show(record);
      const bounds = this.detail.elementBounds();
      const components = record.components.length ? record.components : [record.root];
      const intersections = components.filter((component) => {
        const componentBounds = bounds.get(component.model)?.get(component.key);
        const hostBounds = bounds.get(record.host!.model)?.get(record.host!.key);
        return !!componentBounds && !!hostBounds && overlap(componentBounds, hostBounds);
      });
      if (!intersections.length) {
        toast("Keine AABB-Überschneidung festgestellt. Das schließt Kontakt nicht aus; der Status bleibt unverändert.", true);
        return;
      }
      this.updateRecord(record.anchorId, (current) => ({
        ...current,
        connectionStatus: "geometric_candidate",
        connectionEvidence: `AABB-Überschneidung: ${intersections.map((component) => component.globalId).join(", ")} · Host ${record.host!.globalId}`,
        updatedAt: new Date().toISOString(),
      }));
      toast("AABB-Überschneidung als geometrischen Kandidaten gespeichert; keine mechanische Verbindung bestätigt.");
    } catch (error) {
      toast(`Geometrie konnte nicht geprüft werden: ${errorMessage(error)}`, true);
    }
  }

  private loadRelationships(record: AnchorRecord): void {
    const model = record.root.model;
    const cached = this.relationships.get(model);
    if (cached) {
      this.applyIfcConnectionEvidence(record, cached);
      return;
    }
    if (this.relationshipLoading.has(model)) return;
    this.relationshipLoading.add(model);
    void this.page.model(model).then((data) => {
      this.relationships.set(model, data.relationships);
      this.relationshipErrors.delete(model);
      this.applyIfcConnectionEvidence(record, data.relationships);
    }).catch((error: unknown) => {
      this.relationshipErrors.set(model, errorMessage(error));
    }).finally(() => {
      this.relationshipLoading.delete(model);
      if (this.activeId === record.anchorId) this.renderEditor();
    });
  }

  private applyIfcConnectionEvidence(record: AnchorRecord, relations: Relationship[]): void {
    if (!record.host || record.host.model !== record.root.model) return;
    const anchorKeys = new Set([record.root.key, ...record.components
      .filter((component) => component.model === record.root.model)
      .map((component) => component.key)]);
    const relation = relations.find((item) =>
      (item.kind === "connects" || item.kind === "connects_path")
      && ((anchorKeys.has(item.relating_key) && item.related_key === record.host!.key)
        || (anchorKeys.has(item.related_key) && item.relating_key === record.host!.key)));
    if (!relation || record.connectionStatus === "ifc_relationship") return;
    this.updateRecord(record.anchorId, (current) => ({
      ...current,
      connectionStatus: "ifc_relationship",
      connectionEvidence: `${relation.ifc_rel_class} (${relation.kind}) verbindet IFC-Elemente ${relation.relating_key} und ${relation.related_key}.`,
      updatedAt: new Date().toISOString(),
    }));
  }

  private removeRecord(record: AnchorRecord): void {
    if (!window.confirm("Nur den Anker-Metadatensatz entfernen? Die IFC-Datei und ihre Elemente bleiben unverändert.")) return;
    if (!this.commit(this.records.filter((candidate) => candidate.anchorId !== record.anchorId))) return;
    this.activeId = null;
    this.renderAll();
    this.page.selection.clear();
  }

  private part(ref: IfcReference): Part | undefined {
    return this.page.parts.get(referenceId(ref));
  }

  private isStale(ref: IfcReference): boolean {
    const currentFingerprint = this.page.modelFingerprint(ref.model);
    return !currentFingerprint || currentFingerprint !== ref.fingerprint;
  }

  private async openDetail(record: AnchorRecord): Promise<void> {
    try {
      await this.detail.show(record);
    } catch (error) {
      this.detail.reportError(errorMessage(error));
    }
  }

  private updateRecord(anchorId: string, update: (record: AnchorRecord) => AnchorRecord): void {
    const current = this.records.find((record) => record.anchorId === anchorId);
    if (!current) return;
    const updated = update(current);
    const geometrySignature = (record: AnchorRecord): string => JSON.stringify({
      root: [record.root.model, record.root.key],
      components: record.components.map((component) => [component.model, component.key]),
      host: record.host ? [record.host.model, record.host.key] : null,
      connectionStatus: record.connectionStatus,
    });
    const reloadDetail = this.activeId === anchorId && geometrySignature(current) !== geometrySignature(updated);
    const next = this.records.map((record) => record.anchorId === anchorId ? updated : record);
    if (!this.commit(next)) return;
    this.renderAll();
    this.loadRelationships(updated);
    if (reloadDetail) void this.openDetail(updated);
  }

  private commit(records: AnchorRecord[]): boolean {
    try {
      writeAnchorRecords(records);
      this.records = records;
      this.storageError = "";
      this.alert.hidden = true;
      return true;
    } catch (error) {
      this.showError(errorMessage(error));
      return false;
    }
  }

  private showError(message: string): void {
    this.storageError = message;
    this.alert.hidden = false;
    this.alert.textContent = `Anker-Metadaten sind nicht verfügbar: ${message}`;
    this.updateCreateButton();
    toast(message, true);
  }
}

class AnchorDetailViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly message: HTMLElement;
  private readonly status: HTMLElement;
  private readonly mode: HTMLSelectElement;
  private readonly hostToggle: HTMLInputElement;
  private readonly explosion: HTMLInputElement;
  private readonly explosionValue: HTMLOutputElement;
  private readonly clippingToggle: HTMLInputElement;
  private readonly clippingAxis: HTMLSelectElement;
  private readonly clippingPosition: HTMLInputElement;
  private readonly clippingValue: HTMLOutputElement;
  private readonly analysis: AnchorAnalysisPanel;
  private viewer: Viewer | null = null;
  private record: AnchorRecord | null = null;
  private focused: IfcReference | null = null;
  private modeValue: DetailMode = "assembly";
  private showHost = false;
  private explosionPercent = 0;
  private readonly hiddenComponents = new Set<string>();
  private readonly loading = new Map<string, Promise<void>>();
  private generation = 0;

  constructor(
    private readonly page: Page,
    container: HTMLElement,
    private readonly onPick: (ref: IfcReference, additive: boolean) => void,
    private readonly onVisibility: (ref: IfcReference, visible: boolean) => void,
  ) {
    const root = h("div", { class: "anchor-detail" });
    this.mode = h("select", { "aria-label": "Darstellung der Ankergruppe" }) as HTMLSelectElement;
    this.mode.append(
      h("option", { value: "assembly" }, "Baugruppe"),
      h("option", { value: "selected" }, "Komponente isolieren"),
    );
    this.mode.onchange = () => {
      this.modeValue = this.mode.value as DetailMode;
      this.applyDisplay();
    };
    this.hostToggle = h("input", { type: "checkbox", "aria-label": "Host anzeigen" }) as HTMLInputElement;
    this.hostToggle.onchange = () => {
      this.showHost = this.hostToggle.checked;
      this.applyDisplay();
    };
    const frame = h("button", { type: "button", class: "secondary" }, "Ansicht einpassen");
    frame.onclick = () => this.frame();
    const reset = h("button", { type: "button", class: "secondary" }, "Ansicht zurücksetzen");
    reset.onclick = () => this.reset();
    const controls = h("div", { class: "anchor-detail-controls" },
      this.mode,
      h("label", { class: "anchor-detail-host" }, this.hostToggle, "Host-Bauteil"),
      frame,
      reset,
    );
    this.explosion = h("input", {
      type: "range", min: "0", max: "100", step: "1", value: "0", "aria-label": "Explosionsgrad in Prozent",
    }) as HTMLInputElement;
    this.explosionValue = h("output", {}, "0 %") as HTMLOutputElement;
    this.explosion.disabled = true;
    this.explosion.oninput = () => {
      this.explosionPercent = Number(this.explosion.value);
      this.explosionValue.value = `${this.explosionPercent} %`;
      this.applyExplosion();
      this.analysis.setExplosionPercent(this.explosionPercent);
    };
    const explosionControl = h("label", { class: "anchor-explosion" }, "Lokale Explosion", this.explosion, this.explosionValue);

    this.clippingToggle = h("input", { type: "checkbox", "aria-label": "Schnitt aktivieren" }) as HTMLInputElement;
    this.clippingToggle.onchange = () => this.applyClipping();
    this.clippingAxis = h("select", { "aria-label": "Schnittrichtung" }) as HTMLSelectElement;
    for (const [axis, label] of [["x", "X"], ["y", "Y"], ["z", "Z"]] as [Axis, string][]) {
      this.clippingAxis.append(h("option", { value: axis }, label));
    }
    this.clippingAxis.value = "z";
    this.clippingAxis.onchange = () => this.applyClipping();
    this.clippingPosition = h("input", {
      type: "range", min: "0", max: "100", step: "1", value: "50", "aria-label": "Position der Schnittebene",
    }) as HTMLInputElement;
    this.clippingPosition.oninput = () => {
      this.clippingValue.value = `${this.clippingPosition.value} %`;
      this.applyClipping();
    };
    this.clippingValue = h("output", {}, "50 %") as HTMLOutputElement;
    this.clippingToggle.disabled = true;
    this.clippingAxis.disabled = true;
    this.clippingPosition.disabled = true;
    this.mode.disabled = true;
    this.hostToggle.disabled = true;
    const resetClip = h("button", { type: "button", class: "secondary" }, "Schnitt zurücksetzen");
    resetClip.onclick = () => {
      this.clippingToggle.checked = false;
      this.clippingPosition.value = "50";
      this.clippingValue.value = "50 %";
      this.applyClipping();
    };
    const clipping = h("div", { class: "anchor-clipping" },
      h("label", {}, this.clippingToggle, "Schnitt"),
      this.clippingAxis,
      this.clippingPosition,
      this.clippingValue,
      resetClip,
    );

    const canvasWrap = h("div", { class: "anchor-canvas-wrap" });
    this.canvas = h("canvas", { class: "anchor-detail-canvas", "aria-label": "Unabhängiger 3D-Detailviewer für die Ankergruppe" }) as HTMLCanvasElement;
    this.message = h("div", { class: "anchor-detail-message" },
      "Wähle einen Anker im 3D-Modell oder in der Liste aus, um seine Detailansicht zu öffnen.");
    this.status = h("div", { class: "anchor-detail-status", role: "status" },
      "Die Detailansicht verändert weder den Hauptviewer noch die IFC-Geometrie.");
    canvasWrap.append(this.canvas, this.message);
    const analysisSlot = h("div", { class: "anchor-analysis-slot" });
    this.analysis = new AnchorAnalysisPanel(this.page, () => this.viewer, analysisSlot);
    root.append(h("h3", {}, "3D-Detailansicht"), controls, explosionControl, clipping, canvasWrap, this.status, analysisSlot);
    container.replaceChildren(root);
  }

  async show(record: AnchorRecord): Promise<void> {
    this.record = record;
    this.analysis.beginRecord(record);
    this.generation += 1;
    const generation = this.generation;
    this.focused = record.root;
    this.hiddenComponents.clear();
    if (this.viewer) {
      this.viewer.setArrangement(null);
      this.viewer.setClippingPlane(null);
      for (const model of this.viewer.models()) this.viewer.setModelVisible(model.label, false);
    }
    this.modeValue = "assembly";
    this.mode.value = "assembly";
    this.mode.disabled = true;
    this.showHost = false;
    this.hostToggle.checked = false;
    this.hostToggle.disabled = !this.hostAllowed(record);
    this.explosionPercent = 0;
    this.explosion.value = "0";
    this.explosionValue.value = "0 %";
    this.explosion.disabled = true;
    this.clippingToggle.checked = false;
    this.clippingPosition.value = "50";
    this.clippingValue.value = "50 %";
    this.clippingToggle.disabled = true;
    this.clippingAxis.disabled = true;
    this.clippingPosition.disabled = true;
    this.message.hidden = false;
    this.message.textContent = "Detailgeometrie wird geladen …";

    const refs = [record.root, ...record.components, ...(record.host && !this.isStale(record.host) ? [record.host] : [])];
    const stale = [record.root, ...record.components].find((ref) => this.isStale(ref));
    if (stale) {
      this.message.textContent = `Das IFC-Modell ${stale.model} wurde geändert. Prüfe die GlobalId-Zuordnung erneut, bevor du diese Geometrie verwendest.`;
      this.status.textContent = "3D-Ansicht und Prüfungen wegen eines abweichenden IFC-Fingerabdrucks gesperrt.";
      return;
    }
    const drawable = refs.filter((ref) => this.page.models.some((model) =>
      model.label === ref.model && model.keys.includes(ref.key)));
    const labels = [...new Set(drawable.map((ref) => ref.model))];
    if (!labels.length) {
      this.message.textContent = "Für die zugeordneten Elemente ist keine 3D-Geometrie im geladenen GLB vorhanden.";
      this.status.textContent = "IFC-Metadaten bleiben sichtbar; eine Detailansicht ist ohne GLB-Geometrie nicht verfügbar.";
      return;
    }
    this.ensureViewer();
    await Promise.all(labels.map((label) => this.loadModel(label)));
    if (generation !== this.generation || this.record?.anchorId !== record.anchorId) return;
    for (const model of this.viewer!.models()) this.viewer!.setModelVisible(model.label, labels.includes(model.label));
    this.viewer!.setActiveModel(record.root.model);
    this.viewer!.setSelectionByModel(this.page.selection.byModel());
    this.viewer!.setArrangement(null);
    this.setColors();
    this.analysis.setViewerReady();
    this.mode.disabled = false;
    this.clippingToggle.disabled = false;
    this.clippingAxis.disabled = false;
    this.clippingPosition.disabled = false;
    this.message.hidden = true;
    const assemblyGeometryCount = [record.root, ...record.components].filter((ref) =>
      this.page.models.some((model) => model.label === ref.model && model.keys.includes(ref.key))).length;
    this.explosion.disabled = assemblyGeometryCount < 2;
    this.status.textContent = assemblyGeometryCount < 2
      ? "Weniger als zwei vorhandene Einzelkomponenten: keine künstliche Zerlegung oder Explosion."
      : `${assemblyGeometryCount} vorhandene Geometrieelemente · temporäre Explosion nur in dieser Detailansicht.`;
    this.applyDisplay();
    this.applyClipping();
    this.frame();
  }

  clear(): void {
    this.record = null;
    this.analysis.clear();
    this.focused = null;
    this.generation += 1;
    this.message.hidden = false;
    this.message.textContent = "Wähle einen Anker im 3D-Modell oder in der Liste aus, um seine Detailansicht zu öffnen.";
    this.status.textContent = "Die Detailansicht verändert weder den Hauptviewer noch die IFC-Geometrie.";
    this.mode.disabled = true;
    this.explosion.disabled = true;
    this.clippingToggle.disabled = true;
    this.clippingAxis.disabled = true;
    this.clippingPosition.disabled = true;
    this.hostToggle.disabled = true;
    if (this.viewer) {
      this.viewer.setArrangement(null);
      this.viewer.setClippingPlane(null);
      for (const model of this.viewer.models()) this.viewer.setModelVisible(model.label, false);
    }
  }

  syncSelection(): void {
    if (!this.viewer) return;
    this.viewer.setSelectionByModel(this.page.selection.byModel());
    const selected = this.page.selection.selectedParts().find((item) => {
      const record = this.record;
      return !!record && [record.root, ...record.components, ...(record.host && this.hostAllowed(record) ? [record.host] : [])]
        .some((ref) => sameReference(ref, item));
    });
    if (selected?.part) {
      this.focused = {
        model: selected.model,
        fingerprint: this.page.modelFingerprint(selected.model) ?? "",
        key: selected.key,
        globalId: selected.part.globalId,
      };
      if (this.record?.host && sameReference(this.record.host, selected)) {
        this.showHost = this.hostAllowed(this.record);
        this.hostToggle.checked = this.showHost;
      }
      this.analysis.setSelected(this.focused);
    }
    this.applyDisplay();
  }

  focus(ref: IfcReference): void {
    this.focused = ref;
    this.hiddenComponents.delete(referenceId(ref));
    this.modeValue = "assembly";
    this.mode.value = "assembly";
    this.applyDisplay();
    this.viewer?.focus([{ model: ref.model, key: ref.key }]);
  }

  setComponentVisible(ref: IfcReference, visible: boolean): void {
    if (visible) this.hiddenComponents.delete(referenceId(ref));
    else this.hiddenComponents.add(referenceId(ref));
    this.applyExplosion();
    this.applyDisplay();
    this.onVisibility(ref, visible);
  }

  isComponentVisible(ref: IfcReference): boolean {
    return !this.hiddenComponents.has(referenceId(ref));
  }

  elementBounds(): Map<string, Map<string, Bounds>> {
    return this.viewer?.elementBounds() ?? new Map();
  }

  reportError(message: string): void {
    this.message.hidden = false;
    this.message.textContent = `3D-Detailansicht konnte nicht geladen werden: ${message}`;
    this.status.textContent = "Die Metadatenverwaltung bleibt verfügbar.";
    this.mode.disabled = true;
    this.explosion.disabled = true;
    this.clippingToggle.disabled = true;
    this.clippingAxis.disabled = true;
    this.clippingPosition.disabled = true;
  }

  private hostAllowed(record: AnchorRecord): boolean {
    return !!record.host && !this.isStale(record.host)
      && ["manual", "geometric_candidate", "ifc_relationship"].includes(record.connectionStatus);
  }

  private isStale(ref: IfcReference): boolean {
    const current = this.page.modelFingerprint(ref.model);
    return !current || current !== ref.fingerprint;
  }

  private ensureViewer(): void {
    if (this.viewer) return;
    try {
      this.viewer = new Viewer(this.canvas);
      this.viewer.onHover((key, model) => this.viewer?.setHover(key ? [key] : [], model ?? undefined));
      this.viewer.onPick(({ key, model, double, additive }) => {
        if (double || !key || !model || !this.record) return;
        const refs = [this.record.root, ...this.record.components, ...(this.hostAllowed(this.record) ? [this.record.host!] : [])];
        const ref = refs.find((candidate) => candidate.model === model && candidate.key === key);
        if (!ref) return;
        this.focused = ref;
        this.onPick(ref, additive);
        this.applyDisplay();
      });
    } catch (error) {
      this.message.hidden = false;
      this.message.textContent = `WebGL-Detailviewer konnte nicht gestartet werden: ${errorMessage(error)}`;
      this.status.textContent = "Prüfe, ob der Browser WebGL2 unterstützt und aktiviert hat.";
      throw error;
    }
  }

  private loadModel(label: string): Promise<void> {
    if (this.viewer?.models().some((model) => model.label === label)) return Promise.resolve();
    const pending = this.loading.get(label);
    if (pending) return pending;
    const request = this.viewer!.load(api.glbUrl(label), label).then(() => {
      this.viewer!.setModelOffset(label, this.page.modelOffset(label));
      this.viewer!.setModelVisible(label, false);
    }).finally(() => this.loading.delete(label));
    this.loading.set(label, request);
    return request;
  }

  private setColors(): void {
    if (!this.viewer || !this.record) return;
    const host = this.hostAllowed(this.record) && this.showHost ? this.record.host : null;
    for (const model of this.viewer.models()) {
      this.viewer.setColors((key) => {
        if (this.focused?.model === model.label && this.focused.key === key) return new THREE.Color(0xff9a62);
        if (host?.model === model.label && host.key === key) return new THREE.Color(0x4f9b72);
        return null;
      }, model.label);
    }
  }

  private applyDisplay(): void {
    if (!this.viewer || !this.record) return;
    const allowedHost = this.hostAllowed(this.record) && this.showHost;
    const references = [this.record.root, ...this.record.components.filter((ref) => !this.hiddenComponents.has(referenceId(ref)))];
    if (allowedHost && this.record.host) references.push(this.record.host);
    if (this.focused && references.some((ref) => sameReference(ref, this.focused!))) {
      if (!references.some((ref) => sameReference(ref, this.focused!))) references.push(this.focused);
    }
    const group = references.map((ref) => ({ model: ref.model, key: ref.key }));
    const visible = this.modeValue === "selected" && this.focused
      ? group.filter((item) => (item.model === this.focused!.model && item.key === this.focused!.key)
        || (allowedHost && this.record!.host?.model === item.model && this.record!.host.key === item.key))
      : group;
    for (const model of this.viewer.models()) {
      this.viewer.setDisplay(visible.filter((item) => item.model === model.label).map((item) => item.key), "isolate", model.label);
      const hostKeys = allowedHost && this.record.host?.model === model.label ? [this.record.host.key] : [];
      this.viewer.setTransparent(hostKeys, true, model.label);
    }
    this.viewer.setSelectionByModel(this.page.selection.byModel());
    this.setColors();
    this.applyClipping();
  }

  private applyExplosion(): void {
    if (!this.viewer || !this.record) return;
    const refs = [this.record.root, ...this.record.components].filter((ref) =>
      !this.hiddenComponents.has(referenceId(ref)) && this.page.models.some((model) =>
        model.label === ref.model && model.keys.includes(ref.key)));
    const frames = this.viewer.elementFrames();
    const positions: { ref: IfcReference; center: THREE.Vector3 }[] = [];
    for (const ref of refs) {
      const frame = frames.get(ref.model)?.get(ref.key);
      if (frame) positions.push({ ref, center: new THREE.Vector3(...frame.centre) });
    }
    if (this.explosionPercent === 0 || positions.length < 2) {
      this.viewer.setArrangement(null);
      this.applyClipping();
      return;
    }
    const center = positions.reduce((sum, item) => sum.add(item.center), new THREE.Vector3()).multiplyScalar(1 / positions.length);
    const bounds = this.viewer.elementBounds();
    const halfDiagonal = positions.reduce((maximum, item) => {
      const box = bounds.get(item.ref.model)?.get(item.ref.key);
      if (!box) return maximum;
      const dx = box.max[0] - box.min[0];
      const dy = box.max[1] - box.min[1];
      const dz = box.max[2] - box.min[2];
      return Math.max(maximum, Math.hypot(dx, dy, dz) / 2);
    }, 0);
    const maxRadius = Math.max(...positions.map((item) => item.center.distanceTo(center)), halfDiagonal, 0.1);
    const factor = this.explosionPercent / 100;
    const arrangement = new Map<string, Map<string, number[]>>();
    positions.forEach((item, index) => {
      const direction = item.center.clone().sub(center);
      if (direction.lengthSq() < 1e-8) {
        const angle = (2 * Math.PI * index) / positions.length;
        direction.set(Math.cos(angle), Math.sin(angle / 2), Math.sin(angle));
      }
      direction.normalize().multiplyScalar(maxRadius * factor);
      const byElement = arrangement.get(item.ref.model) ?? new Map<string, number[]>();
      byElement.set(item.ref.key, new THREE.Matrix4().makeTranslation(direction.x, direction.y, direction.z).toArray());
      arrangement.set(item.ref.model, byElement);
    });
    this.viewer.setArrangement(arrangement);
    this.applyClipping();
  }

  private applyClipping(): void {
    if (!this.viewer || !this.record || !this.clippingToggle.checked) {
      this.viewer?.setClippingPlane(null);
      return;
    }
    const bounds = this.viewer.elementBounds();
    const visibleRefs = [this.record.root, ...this.record.components.filter((ref) => !this.hiddenComponents.has(referenceId(ref)))];
    if (this.hostAllowed(this.record) && this.showHost && this.record.host) visibleRefs.push(this.record.host);
    let low = Infinity;
    let high = -Infinity;
    const axisIndex = this.clippingAxis.value === "x" ? 0 : this.clippingAxis.value === "y" ? 1 : 2;
    for (const ref of visibleRefs) {
      const box = bounds.get(ref.model)?.get(ref.key);
      if (!box) continue;
      low = Math.min(low, box.min[axisIndex]);
      high = Math.max(high, box.max[axisIndex]);
    }
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      this.viewer.setClippingPlane(null);
      return;
    }
    const position = low + (high - low) * (Number(this.clippingPosition.value) / 100);
    const normal = new THREE.Vector3(
      this.clippingAxis.value === "x" ? 1 : 0,
      this.clippingAxis.value === "y" ? 1 : 0,
      this.clippingAxis.value === "z" ? 1 : 0,
    );
    this.viewer.setClippingPlane(new THREE.Plane(normal, -position));
  }

  private frame(): void {
    if (!this.viewer || !this.record) return;
    const refs = [this.record.root, ...this.record.components];
    if (this.hostAllowed(this.record) && this.showHost && this.record.host) refs.push(this.record.host);
    this.viewer.focus(refs.map((ref) => ({ model: ref.model, key: ref.key })), [1, 0.85, 1], true);
  }

  private reset(): void {
    this.modeValue = "assembly";
    this.mode.value = "assembly";
    this.explosionPercent = 0;
    this.explosion.value = "0";
    this.explosionValue.value = "0 %";
    this.hiddenComponents.clear();
    this.clippingToggle.checked = false;
    this.clippingPosition.value = "50";
    this.clippingValue.value = "50 %";
    this.showHost = false;
    this.analysis.setExplosionPercent(0);
    this.analysis.reset();
    this.hostToggle.checked = false;
    this.viewer?.setArrangement(null);
    this.viewer?.setClippingPlane(null);
    this.applyDisplay();
    this.frame();
    this.onVisibilityChanged();
  }

  private onVisibilityChanged(): void {
    if (!this.record) return;
    for (const component of this.record.components) this.onVisibility(component, true);
  }
}
