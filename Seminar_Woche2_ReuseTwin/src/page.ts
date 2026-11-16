// What Inventory and Studio share: the model menu and the tabs, the 3D viewer (click selects, hover highlights,
// Frame / F fits the camera, Esc clears), the status line and the core-down notice. The pages add their own parts.
// All imported models with geometry live in the same 3D view at once: each is loaded once, into its own group,
// and the switches next to the model menu show or hide it — the geometry is never loaded again.
import { api, serverUp, type IngestResult, type ModelSummary } from "./api";
import { arrived, h, toast } from "./dom";
import { showOffline } from "./offline";
import { Parts, unitsOf } from "./parts";
import { Selection, partId } from "./selection";
import { startRipples } from "./ripples";
import { Viewer, type ModelInfo } from "./viewer";

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface Page {
  /** The active model's folder in out/ — the one the panels and the API calls talk about. */
  readonly label: string;
  /** The active model's summary: file, schema, units, storeys, counts. */
  readonly summary: ModelSummary;
  readonly viewer: Viewer;
  /** Element keys of the active model drawn in 3D (elements without geometry are not among them). */
  readonly keys: string[];
  /** Every model in the 3D view: its label, its element keys, whether it is shown. */
  readonly models: ModelInfo[];
  /** All elements of all loaded models, with their IFC properties (src/parts.ts). */
  readonly parts: Parts;
  /** Everything the import read for the active model (model.json), fetched on first use and then kept. */
  model(): Promise<IngestResult>;
  /** Die gemeinsame Auswahl aller Ansichten (3D-Viewer, Tabelle, Infokarte). */
  readonly selection: Selection;
  /** Meldet jede Änderung der Auswahl (die eindeutigen Ids der Bauteile). */
  onSelect(fn: (ids: string[]) => void): void;
  /** Richtet die Kamera auf die Auswahl. */
  focusSelection(): void;
  setStatus(text: string, error?: boolean): void;
  /** Switches the model the panels talk about (the model menu); every model stays in the 3D view. */
  setActiveModel(label: string): void;
  /** Shows or hides one model in the 3D view; its geometry stays loaded. */
  setModelVisible(label: string, visible: boolean): void;
}

function setStatus(text: string, error = false): void {
  const s = $("status");
  s.textContent = text;
  s.classList.toggle("error", error);
}

// --- coordinates ---------------------------------------------------------------------------------
// The core reads the IFC in world coordinates and writes the GLB relative to that model's OWN world
// bounding-box centre, so the numbers stay small. Two models of the same building are therefore a
// little apart in the scene, even though their world coordinates agree. The world coordinates
// themselves are kept (model.json: placement_m, bbox_min_m/max_m) — the helpers below turn the
// per-model origin back into a translation, so models that share a coordinate system land on each
// other. Nothing is invented: every number comes from the core's own reading of the IFC.
//
// glTF (and three.js) are Y-up, IFC is Z-up: the core converts (x, y, z) to (x, z, -y).
const toYUp = (v: [number, number, number]): [number, number, number] => [v[0], v[2], -v[1]];
const toZUp = (v: [number, number, number]): [number, number, number] => [v[0], -v[2], v[1]];

/** The centre of a model in the IFC's own world coordinates (metres), over the elements that are
 *  drawn in 3D. These are the coordinates of the file, not a computed guess. */
function worldCentre(model: IngestResult, keys: Set<string>): [number, number, number] | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const el of model.elements) {
    if (!keys.has(el.key)) continue;
    const g = el.geometry;
    if (!g || g.status !== "ok" || !g.bbox_min_m || !g.bbox_max_m) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], g.bbox_min_m[k]);
      max[k] = Math.max(max[k], g.bbox_max_m[k]);
    }
  }
  if (!Number.isFinite(min[0])) return null;
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

/** Opens the model named in ?model= (or the first one); null when the core is down or there are no models yet. */
export async function openPage(): Promise<Page | null> {
  startRipples($<HTMLCanvasElement>("ripples"), $("viewport"));
  if (!(await serverUp())) return showOffline(), null;
  const models = await api.models();
  if (!models.length) {
    setStatus("No models yet — import an IFC file first");
    $("viewport").append(h("div", { class: "stage-empty" }, h("strong", {}, "No models yet"),
      h("span", {}, "Import an IFC file on the ", h("a", { href: "/import.html" }, "Import"), " page.")));
    return null;
  }
  const wanted = new URLSearchParams(location.search).get("model");
  const drawable = models.filter((m) => m.has_glb);
  let active = models.find((m) => m.label === wanted)?.label ?? drawable[0]?.label ?? models[0].label;

  const viewer = new Viewer($<HTMLCanvasElement>("canvas"));
  const summaries = new Map<string, ModelSummary>();
  await Promise.all(models.map(async (m) => summaries.set(m.label, await api.summary(m.label))));

  // Every model with geometry is loaded once, into its own group in the same scene: they keep the coordinates the
  // core computed, so models of one building line up, and the switches below show and hide them.
  const keysOf = new Map<string, string[]>();
  await arrived();
  for (const m of drawable) {
    setStatus(`Loading ${m.file ?? m.label}…`);
    keysOf.set(m.label, await viewer.load(api.glbUrl(m.label), m.label));
  }
  if (!drawable.length) {
    const summary = summaries.get(active)!;
    $("viewport").append(h("div", { class: "stage-empty" }, h("strong", {}, "No 3D view"),
      h("span", {}, `geometry.glb ${summary.glb.status}${summary.glb.detail ? `: ${summary.glb.detail}` : ""}`)));
  }
  viewer.setActiveModel(active);

  // --- where the models stand ---------------------------------------------------------------------
  // Every model was written relative to its own world bounding-box centre, so models of one
  // building would sit a little apart. The origin each model was written against is read back
  // from the world coordinates the core kept (model.json), and the models are moved into one
  // frame — the first model's. Models that do not share a coordinate system keep their own
  // origin; a model without world coordinates keeps the position the core wrote.
  const modelJson = new Map<string, Promise<IngestResult>>();
  const fetchModel = (label: string): Promise<IngestResult> => {
    let p = modelJson.get(label);
    if (!p) {
      p = api.model(label).catch((e) => {
        modelJson.delete(label);
        toast((e as Error).message, true);
        throw e;
      });
      modelJson.set(label, p);
    }
    return p;
  };

  const origins = new Map<string, [number, number, number]>();
  const parts = new Parts();
  await Promise.all(drawable.map(async (m) => {
    const loaded = viewer.loadedCentre(m.label);
    if (!loaded) return;
    try {
      const data = await fetchModel(m.label);
      const world = worldCentre(data, new Set(keysOf.get(m.label)!));
      if (!world) return;
      // the origin the model was written against: its world centre, minus where it was loaded
      const l = toZUp([loaded.x, loaded.y, loaded.z]);
      origins.set(m.label, [world[0] - l[0], world[1] - l[1], world[2] - l[2]]);
      // the catalogue of all elements, for the parts table (the same model.json, read once)
      parts.add(m.label, m.file ?? m.label, summaries.get(m.label)?.source.schema_identifier ?? "?",
        unitsOf(data.units), data);
    } catch {
      /* no world coordinates: the model keeps the position the core wrote */
    }
  }));

  const offsets = new Map<string, [number, number, number]>();
  const reference = origins.get(drawable[0]?.label ?? "");
  if (reference) {
    for (const m of drawable) {
      const o = origins.get(m.label);
      if (!o) continue;
      const off = toYUp([o[0] - reference[0], o[1] - reference[1], o[2] - reference[2]]);
      offsets.set(m.label, off);
      viewer.setModelOffset(m.label, off);
    }
  }
  viewer.frame(undefined, undefined, false); // fit every model that is shown

  // The model menu: which model the panels and the API calls talk about. Switching it does not reload the page —
  // all models stay in the 3D view.
  const sel = $<HTMLSelectElement>("model");
  for (const m of models) sel.append(h("option", { value: m.label }, `${m.file ?? m.label}${m.has_glb ? "" : " (no geometry)"}`));
  sel.value = active;

  // One switch per model: shown or hidden in the 3D view. Toggling only changes visibility, never loads again.
  const switches = new Map<string, HTMLInputElement>();
  const visBox = $<HTMLDivElement>("model-visibility");
  const markSwitch = (label: string, visible: boolean) =>
    visBox.querySelector(`[data-model="${CSS.escape(label)}"]`)?.classList.toggle("off", !visible);

  const updateStatus = () => {
    const summary = summaries.get(active);
    if (!summary) return;
    const s = summary.source;
    const facts = `${s.path.split(/[\\/]/).pop() ?? active} · ${s.schema_identifier} · ${s.authoring_application ?? "unbekanntes Programm"}`;
    const keys = keysOf.get(active) ?? [];
    const shown = viewer.models().filter((m) => m.visible).length;
    const total = viewer.models().length;
    const part = total > 1 ? ` · ${shown} von ${total} Modellen sichtbar` : "";
    // Where the models stand, and how we know it: the correction comes from the world coordinates.
    const moved = [...offsets.entries()]
      .filter(([, o]) => Math.hypot(o[0], o[1], o[2]) > 0.005)
      .map(([l, o]) => `${l} ${Math.hypot(o[0], o[1], o[2]).toFixed(2)} m`);
    const place = moved.length ? ` · Platzierung nach den IFC-Weltkoordinaten (${moved.join(", ")})` : "";
    setStatus(`${facts} · ${summary.n_elements} Bauteile, ${keys.length} gezeichnet, ${summary.n_elements - keys.length} ohne Geometrie${part}${place}`);
  };

  const setActive = (next: string) => {
    if (!summaries.has(next)) return;
    active = next;
    viewer.setActiveModel(next);
    sel.value = next;
    history.replaceState(null, "", `${location.pathname}?model=${encodeURIComponent(next)}`);
    for (const [id, path] of [["tab-import", "/import.html"], ["tab-inventory", "/"], ["tab-studio", "/studio.html"]])
      $<HTMLAnchorElement>(id).href = `${path}?model=${encodeURIComponent(next)}`;
    updateStatus();
  };
  sel.onchange = () => setActive(sel.value);
  for (const [id, path] of [["tab-import", "/import.html"], ["tab-inventory", "/"], ["tab-studio", "/studio.html"]])
    $<HTMLAnchorElement>(id).href = `${path}?model=${encodeURIComponent(active)}`;

  for (const m of models) {
    if (!m.has_glb) continue;
    const box = h("input", { type: "checkbox" }) as HTMLInputElement;
    box.checked = true;
    box.setAttribute("aria-label", `Show ${m.file ?? m.label} in the 3D view`);
    box.onchange = () => {
      viewer.setModelVisible(m.label, box.checked);
      markSwitch(m.label, box.checked);
      updateStatus();
    };
    visBox.append(h("label", { class: "model-toggle", title: m.file ?? m.label, "data-model": m.label },
      box, h("span", {}, m.file ?? m.label)));
    switches.set(m.label, box);
  }
  updateStatus();

  // The selection: one state for the 3D view, the parts table and the info card. A part is named by
  // its model and its IFC key - two models can share the same GlobalId, so the GlobalId alone is not
  // enough, and the position is not either (a part can be moved in an exploded view).
  const selection = new Selection(parts);
  const listeners: ((ids: string[]) => void)[] = [];
  selection.onChange((ids) => {
    viewer.setSelectionByModel(selection.byModel());
    for (const fn of listeners) fn(ids);
  });
  viewer.onPick(({ key, model, double, additive }) => {
    if (double) return;
    if (!key || !model) {
      selection.clear();
      return;
    }
    // Clicking an element of another model makes that model the active one, so `page.label` and the clicked key
    // still belong together.
    if (model !== active) setActive(model);
    selection.select(partId(model, key), additive);
  });
  viewer.onHover((key, model) => {
    viewer.setHover(key ? [key] : [], model ?? undefined);
    viewer.canvas.title = key ?? "";
  });
  $("frame").onclick = () => viewer.frame();
  window.addEventListener("keydown", (ev) => {
    if ((ev.target as HTMLElement).closest("input, select, textarea")) return;
    if (ev.key.toLowerCase() === "f") viewer.frame();
    else if (ev.key === "Escape") selection.clear();
  });

  const page: Page = {
    get label() { return active; },
    get summary() { return summaries.get(active)!; },
    get keys() { return keysOf.get(active) ?? []; },
    get models() { return viewer.models(); },
    parts,
    viewer,
    setStatus,
    model: () => fetchModel(active),
    selection,
    onSelect: (fn) => void listeners.push(fn),
    focusSelection: () => viewer.focus(selection.selectedParts().map((p) => ({ model: p.model, key: p.key }))),
    setActiveModel: setActive,
    setModelVisible: (label, visible) => {
      viewer.setModelVisible(label, visible);
      const box = switches.get(label);
      if (box) box.checked = visible;
      markSwitch(label, visible);
      updateStatus();
    },
  };

  // Für die Konsole und die Tests: die Seite ist erreichbar, damit Auswahl, Katalog und 3D-Viewer
  // von außen zu sehen sind (z. B. reuseTwin.selection.list()).
  (window as unknown as { reuseTwin?: Page }).reuseTwin = page;
  return page;
}

export function failed(e: unknown): void {
  void serverUp().then((up) => {
    if (!up) return showOffline();
    setStatus(`Failed to start: ${(e as Error).message}`, true);
    toast((e as Error).message, true);
  });
}
