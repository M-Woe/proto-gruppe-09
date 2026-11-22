// Import page (D21; import itself: D14). A file picker or drag-and-drop uploads the .ifc; the server does all the work
// and this page polls the job and shows its stages. The imported models are listed with a voxel picture of their
// geometry; the chosen one turns in the middle, and opens in the inventory.
import { api, ApiError, serverUp, type ImportJob, type ModelListItem, type ModelSummary } from "./api";
import { arrived, h, toast } from "./dom";
import { showOffline } from "./offline";
import { startRipples } from "./ripples";
import { snapshot, voxelize, VoxelTurntable, type VoxelModel } from "./voxels";

const STAGES: [string, string][] = [
  ["upload", "Upload"],
  ["parse", "Read IFC file"],
  ["elements", "Elements and properties"],
  ["geometry", "3D geometry"],
  ["audit", "Audit"],
  ["write", "Write model"],
];
const LARGE = 50e6;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const mb = (n: number) => (n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} kB` : `${(n / 1e6).toFixed(n < 10e6 ? 1 : 0)} MB`);
const time = (s: number) => (s < 90 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

let models: ModelListItem[] = [];
let shown: string | null = null;
let polling = 0;
const thumbs = new Map<string, string>(); // label → data URL (or "" = no geometry / failed)
const voxels = new Map<string, Promise<VoxelModel | null>>(); // the shown model and the one being pictured
const turntable = new VoxelTurntable($<HTMLCanvasElement>("voxels"));
startRipples($<HTMLCanvasElement>("ripples"), $("stage"));

function setStatus(text: string, error = false): void {
  const s = $("status");
  s.textContent = text;
  s.classList.toggle("error", error);
}

// --- the job card ------------------------------------------------------------------------------------
function job(...children: (Node | null)[]): void {
  const card = $("job");
  card.replaceChildren(...children.filter((c): c is Node => c !== null));
  card.hidden = false;
}

function closeJob(): void {
  $("job").hidden = true;
}

function confirmImport(file: File): void {
  if (!file.name.toLowerCase().endsWith(".ifc")) {
    job(h("h3", {}, "Import IFC"), h("p", { class: "error" }, `${file.name}: only .ifc (STEP) files can be imported.`),
      h("div", { class: "row" }, h("button", { class: "secondary small", onclick: closeJob }, "Close")));
    return;
  }
  const geometry = h("input", { type: "checkbox", checked: true }) as HTMLInputElement;
  const large = file.size > LARGE;
  job(
    h("h3", {}, file.name),
    h("p", { class: "muted" }, mb(file.size)),
    h("label", { class: "check" }, geometry, h("span", {}, "Generate 3D geometry", h("br"),
      h("span", { class: "muted" }, large
        ? "Large model: this can take several minutes and more than 15 GB of memory. Untick for a quick look at elements, properties, materials and the audit (no 3D)."
        : "Untick for a quick look without 3D."))),
    h("div", { class: "row" }, h("button", { class: "secondary small", onclick: closeJob }, "Cancel"),
      h("button", { class: "small", onclick: () => void upload(file, geometry.checked) }, "Import")),
  );
}

async function upload(file: File, geometry: boolean): Promise<void> {
  const meter = h("span", { style: "width:0%" });
  job(h("h3", {}, `Uploading ${file.name}`), h("div", { class: "meter flush" }, meter));
  try {
    track(await api.uploadIfc(file, geometry, (f) => (meter.style.width = `${Math.round(f * 100)}%`)));
  } catch (e) {
    await failed(e);
  }
}

async function failed(e: unknown, title = "Import failed"): Promise<void> {
  if (e instanceof ApiError && (e.status === 0 || e.status >= 500) && !(await serverUp())) return showOffline();
  job(h("h3", {}, title), h("p", { class: "error" }, (e as Error).message),
    h("div", { class: "row" }, h("button", { class: "secondary small", onclick: closeJob }, "Close")));
}

function track(j: ImportJob): void {
  window.clearTimeout(polling);
  renderJob(j);
  if (j.status === "running") {
    polling = window.setTimeout(async () => {
      try {
        track(await api.importJob(j.id));
      } catch (e) {
        await failed(e);
      }
    }, 700);
  } else if (j.status === "done" || j.status === "reused") {
    void loadModels(j.label);
  }
}

function renderJob(j: ImportJob): void {
  const stages = STAGES.filter(([id]) => id !== "geometry" || j.geometry);
  const current = stages.findIndex(([id]) => id === j.stage);
  const list = stages.flatMap(([id, label], i) => {
    const state = j.status === "done" || i < current ? "done" : i === current ? "current" : "pending";
    const known = state === "current" && j.fraction !== null && j.fraction !== undefined;
    return [
      h("li", { class: state }, h("span", {}, state === "done" ? "✓" : state === "current" ? "▸" : ""), label,
        h("span", { class: "muted" }, known ? `${Math.round(j.fraction! * 100)}%` : "")),
      known && id !== "upload" ? h("div", { class: "meter" }, h("span", { style: `width:${j.fraction! * 100}%` })) : null,
    ];
  });
  const title = {
    running: `Importing ${j.filename}`,
    done: `Imported ${j.filename}`,
    reused: `${j.filename} is already imported`,
    failed: `Import failed: ${j.filename}`,
    cancelled: "Import cancelled",
  }[j.status];
  const cancel = async () => {
    try {
      track(await api.cancelImport(j.id));
    } catch (e) {
      await failed(e);
    }
  };
  const open = h("a", { class: "button small", href: `/?model=${encodeURIComponent(j.label)}` }, "Open inventory →");
  job(
    h("h3", {}, title),
    h("p", { class: "muted" }, `${mb(j.size_bytes)} · ${j.geometry ? "with 3D geometry" : "no geometry"} · ${time(j.elapsed_s ?? 0)}`),
    j.message ? h("p", {}, j.message) : null,
    j.status === "running" || j.status === "done" ? h("ul", { class: "stages" }, ...list) : null,
    j.error ? h("p", { class: "error" }, j.error) : null,
    j.status === "done" ? h("p", {}, `${j.n_elements} elements.`) : null,
    h("div", { class: "row" },
      j.status === "running" ? h("button", { class: "secondary small", onclick: () => void cancel() }, "Cancel import") : h("button", { class: "secondary small", onclick: closeJob }, "Close"),
      j.status === "done" || j.status === "reused" ? open : null),
  );
}

// --- drop and pick -----------------------------------------------------------------------------------
function bindDrop(): void {
  const input = $<HTMLInputElement>("import-file");
  const zone = $("dropzone");
  zone.onclick = () => input.click();
  zone.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && input.click();
  input.onchange = () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) confirmImport(file);
  };
  let depth = 0;
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dragging = (on: boolean) => {
    $("drop-overlay").hidden = !on;
    zone.classList.toggle("drag", on);
  };
  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    depth++;
    dragging(true);
  });
  window.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) dragging(false);
  });
  window.addEventListener("dragover", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    dragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) confirmImport(file);
  });
}

// --- the models and the preview ------------------------------------------------------------------------
function voxelsOf(label: string): Promise<VoxelModel | null> {
  let v = voxels.get(label);
  if (!v) {
    v = voxelize(api.glbUrl(label));
    voxels.set(label, v);
  }
  return v;
}

function forget(label: string): void {
  if (label === shown) return;
  void voxels.get(label)?.then((m) => m?.geometry.dispose());
  voxels.delete(label);
}

function renderList(): void {
  $("models-empty").hidden = models.length > 0;
  $("models").replaceChildren(...models.map((m) => {
    const t = thumbs.get(m.label);
    const thumb = t ? h("img", { class: "thumb", src: t, alt: "" }) : h("div", { class: "thumb" }, m.has_glb ? (t === "" ? "no preview" : "") : "no 3D");
    return h("div", {
      class: `model-row${m.label === shown ? " shown" : ""}`, title: "show in the preview · double-click: open the inventory",
      onclick: () => void show(m.label), ondblclick: () => (location.href = `/?model=${encodeURIComponent(m.label)}`),
    }, thumb, h("div", { class: "info" },
      h("div", { class: "name" }, m.file ?? m.label),
      h("div", { class: "meta" }, [m.schema_identifier, m.authoring_application, m.n_elements != null ? `${m.n_elements} elements` : null].filter(Boolean).join(" · "))),
    h("button", {
      class: "row-delete", type: "button", title: "Delete this imported model…", "aria-label": `Delete ${m.file ?? m.label}`,
      onclick: (e: Event) => {
        e.stopPropagation();
        confirmDelete(m);
      },
    }, "×"));
  }));
}

// --- delete ------------------------------------------------------------------------------------------
function confirmDelete(m: ModelListItem): void {
  job(
    h("h3", {}, `Delete ${m.file ?? m.label}?`),
    h("p", {}, `Removes out/${m.label}/ — the imported model, its 3D geometry, audit, saved sessions and sequencer cache — and the copy of the file kept by the import. The original .ifc is not touched; import it again to get the model back.`),
    h("div", { class: "row" }, h("button", { class: "secondary small", onclick: closeJob }, "Cancel"),
      h("button", { class: "small danger", onclick: () => void remove(m) }, "Delete")),
  );
}

async function remove(m: ModelListItem): Promise<void> {
  try {
    await api.deleteModel(m.label);
  } catch (e) {
    return failed(e, "Delete failed");
  }
  closeJob();
  thumbs.delete(m.label);
  if (shown === m.label) showNothing();
  forget(m.label);
  toast(`Deleted ${m.file ?? m.label}`);
  await loadModels();
}

/** Pictures for the list, one model at a time (the shown one first, from its own voxels). */
async function pictureAll(): Promise<void> {
  for (const m of models) {
    if (thumbs.has(m.label)) continue;
    if (!m.has_glb) {
      thumbs.set(m.label, "");
      continue;
    }
    try {
      const v = await voxelsOf(m.label);
      thumbs.set(m.label, v ? snapshot(v, 84, 56) : "");
    } catch {
      thumbs.set(m.label, "");
    }
    forget(m.label);
    renderList();
  }
}

function facts(s: ModelSummary): HTMLElement[] {
  const f = s.findings_by_severity;
  const rows: [string, string][] = [
    ["Schema", s.source.schema_identifier ?? "—"],
    ["Application", s.source.authoring_application ?? "unknown"],
    ["Elements", String(s.n_elements)],
    ["Storeys", String(s.storeys.length)],
    ["3D geometry", s.glb.status],
    ["Audit findings", ["error", "warning", "info"].map((k) => `${f[k] ?? 0} ${k}`).join(" · ")],
  ];
  return [h("div", { class: "model-name" }, s.source.path.split("/").pop() ?? s.label),
    h("dl", { class: "facts" }, ...rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", { title: v }, v)]))];
}

function linkTabs(label: string | null): void {
  const q = label ? `?model=${encodeURIComponent(label)}` : "";
  history.replaceState(null, "", q || location.pathname);
  for (const [id, page] of [["tab-import", "/import.html"], ["tab-inventory", "/"], ["tab-studio", "/studio.html"]])
    $<HTMLAnchorElement>(id).href = `${page}${q}`;
}

/** No model shown (the last one was deleted): the page as it starts. */
function showNothing(): void {
  shown = null;
  linkTabs(null);
  $("open-inventory").hidden = true;
  $("model-facts").replaceChildren(h("p", { class: "left-note" }, "No model yet."));
  $("stage-empty").hidden = false;
  $("stage-caption").hidden = true;
  $("stage-busy").hidden = true;
  turntable.show(null);
}

async function show(label: string): Promise<void> {
  if (label === shown) return;
  const previous = shown;
  shown = label;
  if (previous) forget(previous);
  linkTabs(label);
  const open = $<HTMLAnchorElement>("open-inventory");
  open.href = `/?model=${encodeURIComponent(label)}`;
  open.hidden = false;
  renderList();
  const m = models.find((x) => x.label === label)!;
  $("stage-empty").hidden = true;
  $("stage-caption").hidden = false;
  $("caption-name").textContent = m.file ?? label;
  $("caption-meta").textContent = m.has_glb ? "building the preview…" : "imported without 3D geometry";
  turntable.show(null);
  void api.summary(label).then((s) => {
    if (shown === label) $("model-facts").replaceChildren(...facts(s));
  }).catch((e) => setStatus((e as Error).message, true));
  if (!m.has_glb) return;
  $("stage-busy").hidden = false;
  try {
    const v = await voxelsOf(label);
    if (shown !== label) return;
    turntable.show(v);
    $("caption-meta").textContent = v
      ? `${v.cubes.toLocaleString("en")} cubes of ${Math.round(v.size * 100)} cm · ${[m.schema_identifier, m.n_elements != null ? `${m.n_elements} elements` : null].filter(Boolean).join(" · ")}`
      : "no triangles in the geometry";
    if (v && !thumbs.get(label)) {
      thumbs.set(label, snapshot(v, 84, 56));
      renderList();
    }
  } catch (e) {
    if (shown === label) $("caption-meta").textContent = `preview failed: ${(e as Error).message}`;
  } finally {
    if (shown === label) $("stage-busy").hidden = true;
  }
}

async function loadModels(select?: string): Promise<void> {
  models = await api.models();
  renderList();
  setStatus(`${models.length} imported model${models.length === 1 ? "" : "s"} · out/`);
  const wanted = select ?? new URLSearchParams(location.search).get("model");
  const label = models.find((m) => m.label === wanted)?.label ?? models.find((m) => m.has_glb)?.label ?? models[0]?.label;
  if (select && shown === select) {
    shown = null; // re-imported: show it afresh
    voxels.delete(select);
    thumbs.delete(select);
  }
  if (label) await show(label);
  else showNothing();
  void pictureAll();
}

async function boot(): Promise<void> {
  if (!(await serverUp())) return showOffline();
  bindDrop();
  await arrived();
  await loadModels();
  try {
    const running = (await api.imports()).find((j) => j.status === "running");
    if (running) track(running); // a reload does not lose a running import
  } catch {
    /* no job list: nothing to resume */
  }
}

boot().catch(async (e) => {
  if (!(await serverUp())) return showOffline();
  setStatus(`Failed to start: ${(e as Error).message}`, true);
  toast((e as Error).message, true);
});
