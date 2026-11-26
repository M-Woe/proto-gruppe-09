import * as THREE from "three";
import type { IngestResult } from "./api";
import { h } from "./dom";
import type { AnchorRecord, IfcReference } from "./anchor-data";
import type { Page } from "./page";
import type { Part } from "./parts";
import { partId } from "./selection";
import type { Bounds, Viewer } from "./viewer";

type Layer = "limitations" | "degrees" | "connections" | "directions";
type Relationship = IngestResult["relationships"][number];
type AxisName = "Tx" | "Ty" | "Tz";

interface SceneElement {
  ref: IfcReference;
  name: string;
  ifcClass: string;
  bounds: Bounds;
  part: Part | undefined;
}

interface SceneRelationship {
  model: string;
  relationship: Relationship;
}

interface AnalysisScene {
  elements: SceneElement[];
  byId: Map<string, SceneElement>;
  relationships: SceneRelationship[];
  modelLabels: string[];
  missingBounds: number;
}

interface DirectionResult {
  axisName: AxisName;
  sign: 1 | -1;
  direction: THREE.Vector3;
  distance: number;
  blockers: SceneElement[];
  removable: SceneElement[];
}

interface LocalFrame {
  axes: THREE.Vector3[];
  origin: THREE.Vector3;
  description: string;
}

const layerDefinitions: [Layer, string, string][] = [
  ["limitations", "Einschränkungen", "AABB-Überschneidungen und Berührungskandidaten; keine exakte Oberflächen- oder Verbindungsprüfung."],
  ["degrees", "Bewegungsfreiheitsgrade", "Translationen entlang lokaler Achsen werden grob geprüft. Mechanik und Drehungen bleiben ohne Nachweis unbestimmt."],
  ["connections", "Anschlüsse", "Zeigt manuell zugeordnete IFC-Elemente und dokumentierte IFC-Verbindungen, ohne sie gleichzusetzen."],
  ["directions", "Demontagerichtungen", "Prüft lineare AABB-Sweeps bis außerhalb der geladenen Geometrie; keine sichere Demontagebewertung."],
];

const degreeLabels: AxisName[] = ["Tx", "Ty", "Tz"];
const worldAxes = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
];

function id(ref: { model: string; key: string }): string {
  return partId(ref.model, ref.key);
}

function validBounds(min: number[] | null | undefined, max: number[] | null | undefined): min is [number, number, number] {
  return !!min && !!max && min.length === 3 && max.length === 3
    && [...min, ...max].every(Number.isFinite);
}

function aabbRelation(a: Bounds, b: Bounds, tolerance: number): "overlap" | "touch" | null {
  let interior = true;
  for (let axis = 0; axis < 3; axis++) {
    const penetration = Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);
    if (penetration < -tolerance) return null;
    if (penetration <= tolerance) interior = false;
  }
  return interior ? "overlap" : "touch";
}

function intersects(a: Bounds, b: Bounds, tolerance: number): boolean {
  return a.min[0] <= b.max[0] + tolerance && a.max[0] >= b.min[0] - tolerance
    && a.min[1] <= b.max[1] + tolerance && a.max[1] >= b.min[1] - tolerance
    && a.min[2] <= b.max[2] + tolerance && a.max[2] >= b.min[2] - tolerance;
}

function boundsCentre(bounds: Bounds): THREE.Vector3 {
  return new THREE.Vector3(
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  );
}

function boundsRadius(bounds: Bounds): number {
  return Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ) / 2;
}

function translated(bounds: Bounds, direction: THREE.Vector3, distance: number): Bounds {
  const delta = direction.clone().multiplyScalar(distance);
  return {
    min: [bounds.min[0] + delta.x, bounds.min[1] + delta.y, bounds.min[2] + delta.z],
    max: [bounds.max[0] + delta.x, bounds.max[1] + delta.y, bounds.max[2] + delta.z],
  };
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

function projectionRange(bounds: Bounds, direction: THREE.Vector3): [number, number] {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let corner = 0; corner < 8; corner++) {
    const point = new THREE.Vector3(
      corner & 1 ? bounds.max[0] : bounds.min[0],
      corner & 2 ? bounds.max[1] : bounds.min[1],
      corner & 4 ? bounds.max[2] : bounds.min[2],
    );
    const projection = point.dot(direction);
    minimum = Math.min(minimum, projection);
    maximum = Math.max(maximum, projection);
  }
  return [minimum, maximum];
}

function vectorFromAxis(axis: [number, number, number]): THREE.Vector3 {
  const vector = new THREE.Vector3(...axis);
  return vector.lengthSq() > 1e-10 ? vector.normalize() : new THREE.Vector3();
}

export class AnchorAnalysisPanel {
  private readonly root: HTMLElement;
  private readonly layerInputs = new Map<Layer, HTMLInputElement>();
  private readonly targetSelect: HTMLSelectElement;
  private readonly output: HTMLElement;
  private readonly overlay = new THREE.Group();
  private record: AnchorRecord | null = null;
  private targets: IfcReference[] = [];
  private targetIndex = 0;
  private viewerReady = false;
  private explosionPercent = 0;
  private generation = 0;
  private sceneCache: AnalysisScene | null = null;
  private scenePromise: Promise<AnalysisScene> | null = null;
  private sceneCacheKey = "";
  private overlayViewer: Viewer | null = null;

  constructor(
    private readonly page: Page,
    private readonly getViewer: () => Viewer | null,
    container: HTMLElement,
  ) {
    this.root = h("section", { class: "anchor-analysis", "aria-label": "Analyseebenen" });
    const reset = h("button", { type: "button", class: "secondary" }, "Analyseebenen zurücksetzen");
    reset.onclick = () => this.reset();
    this.targetSelect = h("select", { "aria-label": "Zu prüfendes IFC-Element" }) as HTMLSelectElement;
    this.targetSelect.onchange = () => {
      this.targetIndex = Number(this.targetSelect.value) || 0;
      void this.refresh();
    };
    const layers = h("div", { class: "anchor-analysis-layers" });
    for (const [layer, title, description] of layerDefinitions) {
      const input = h("input", { type: "checkbox", "aria-label": title }) as HTMLInputElement;
      input.onchange = () => void this.refresh();
      this.layerInputs.set(layer, input);
      layers.append(h("label", { class: "anchor-analysis-layer" },
        h("span", { class: "anchor-analysis-layer-title" }, input, title),
        h("small", {}, description)));
    }
    this.output = h("div", { class: "anchor-analysis-output", role: "status" },
      "Aktiviere eine Analyseebene, um belegte IFC- und Geometriedaten anzuzeigen.");
    this.root.append(
      h("h3", {}, "Analyseebenen"),
      h("label", { class: "anchor-analysis-target" }, "Bewegtes Element", this.targetSelect),
      layers,
      reset,
      this.output,
    );
    container.replaceChildren(this.root);
  }

  beginRecord(record: AnchorRecord): void {
    this.generation += 1;
    this.record = record;
    this.viewerReady = false;
    this.explosionPercent = 0;
    this.targets = [record.root, ...record.components];
    this.targetIndex = 0;
    this.sceneCache = null;
    this.scenePromise = null;
    this.sceneCacheKey = "";
    this.layerInputs.forEach((input) => { input.checked = false; });
    this.targetSelect.replaceChildren(...this.targets.map((ref, index) => {
      const part = this.page.parts.get(id(ref));
      const label = part?.displayName || part?.name || ref.globalId;
      return h("option", { value: String(index) }, `${index === 0 ? "Anker" : "Komponente"} · ${ref.model} · ${label}`);
    }));
    this.targetSelect.disabled = this.targets.length < 1;
    this.output.textContent = "Aktiviere eine Analyseebene, um belegte IFC- und Geometriedaten anzuzeigen.";
    this.clearOverlay();
  }

  setViewerReady(): void {
    this.viewerReady = true;
    void this.refresh();
  }

  setExplosionPercent(percent: number): void {
    if (this.explosionPercent === percent) return;
    this.explosionPercent = percent;
    if (this.hasEnabledLayer()) void this.refresh();
  }

  setSelected(ref: IfcReference): void {
    const index = this.targets.findIndex((target) => target.model === ref.model && target.key === ref.key);
    if (index < 0 || index === this.targetIndex) return;
    this.targetIndex = index;
    this.targetSelect.value = String(index);
    if (this.hasEnabledLayer()) void this.refresh();
  }

  reset(): void {
    this.generation += 1;
    this.layerInputs.forEach((input) => { input.checked = false; });
    this.clearOverlay();
    this.output.textContent = "Analyseebenen zurückgesetzt.";
  }

  clear(): void {
    this.generation += 1;
    this.record = null;
    this.viewerReady = false;
    this.targets = [];
    this.targetSelect.replaceChildren();
    this.targetSelect.disabled = true;
    this.sceneCache = null;
    this.scenePromise = null;
    this.sceneCacheKey = "";
    this.reset();
  }

  private hasEnabledLayer(): boolean {
    return [...this.layerInputs.values()].some((input) => input.checked);
  }

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    this.clearOverlay();
    if (!this.record || !this.hasEnabledLayer()) {
      if (!this.record) this.output.textContent = "Wähle zuerst einen Anker aus.";
      else this.output.textContent = "Aktiviere eine Analyseebene, um belegte IFC- und Geometriedaten anzuzeigen.";
      return;
    }
    if (this.explosionPercent > 0) {
      this.output.textContent = "Die Analyse bezieht sich auf die ursprünglichen IFC-Positionen. Setze die lokale Explosion auf 0 %, damit Markierungen und Bauteile deckungsgleich sind.";
      return;
    }
    if (!this.viewerReady || !this.getViewer()) {
      this.output.textContent = "Die Detailgeometrie ist noch nicht verfügbar; Analysevisualisierungen sind derzeit nicht möglich.";
      return;
    }
    const stale = [this.record.root, ...this.record.components, ...(this.record.host ? [this.record.host] : [])]
      .find((ref) => {
        const fingerprint = this.page.modelFingerprint(ref.model);
        return !fingerprint || fingerprint !== ref.fingerprint;
      });
    if (stale) {
      this.output.textContent = `Analyse gesperrt: Der IFC-Fingerabdruck von Modell ${stale.model} stimmt nicht mehr mit der gespeicherten Zuordnung überein.`;
      return;
    }
    this.output.textContent = "IFC-Geometrie und Beziehungen werden geprüft …";
    try {
      const scene = await this.getScene(this.record);
      if (generation !== this.generation || !this.record) return;
      const target = this.targets[this.targetIndex];
      const targetElement = target ? scene.byId.get(id(target)) : undefined;
      if (!target || !targetElement) {
        this.output.textContent = "Für das ausgewählte Element ist keine gültige IFC-Geometrie mit Bounding-Box verfügbar. Ergebnisse: Nicht bestimmbar.";
        return;
      }
      const frame = this.localFrame(scene, this.record, target);
      const directions = this.directionResults(scene, targetElement, frame.axes);
      const viewer = this.getViewer();
      if (!viewer) return;
      this.ensureOverlay(viewer);

      const output: HTMLElement[] = [];
      if (this.layerInputs.get("limitations")?.checked) {
        output.push(this.renderLimitations(scene, this.record));
      }
      if (this.layerInputs.get("degrees")?.checked) {
        output.push(this.renderDegrees(scene, targetElement, frame, directions));
      }
      if (this.layerInputs.get("connections")?.checked) {
        output.push(this.renderConnections(scene, this.record));
      }
      if (this.layerInputs.get("directions")?.checked) {
        output.push(this.renderDirections(scene, targetElement, frame, directions,
          !this.layerInputs.get("degrees")?.checked));
      }
      if (generation !== this.generation) return;
      this.output.replaceChildren(...output);
      viewer.invalidate();
    } catch (error) {
      if (generation !== this.generation) return;
      this.output.textContent = `Analyse fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async getScene(record: AnchorRecord): Promise<AnalysisScene> {
    const mandatory = new Set([record.root, ...record.components, ...(record.host ? [record.host] : [])]
      .map((ref) => ref.model));
    const models = this.page.models.filter((model) => model.visible || mandatory.has(model.label));
    const cacheKey = models.map((model) => `${model.label}:${this.page.modelFingerprint(model.label) ?? "?"}`).join("|");
    if (this.sceneCache && this.sceneCacheKey === cacheKey) return this.sceneCache;
    if (this.scenePromise && this.sceneCacheKey === cacheKey) return this.scenePromise;
    this.sceneCacheKey = cacheKey;
    this.sceneCache = null;
    const promise = this.buildScene(models);
    this.scenePromise = promise;
    try {
      const scene = await promise;
      if (this.sceneCacheKey === cacheKey) this.sceneCache = scene;
      return scene;
    } finally {
      if (this.scenePromise === promise) this.scenePromise = null;
    }
  }

  private async buildScene(models: Page["models"]): Promise<AnalysisScene> {
    const loaded = await Promise.all(models.map(async (model) => ({
      model,
      data: await this.page.model(model.label),
    })));
    const elements: SceneElement[] = [];
    const relationships: SceneRelationship[] = [];
    let missingBounds = 0;
    for (const { model, data } of loaded) {
      relationships.push(...data.relationships.map((relationship) => ({ model: model.label, relationship })));
      const drawableKeys = new Set(model.keys);
      let minimum: [number, number, number] = [Infinity, Infinity, Infinity];
      let maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      const candidates = data.elements.filter((element) => {
        const geometry = element.geometry;
        if (!drawableKeys.has(element.key) || geometry.status !== "ok") return false;
        if (!validBounds(geometry.bbox_min_m, geometry.bbox_max_m)) {
          missingBounds++;
          return false;
        }
        for (let axis = 0; axis < 3; axis++) {
          minimum[axis] = Math.min(minimum[axis], geometry.bbox_min_m[axis]);
          maximum[axis] = Math.max(maximum[axis], geometry.bbox_max_m![axis]);
        }
        return true;
      });
      if (!Number.isFinite(minimum[0])) continue;
      const ifcCentre = new THREE.Vector3(
        (minimum[0] + maximum[0]) / 2,
        (minimum[1] + maximum[1]) / 2,
        (minimum[2] + maximum[2]) / 2,
      );
      const centreYUp = new THREE.Vector3(ifcCentre.x, ifcCentre.z, -ifcCentre.y);
      const offset = new THREE.Vector3(...this.page.modelOffset(model.label));
      for (const element of candidates) {
        const geometry = element.geometry;
        if (!validBounds(geometry.bbox_min_m, geometry.bbox_max_m)) continue;
        const sceneMin = new THREE.Vector3(Infinity, Infinity, Infinity);
        const sceneMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        for (let corner = 0; corner < 8; corner++) {
          const point = new THREE.Vector3(
            corner & 1 ? geometry.bbox_max_m![0] : geometry.bbox_min_m[0],
            corner & 2 ? geometry.bbox_max_m![1] : geometry.bbox_min_m[1],
            corner & 4 ? geometry.bbox_max_m![2] : geometry.bbox_min_m[2],
          );
          point.set(point.x, point.z, -point.y).sub(centreYUp).add(offset);
          sceneMin.min(point);
          sceneMax.max(point);
        }
        const part = this.page.parts.get(partId(model.label, element.key));
        const fingerprint = this.page.modelFingerprint(model.label) ?? "";
        const ref: IfcReference = {
          model: model.label,
          key: element.key,
          fingerprint,
          globalId: part?.globalId || element.global_id || element.key,
        };
        elements.push({
          ref,
          name: part?.displayName || part?.name || element.name || ref.globalId,
          ifcClass: part?.ifcClass || element.ifc_class,
          part,
          bounds: {
            min: [sceneMin.x, sceneMin.y, sceneMin.z],
            max: [sceneMax.x, sceneMax.y, sceneMax.z],
          },
        });
      }
    }
    return {
      elements,
      byId: new Map(elements.map((element) => [id(element.ref), element])),
      relationships,
      modelLabels: loaded.map(({ model }) => model.label),
      missingBounds,
    };
  }

  private localFrame(scene: AnalysisScene, record: AnchorRecord, target: IfcReference): LocalFrame {
    const viewer = this.getViewer();
    const refs = [record.root, ...record.components];
    const keysByModel = new Map<string, Set<string>>();
    for (const ref of refs) {
      const keys = keysByModel.get(ref.model) ?? new Set<string>();
      keys.add(ref.key);
      keysByModel.set(ref.model, keys);
    }
    const frames = viewer?.elementFrames(keysByModel);
    const rootFrame = frames?.get(record.root.model)?.get(record.root.key);
    const targetFrame = frames?.get(target.model)?.get(target.key);
    const sourceFrame = rootFrame ?? targetFrame;
    const element = scene.byId.get(id(record.root)) ?? scene.byId.get(id(target));
    const origin = element ? boundsCentre(element.bounds) : new THREE.Vector3();
    if (!sourceFrame) {
      return { axes: worldAxes.map((axis) => axis.clone()), origin, description: "Viewer-Weltachsen (Y-up); IFC-Elementachsen nicht verfügbar" };
    }
    return {
      axes: [sourceFrame.axes.x, sourceFrame.axes.y, sourceFrame.axes.z].map(vectorFromAxis),
      origin,
      description: rootFrame ? "Lokale Achsen des übergeordneten Ankerelements" : "Lokale Achsen des ausgewählten Elements (Fallback)",
    };
  }

  private directionResults(scene: AnalysisScene, target: SceneElement, axes: THREE.Vector3[]): DirectionResult[] {
    const results: DirectionResult[] = [];
    for (let axis = 0; axis < 3; axis++) {
      const axisName = degreeLabels[axis];
      const unit = axes[axis].lengthSq() > 1e-10 ? axes[axis].clone().normalize() : worldAxes[axis].clone();
      let sceneMinimum = Infinity;
      let sceneMaximum = -Infinity;
      for (const element of scene.elements) {
        const [minimum, maximum] = projectionRange(element.bounds, unit);
        sceneMinimum = Math.min(sceneMinimum, minimum);
        sceneMaximum = Math.max(sceneMaximum, maximum);
      }
      const [targetMinimum, targetMaximum] = projectionRange(target.bounds, unit);
      const tolerance = Math.max(0.001, (sceneMaximum - sceneMinimum) * 0.000001);
      for (const sign of [1, -1] as const) {
        const direction = unit.clone().multiplyScalar(sign);
        const distance = Math.max(tolerance, sign > 0
          ? sceneMaximum - targetMinimum + tolerance
          : targetMaximum - sceneMinimum + tolerance);
        const sweep = unionBounds(
          translated(target.bounds, direction, tolerance),
          translated(target.bounds, direction, distance),
        );
        const blockers = scene.elements.filter((element) =>
          id(element.ref) !== id(target.ref) && intersects(sweep, element.bounds, tolerance));
        const removable = blockers.filter((candidate) =>
          blockers.every((other) => id(other.ref) === id(candidate.ref)));
        results.push({ axisName, sign, direction, distance, blockers, removable });
      }
    }
    return results;
  }

  private renderLimitations(scene: AnalysisScene, record: AnchorRecord): HTMLElement {
    const groupRefs = [record.root, ...record.components];
    const pairs = new Map<string, { first: SceneElement; second: SceneElement; kind: "overlap" | "touch" }>();
    let sceneSpan = 0;
    if (scene.elements.length) {
      const low = [Infinity, Infinity, Infinity];
      const high = [-Infinity, -Infinity, -Infinity];
      for (const element of scene.elements) {
        for (let axis = 0; axis < 3; axis++) {
          low[axis] = Math.min(low[axis], element.bounds.min[axis]);
          high[axis] = Math.max(high[axis], element.bounds.max[axis]);
        }
      }
      sceneSpan = Math.hypot(high[0] - low[0], high[1] - low[1], high[2] - low[2]);
    }
    const tolerance = Math.max(0.001, sceneSpan * 0.000001);
    for (const ref of groupRefs) {
      const first = scene.byId.get(id(ref));
      if (!first) continue;
      for (const second of scene.elements) {
        if (id(first.ref) === id(second.ref)) continue;
        const kind = aabbRelation(first.bounds, second.bounds, tolerance);
        if (!kind) continue;
        const pairKey = [id(first.ref), id(second.ref)].sort().join("|");
        pairs.set(pairKey, { first, second, kind });
      }
    }
    const values = [...pairs.values()];
    const overlaps = values.filter((pair) => pair.kind === "overlap");
    const touches = values.filter((pair) => pair.kind === "touch");
    const visualGroup = this.addLayerGroup();
    for (const pair of values.slice(0, 48)) {
      this.addBox(visualGroup, pair.second.bounds, pair.kind === "overlap" ? 0xd9534f : 0xe3a43b);
    }
    const list = h("ul", { class: "anchor-analysis-list" },
      ...values.slice(0, 20).map((pair) => h("li", {},
        h("strong", {}, pair.kind === "overlap" ? "AABB-Überschneidung" : "AABB-Berührungskandidat"),
        ` · ${pair.first.name} (${pair.first.ref.model} · ${pair.first.ref.globalId}) ↔ ${pair.second.name} (${pair.second.ref.model} · ${pair.second.ref.globalId})`)));
    if (values.length > 20) list.append(h("li", {}, `Weitere ${values.length - 20} Paar(e) nicht einzeln aufgeführt.`));
    const details = values.length
      ? list
      : h("p", {}, "Keine AABB-Überschneidung oder -Berührungskandidaten zwischen Ankergruppe und geprüfter Geometrie gefunden.");
    return this.resultSection("Einschränkungen", "Geometrisch berechnet",
      `${overlaps.length} AABB-Überschneidung(en), ${touches.length} AABB-Berührungskandidat(en). Toleranz: ${tolerance.toLocaleString("de-DE", { maximumFractionDigits: 3 })} m.`,
      details,
      h("p", { class: "anchor-analysis-note" },
        `Geprüfte Modelle: ${scene.modelLabels.join(", ") || "keine"}. AABB-Boxen sind Näherungen; sie belegen weder Kontaktflächen noch mechanische Verbindungen. ${scene.missingBounds ? `${scene.missingBounds} Geometrieelement(e) ohne Bounding-Box blieben unberücksichtigt.` : ""}`));
  }

  private renderDegrees(
    scene: AnalysisScene,
    target: SceneElement,
    frame: LocalFrame,
    directions: DirectionResult[],
  ): HTMLElement {
    const group = this.addLayerGroup();
    this.addDirectionArrows(group, target, directions, 0.2);
    const triadLength = Math.max(0.2, Math.min(0.65, boundsRadius(target.bounds) * 0.4));
    const triadColors = [0xd9534f, 0x35a779, 0x4d83c4];
    for (let axis = 0; axis < 3; axis++) {
      const arrow = new THREE.ArrowHelper(frame.axes[axis], frame.origin, triadLength, triadColors[axis], triadLength * 0.22, triadLength * 0.12);
      this.forEachMaterial(arrow.line, (material) => { material.depthTest = false; });
      this.forEachMaterial(arrow.cone, (material) => { material.depthTest = false; });
      arrow.renderOrder = 10;
      group.add(arrow);
      this.addText(group, ["X", "Y", "Z"][axis], frame.origin.clone().addScaledVector(frame.axes[axis], triadLength * 1.15), triadColors[axis]);
    }
    const radius = Math.max(0.15, Math.min(0.8, boundsRadius(target.bounds) * 0.55));
    for (let axis = 0; axis < 3; axis++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, Math.max(radius * 0.035, 0.008), 8, 36),
        this.overlayMaterial(0x8992a0),
      );
      ring.position.copy(boundsCentre(target.bounds));
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.axes[axis]);
      ring.renderOrder = 10;
      group.add(ring);
      this.addText(group, `R${["x", "y", "z"][axis]} · ?`, ring.position.clone().addScaledVector(frame.axes[axis], radius * 1.15), 0x8992a0);
    }
    const rows = degreeLabels.map((name) => {
      const pair = directions.filter((direction) => direction.axisName === name);
      const positive = pair.find((direction) => direction.sign === 1)!;
      const negative = pair.find((direction) => direction.sign === -1)!;
      return h("li", {},
        h("strong", {}, name),
        `: + ${this.directionState(positive)}, − ${this.directionState(negative)}; mechanisch: Nicht bestimmbar.`);
    });
    rows.push(
      h("li", {}, h("strong", {}, "Rx / Ry / Rz"), ": geometrisch und mechanisch nicht bestimmbar; ein dokumentierter Drehpunkt bzw. Bewegungsmechanismus fehlt."),
    );
    return this.resultSection("Bewegungsfreiheitsgrade", "Geometrisch berechnet / Nicht bestimmbar",
      `${frame.description}. Ursprung: Mittelpunkt der IFC-Bounding-Box des Ankers; Geometrieprüfung nur als AABB-Sweep.`,
      h("ul", { class: "anchor-analysis-list" }, ...rows),
      h("p", { class: "anchor-analysis-note" },
        `Mechanische Freiheitsgrade bleiben für alle sechs Achsen Nicht bestimmbar. IFC-Beziehungen allein beschreiben hier keine belastbare Bewegungsrestriktion. ${scene.modelLabels.length} Modell(e) wurden geometrisch berücksichtigt.`));
  }

  private renderConnections(scene: AnalysisScene, record: AnchorRecord): HTMLElement {
    const group = this.addLayerGroup();
    const assigned = [record.root, ...record.components, ...(record.host ? [record.host] : [])];
    for (const ref of assigned) {
      const element = scene.byId.get(id(ref));
      if (element) this.addBox(group, element.bounds, ref === record.host ? 0x4f9b72 : 0x4d83c4);
    }
    const groupIds = new Set(assigned.map(id));
    const relationships = scene.relationships.filter(({ model, relationship }) =>
      (relationship.kind === "connects" || relationship.kind === "connects_path")
      && !!relationship.relating_key && !!relationship.related_key
      && (groupIds.has(partId(model, relationship.relating_key))
        || groupIds.has(partId(model, relationship.related_key))));
    for (const { model, relationship } of relationships) {
      if (!relationship.relating_key || !relationship.related_key) continue;
      const first = scene.byId.get(partId(model, relationship.relating_key));
      const second = scene.byId.get(partId(model, relationship.related_key));
      if (!first || !second) continue;
      this.addBox(group, first.bounds, 0xb56bd6);
      this.addBox(group, second.bounds, 0xb56bd6);
      const geometry = new THREE.BufferGeometry().setFromPoints([
        boundsCentre(first.bounds),
        boundsCentre(second.bounds),
      ]);
      const line = new THREE.Line(geometry, this.overlayMaterial(0xb56bd6));
      line.renderOrder = 10;
      group.add(line);
    }

    const componentItems = record.components.map((ref) => {
      const part = this.page.parts.get(id(ref));
      const element = scene.byId.get(id(ref));
      const centre = element ? boundsCentre(element.bounds) : null;
      const material = part?.material || "Nicht vorhanden";
      const dimensions = part
        ? `L ${this.measure(part.length)} · B ${this.measure(part.width)} · H ${this.measure(part.height)}`
        : "Maße: Nicht vorhanden";
      return h("li", {},
        h("strong", {}, part?.displayName || part?.name || ref.globalId),
        ` · ${part?.ifcClass || "Ifc-Klasse nicht vorhanden"} · ${ref.model} · ${ref.globalId}`,
        h("br"),
        `Funktion (manuell): ${ref.role || "Nicht festgelegt"} · Material (IFC): ${material} · ${dimensions}`,
        h("br"),
        centre
          ? `AABB-Mittelpunkt (berechnet, Viewer m): ${this.coordinates(centre)}`
          : "Position: Nicht vorhanden",
    );
    });
    const relationItems = relationships.map(({ model, relationship }) => {
      const first = relationship.relating_key
        ? scene.byId.get(partId(model, relationship.relating_key)) : undefined;
      const second = relationship.related_key
        ? scene.byId.get(partId(model, relationship.related_key)) : undefined;
      return h("li", {},
        h("strong", {}, relationship.ifc_rel_class),
        ` · ${relationship.kind} · ${first ? `${first.name} (${first.ref.globalId})` : relationship.relating_key ?? "?"} ↔ ${second ? `${second.name} (${second.ref.globalId})` : relationship.related_key ?? "?"} · Modell ${model} · IFC-Daten`);
    });
    const participants = new Map<string, SceneElement>();
    for (const { model, relationship } of relationships) {
      for (const key of [relationship.relating_key, relationship.related_key]) {
        if (!key) continue;
        const element = scene.byId.get(partId(model, key));
        if (element) participants.set(id(element.ref), element);
      }
    }
    const participantItems = [...participants.values()].map((element) => {
      const part = element.part;
      const centre = boundsCentre(element.bounds);
      return h("li", {},
        h("strong", {}, element.name),
        ` · ${element.ifcClass} · ${element.ref.model} · ${element.ref.globalId}`,
        h("br"),
        `Material (IFC): ${part?.material || "Nicht vorhanden"} · Maße (IFC/importiert): ${part
          ? `L ${this.measure(part.length)} · B ${this.measure(part.width)} · H ${this.measure(part.height)}`
          : "Nicht vorhanden"}`,
        h("br"),
        `AABB-Mittelpunkt (berechnet, Viewer m): ${this.coordinates(centre)}`);
    });
    const details: HTMLElement[] = [];
    if (componentItems.length) {
      details.push(h("h5", {}, "Manuell zugeordnete IFC-Komponenten (keine automatische Anschlussklassifikation)"),
        h("ul", { class: "anchor-analysis-list" }, ...componentItems));
    } else {
      details.push(h("p", {}, "Keine separat modellierten Anschlusskomponenten zugeordnet. Schrauben, Muttern, Platten oder andere Verbindungsmittel werden nicht ergänzt."));
    }
    if (record.host) {
      const hostPart = this.page.parts.get(id(record.host));
      details.push(h("p", {}, `Host manuell zugeordnet: ${hostPart?.displayName || hostPart?.name || record.host.globalId} · ${record.host.model}. Die Zuordnung ist kein mechanischer Nachweis.`));
    }
    details.push(h("h5", {}, "Dokumentierte IFC-Beziehungen"));
    details.push(relationships.length
      ? h("ul", { class: "anchor-analysis-list" }, ...relationItems)
      : h("p", {}, "Keine passende IFC-connects- oder connects_path-Beziehung zu den gespeicherten Elementen gefunden."));
    if (relationships.length) {
      details.push(h("h5", {}, "Geometrisch verfügbare IFC-Beziehungspartner"),
        participantItems.length
          ? h("ul", { class: "anchor-analysis-list" }, ...participantItems)
          : h("p", {}, "Für die Beziehungspartner ist keine gültige Geometrie-Bounding-Box vorhanden."));
    }
    return this.resultSection("Anschlüsse", "IFC-Daten / manuelle Zuordnung",
      `${record.components.length} manuell zugeordnete Komponente(n), ${relationships.length} passende IFC-connects-Beziehung(en). Eine IFC-Beziehung ist hier keine automatische mechanische Bestätigung.`,
      h("div", {}, ...details),
      h("p", { class: "anchor-analysis-note" }, "Komponenteninformationen stammen aus den importierten IFC-Eigenschaften; AABB-Mittelpunkte sind geometrisch berechnet. Manuelle Rollen und Host-Zuordnungen bleiben als solche gekennzeichnet."));
  }

  private renderDirections(
    scene: AnalysisScene,
    target: SceneElement,
    frame: LocalFrame,
    directions: DirectionResult[],
    drawArrows: boolean,
  ): HTMLElement {
    const group = this.addLayerGroup();
    if (drawArrows) this.addDirectionArrows(group, target, directions, 0.2);
    const blockers = [...new Map(directions.flatMap((direction) => direction.blockers)
      .map((element) => [id(element.ref), element])).values()];
    for (const blocker of blockers.slice(0, 48)) this.addBox(group, blocker.bounds, 0xd9534f);
    const rows = directions.map((direction) => {
      const sign = direction.sign > 0 ? "+" : "−";
      const blockerNames = direction.blockers.slice(0, 8)
        .map((element) => `${element.name} (${element.ref.model} · ${element.ref.globalId})`);
      const blockersText = direction.blockers.length
        ? `AABB-Blockierkandidat(en): ${blockerNames.join(", ")}${direction.blockers.length > 8 ? ` und ${direction.blockers.length - 8} weitere` : ""}.`
        : "Kein AABB-Blockierkandidat bis außerhalb der geprüften Modellhülle.";
      const removalText = direction.removable.length
        ? `AABB-What-if: Ohne ${direction.removable[0].name} wäre dieser Sweep im Boxentest frei; keine gesicherte Demontagereihenfolge.`
        : "";
      return h("li", {},
        h("strong", {}, `${direction.axisName}${sign}`),
        ` · ${this.directionState(direction)} · geprüfter Weg ${direction.distance.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m. `,
        blockersText,
        removalText ? h("span", { class: "anchor-analysis-note" }, ` ${removalText}`) : "");
    });
    const dependencies = new Map<string, { element: SceneElement; directions: string[] }>();
    for (const direction of directions) {
      const candidate = direction.removable[0];
      if (!candidate) continue;
      const entry = dependencies.get(id(candidate.ref)) ?? { element: candidate, directions: [] };
      entry.directions.push(`${direction.axisName}${direction.sign > 0 ? "+" : "−"}`);
      dependencies.set(id(candidate.ref), entry);
    }
    const dependencyItems = [...dependencies.values()].map(({ element, directions: axes }) =>
      h("li", {},
        `${target.name} · ${axes.join(", ")}: Der AABB-Sweep wäre im hypothetischen Ausschlusstest ohne `,
        h("strong", {}, `${element.name} (${element.ref.model} · ${element.ref.globalId})`),
        " frei. Das ist keine gesicherte Reihenfolge oder reale Demontage."));
    const dependencySummary = h("div", {},
      h("h5", {}, "Geometrisch ermittelte Abhängigkeiten (AABB-What-if)"),
      dependencyItems.length
        ? h("ul", { class: "anchor-analysis-list" }, ...dependencyItems)
        : h("p", {}, "Kein einzelner AABB-Blockierkandidat wurde gefunden, dessen hypothetischer Ausschluss einen geprüften Weg allein freigibt. Eine Demontagereihenfolge ist nicht bestimmbar."));
    const targetName = target.name;
    return this.resultSection("Mögliche Demontagerichtungen", "Geometrisch berechnet",
      `Ziel: ${targetName} · ${frame.description}. Der Weg ist ein konservativer AABB-Sweep durch die sichtbaren bzw. der Baugruppe zugeordneten Modelle.`,
      h("div", {}, h("ul", { class: "anchor-analysis-list" }, ...rows), dependencySummary),
      h("p", { class: "anchor-analysis-note" },
        `Ein AABB-freier Weg bedeutet nicht, dass die Bewegung mechanisch möglich, sicher oder tatsächlich demontierbar ist. ${scene.missingBounds ? `${scene.missingBounds} Geometrieelement(e) ohne Bounding-Box blieben unberücksichtigt.` : ""} Die IFC-Beziehungen werden separat unter „Anschlüsse“ angezeigt; sie begründen keine gesicherte Reihenfolge.`));
  }

  private directionState(result: DirectionResult): string {
    return result.blockers.length ? "AABB-Blockierkandidat" : "AABB-frei bis zur Modellhülle";
  }

  private resultSection(title: string, evidence: string, summary: string, details: Node, note: Node): HTMLElement {
    return h("section", { class: "anchor-analysis-result" },
      h("h4", {}, title),
      h("span", { class: "anchor-analysis-evidence" }, evidence),
      h("p", {}, summary),
      details,
      note);
  }

  private measure(value: Part["length"]): string {
    if (value.value === null || value.value === "") return "Nicht vorhanden";
    const number = typeof value.value === "number"
      ? value.value.toLocaleString("de-DE", { maximumFractionDigits: 3 })
      : value.value;
    return `${number} m`;
  }

  private coordinates(position: THREE.Vector3): string {
    return [position.x, position.y, position.z]
      .map((value) => value.toLocaleString("de-DE", { maximumFractionDigits: 3 }))
      .join(", ");
  }

  private ensureOverlay(viewer: Viewer): void {
    if (this.overlayViewer === viewer) return;
    this.overlayViewer?.scene.remove(this.overlay);
    this.overlayViewer = viewer;
    viewer.scene.add(this.overlay);
  }

  private clearOverlay(): void {
    this.disposeGroup(this.overlay);
    this.overlay.clear();
    this.overlayViewer?.invalidate();
  }

  private addLayerGroup(): THREE.Group {
    const group = new THREE.Group();
    this.overlay.add(group);
    return group;
  }

  private addBox(group: THREE.Group, bounds: Bounds, color: number): void {
    const box = new THREE.Box3(
      new THREE.Vector3(...bounds.min),
      new THREE.Vector3(...bounds.max),
    );
    const helper = new THREE.Box3Helper(box, new THREE.Color(color));
    this.forEachMaterial(helper, (material) => {
      material.depthTest = false;
      material.transparent = true;
      material.opacity = 0.95;
    });
    helper.renderOrder = 10;
    group.add(helper);
  }

  private addDirectionArrows(
    group: THREE.Group,
    target: SceneElement,
    directions: DirectionResult[],
    opacity: number,
  ): void {
    const origin = boundsCentre(target.bounds);
    const length = Math.max(0.25, Math.min(1.25, boundsRadius(target.bounds) * 0.7));
    for (const result of directions) {
      const color = result.blockers.length ? 0xd9534f : 0x35a779;
      const arrow = new THREE.ArrowHelper(result.direction, origin, length, color, length * 0.24, length * 0.12);
      this.forEachMaterial(arrow.line, (material) => {
        material.depthTest = false;
        material.transparent = true;
        material.opacity = opacity;
      });
      this.forEachMaterial(arrow.cone, (material) => {
        material.depthTest = false;
        material.transparent = true;
        material.opacity = opacity;
      });
      arrow.renderOrder = 10;
      group.add(arrow);
      const label = `${result.axisName}${result.sign > 0 ? "+" : "−"}`;
      const position = origin.clone().addScaledVector(result.direction, length * 1.15);
      this.addText(group, label, position, color);
    }
  }

  private addText(group: THREE.Group, text: string, position: THREE.Vector3, color: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 72;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    context.font = "bold 38px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }));
    sprite.position.copy(position);
    sprite.scale.set(0.65, 0.18, 1);
    sprite.renderOrder = 11;
    group.add(sprite);
  }

  private overlayMaterial(color: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false });
  }

  private forEachMaterial(
    object: THREE.Mesh | THREE.Line | THREE.Sprite,
    update: (material: THREE.Material) => void,
  ): void {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) update(material);
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite)) return;
      if ("geometry" in object) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if ("map" in material) material.map?.dispose();
        material.dispose();
      }
    });
  }
}
