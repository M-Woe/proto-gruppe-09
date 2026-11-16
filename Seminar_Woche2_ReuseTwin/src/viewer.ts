// 3D view: renders the backend GLB and applies what the view state says (membership, colours, selection, and in
// the sorted arrangement the per-element matrices). It never decides membership, colours or placement itself —
// callers pass what the backend computed.
// Several models can live in the same scene at once: each is loaded once into its own group (its own coordinates,
// its own view state) and is switched on and off by visibility, never by loading it again.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type DisplayMode = "isolate" | "ghost" | "all";

/** A box in world space, as three numbers for the minimum and three for the maximum. */
export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface Label {
  el: HTMLElement; // positioned by the viewer; created and owned by the caller
  at: [number, number, number]; // scene (glTF) point at the label's bottom-left corner
}

export interface PickEvent {
  key: string | null;
  double: boolean;
  /** The model the picked element belongs to (null: the click hit nothing). */
  model: string | null;
  /** True when the click carried Ctrl or Cmd: the selection is added to instead of replaced. */
  additive: boolean;
}

/** One model in the 3D view. */
export interface ModelInfo {
  label: string;
  /** Element keys drawn in 3D for this model. */
  keys: string[];
  visible: boolean;
}

/** A model in the scene: its own group (its own coordinates), its elements and its own view state. */
interface ModelState {
  label: string;
  group: THREE.Group;
  elements: Map<string, Element3D>;
  visible: boolean;
  members: Set<string>;
  mode: DisplayMode;
  colorOf: (key: string) => THREE.Color | null;
  /** The centre of the model as it was loaded — the frame the core wrote it in. */
  centre: THREE.Vector3;
}

interface Element3D {
  meshes: THREE.Mesh[];
  source: THREE.Material[]; // source style per mesh (IFC surface style or IfcOpenShell default)
}

const GHOST_OPACITY = 0.07;
const STILL = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FLY_MS = 480; // camera moves to a framed set (eased); instant with "reduce motion"
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Flight {
  from: [THREE.Vector3, THREE.Vector3]; // camera position, target
  to: [THREE.Vector3, THREE.Vector3];
  clip: [number, number]; // near, far at the end of the move
  t0: number;
}
const SELECT = new THREE.Color("#ff7a00");
const HOVER = new THREE.Color("#ffd23f");

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 5000);
  readonly controls: OrbitControls;
  private states = new Map<string, ModelState>(); // every loaded model, by label
  private active: string | null = null; // the model the panels talk about
  private pickables: THREE.Mesh[] = [];
  private materials = new Map<string, THREE.Material>();
  private raycaster = new THREE.Raycaster();
  private dirty = true;
  private stale = true; // membership / colours / highlight changed: materials are set once, before the next frame
  private flight: Flight | null = null;
  private pickHandlers: ((e: PickEvent) => void)[] = [];
  private hoverHandlers: ((key: string | null, model: string | null) => void)[] = [];
  // The selection and the hover belong to a model, because two models can share an element key. The
  // selection is a map so that a selection can span several models at once.
  private selection = new Map<string, Set<string>>();
  private hover = new Set<string>();
  private hoverModel: string | null = null;
  private lastColors: ((key: string) => THREE.Color | null) | null = null;
  private lastFrameMs = 0;
  private labels: { el: HTMLElement; at: THREE.Vector3; w: number; h: number }[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    // transparent: the page's dot grid shows behind the model
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.6, 1, 0.4);
    this.scene.add(sun);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !STILL; // a little inertia after a drag
    this.controls.dampingFactor = 0.14;
    this.controls.addEventListener("change", () => this.invalidate());
    this.controls.addEventListener("start", () => (this.flight = null)); // a drag takes over from a camera move
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.bindPointer();
    this.loop();
  }

  /** Load a GLB written by reuse-twin as the model `label`; returns the element keys it contains (node extras.key).
   *  The model is added to the scene unchanged, so it keeps the coordinates the core computed for it — models of the
   *  same building therefore stay where they belong. */
  async load(url: string, label: string): Promise<string[]> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const elements = new Map<string, Element3D>();
    for (const node of gltf.scene.children) {
      const key = node.userData.key as string | undefined;
      if (!key) continue;
      const meshes: THREE.Mesh[] = [];
      node.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
      });
      const source = meshes.map((m) => this.sourceMaterial(m.material as THREE.MeshStandardMaterial));
      for (const m of meshes) {
        m.userData.key = key;
        m.userData.model = label;
        m.matrixAutoUpdate = false;
        m.userData.home = m.matrix.clone(); // in-place matrix from the GLB
      }
      elements.set(key, { meshes, source });
    }
    gltf.scene.updateMatrixWorld(true);
    const group = new THREE.Group();
    group.name = label;
    group.add(gltf.scene);
    this.scene.add(group);
    this.scene.updateMatrixWorld(true);
    // The centre of the model as the core wrote it: the frame its coordinates are in.
    const box = new THREE.Box3();
    for (const el of elements.values()) for (const mesh of el.meshes) box.expandByObject(mesh);
    const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    this.states.set(label, {
      label, group, elements, visible: true, centre,
      members: new Set(elements.keys()), mode: "all", colorOf: () => null,
    });
    if (!this.active) this.active = label;
    this.apply();
    return [...elements.keys()];
  }

  /** The centre of a model as it was loaded, before any placement offset. */
  loadedCentre(label: string): THREE.Vector3 | null {
    return this.states.get(label)?.centre ?? null;
  }

  /** Places a model in the scene (metres): the geometry is not touched, only the group moves.
   *  Used to bring models that share a world coordinate system onto each other. */
  setModelOffset(label: string, offset: [number, number, number]): void {
    const st = this.states.get(label);
    if (!st) return;
    st.group.position.set(offset[0], offset[1], offset[2]);
    this.scene.updateMatrixWorld(true);
    this.invalidate();
  }

  has(key: string): boolean {
    return this.ownerOf(key) !== null;
  }

  /** The models in the view. */
  models(): ModelInfo[] {
    return [...this.states.values()].map((s) => ({
      label: s.label, keys: [...s.elements.keys()], visible: s.visible,
    }));
  }

  /** The model the panels talk about (its elements are picked, coloured and framed). */
  activeModel(): string | null {
    return this.active;
  }

  setActiveModel(label: string): void {
    if (!this.states.has(label)) return;
    this.active = label;
    const st = this.states.get(label)!;
    if (this.lastColors) st.colorOf = this.lastColors; // the colours follow the active model
    this.apply();
  }

  /** Shows or hides a model. The geometry stays loaded; only its visibility changes. */
  setModelVisible(label: string, visible: boolean): void {
    const st = this.states.get(label);
    if (!st || st.visible === visible) return;
    st.visible = visible;
    st.group.visible = visible;
    this.apply();
  }

  isModelVisible(label: string): boolean {
    return this.states.get(label)?.visible ?? false;
  }

  /** The model an element key belongs to: the given one, else the active one, else whoever has the key. */
  private ownerOf(key: string, preferred?: string): string | null {
    if (preferred && this.states.get(preferred)?.elements.has(key)) return preferred;
    if (this.active && this.states.get(this.active)?.elements.has(key)) return this.active;
    for (const s of this.states.values()) if (s.elements.has(key)) return s.label;
    return null;
  }

  /** The model a view-state call applies to: the given one, else the active one. */
  private state(model?: string): ModelState | null {
    const label = model ?? this.active;
    return label ? this.states.get(label) ?? null : null;
  }

  /** Members of the current set and how non-members are shown (of the active model, or of `model`). */
  setDisplay(members: Iterable<string>, mode: DisplayMode, model?: string): void {
    const st = this.state(model);
    if (!st) return;
    st.members = new Set(members);
    st.mode = mode;
    this.apply();
  }

  /** Sorted arrangement: per element a matrix (GLB → layout, column-major) from the backend; null = in place. */
  /**
   * The arrangement of the 3D view: per model, per element a matrix in world space (column-major).
   * null = the elements stand where the file puts them.
   *
   * The matrices are only for the picture. The home matrix of every element - the one the GLB was
   * loaded with - stays untouched, so putting the arrangement back to null restores the original
   * IFC positions exactly, to the last bit.
   */
  setArrangement(arrangements: Map<string, Map<string, number[]>> | null): void {
    this.scene.updateMatrixWorld(true);
    const t = new THREE.Matrix4();
    for (const st of this.states.values()) {
      const perModel = arrangements?.get(st.label);
      for (const [key, el] of st.elements) {
        const m = perModel?.get(key);
        for (const mesh of el.meshes) {
          const home = mesh.userData.home as THREE.Matrix4;
          if (!m) mesh.matrix.copy(home);
          else {
            // world = T * (parent * home)  ->  local = parent^-1 * T * parent * home
            const parent = mesh.parent ? mesh.parent.matrixWorld : new THREE.Matrix4();
            t.fromArray(m);
            mesh.matrix.copy(parent).invert().multiply(t).multiply(parent).multiply(home);
          }
        }
      }
    }
    this.scene.updateMatrixWorld(true);
    this.invalidate();
  }

  /**
   * The world box of every element: model -> element key -> box. The boxes are in the scene, so they
   * include the offset that brings two models of one building onto each other. The explosion uses
   * them to find the groups and the distances between them; the IFC coordinates themselves are not
   * touched by it.
   */
  elementBounds(): Map<string, Map<string, Bounds>> {
    this.scene.updateMatrixWorld(true);
    const out = new Map<string, Map<string, Bounds>>();
    for (const st of this.states.values()) {
      const perModel = new Map<string, Bounds>();
      for (const [key, el] of st.elements) {
        const box = new THREE.Box3();
        for (const mesh of el.meshes) box.expandByObject(mesh);
        if (box.isEmpty()) continue;
        perModel.set(key, {
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
        });
      }
      out.set(st.label, perModel);
    }
    return out;
  }

  /**
   * Wie viele Bauteile je Modell gerade zu sehen sind (nach der Sichtbarkeitseinstellung). */
  visibleCount(): { model: string; shown: number; total: number }[] {
    return [...this.states.values()].map((st) => ({
      model: st.label,
      total: st.elements.size,
      shown: st.mode === "isolate" ? [...st.members].filter((k) => st.elements.has(k)).length : st.elements.size,
    }));
  }

  /** HTML labels pinned to scene points; overlapping ones are hidden (earlier labels win). */
  setLabels(labels: Label[]): void {
    for (const l of this.labels) l.el.remove();
    const box = this.canvas.parentElement!;
    this.labels = labels.map((l) => {
      box.append(l.el);
      return { el: l.el, at: new THREE.Vector3(...l.at), w: l.el.offsetWidth, h: l.el.offsetHeight };
    });
    this.invalidate();
  }

  /** Colour per element; null means "source style" (the GLB material). The last function given is kept, so it also
   *  applies to a model that becomes active later. */
  setColors(colorOf: (key: string) => THREE.Color | null, model?: string): void {
    this.lastColors = colorOf;
    const st = this.state(model);
    if (!st) return;
    st.colorOf = colorOf;
    this.apply();
  }

  /** The selected elements (of the active model, or of `model`). */
  setSelection(keys: Iterable<string>, model?: string): void {
    const m = model ?? this.active;
    this.selection = new Map();
    if (m) this.selection.set(m, new Set(keys));
    this.apply();
  }

  /** The selected elements, per model — for a selection that spans several models. */
  setSelectionByModel(selections: Map<string, Iterable<string>>): void {
    this.selection = new Map();
    for (const [model, keys] of selections) this.selection.set(model, new Set(keys));
    this.apply();
  }

  /** The current selection, per model. */
  selectedByModel(): Map<string, string[]> {
    return new Map([...this.selection].map(([model, keys]) => [model, [...keys]]));
  }

  /** Transient highlight (hover over 3D or a chart bar); not part of the view state. */
  setHover(keys: Iterable<string>, model?: string): void {
    this.hover = new Set(keys);
    this.hoverModel = model ?? this.active;
    this.apply();
  }

  /** Fit the camera to the given elements (default: the members of every visible model); ``from`` = view direction
   *  (default: keep). The camera eases there unless ``fly`` is false or motion is reduced. */
  frame(keys?: Iterable<string>, from?: [number, number, number], fly = true): void {
    const box = new THREE.Box3();
    if (keys) {
      for (const k of keys) {
        const owner = this.ownerOf(k);
        if (!owner) continue;
        for (const m of this.states.get(owner)?.elements.get(k)?.meshes ?? []) box.expandByObject(m);
      }
    } else {
      for (const st of this.states.values()) {
        if (!st.visible) continue;
        for (const k of st.members) for (const m of st.elements.get(k)?.meshes ?? []) box.expandByObject(m);
      }
    }
    this.flyTo(box, from, fly);
  }

  /**
   * Fits the camera to the given elements, each with the model it belongs to. The model is named
   * explicitly, because two models can share an element key. The box is taken from where the
   * element stands right now - so a part that was moved (in an exploded view) is framed where it
   * is, not where it was.
   */
  focus(entries: { model: string; key: string }[], fly = true): void {
    const box = new THREE.Box3();
    for (const e of entries) {
      for (const m of this.states.get(e.model)?.elements.get(e.key)?.meshes ?? []) box.expandByObject(m);
    }
    this.flyTo(box, undefined, fly);
  }

  /** Moves the camera to a box: its centre in view, far enough that the box fits. */
  private flyTo(box: THREE.Box3, from: [number, number, number] | undefined, fly: boolean): void {
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.5);
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dir = from ? new THREE.Vector3(...from).normalize() : this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.lengthSq() === 0 || !Number.isFinite(dir.x)) dir.set(1, 0.8, 1).normalize();
    const position = centre.clone().addScaledVector(dir, dist);
    const clip: [number, number] = [Math.max(dist / 1000, 0.01), dist * 20];
    if (fly && !STILL) {
      this.camera.near = Math.min(this.camera.near, clip[0]); // nothing is clipped on the way
      this.camera.far = Math.max(this.camera.far, clip[1]);
      this.flight = { from: [this.camera.position.clone(), this.controls.target.clone()], to: [position, centre], clip, t0: performance.now() };
    } else {
      this.flight = null;
      [this.camera.near, this.camera.far] = clip;
      this.controls.target.copy(centre);
      this.camera.position.copy(position);
      this.controls.update();
    }
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  onPick(handler: (e: PickEvent) => void): void {
    this.pickHandlers.push(handler);
  }

  onHover(handler: (key: string | null, model: string | null) => void): void {
    this.hoverHandlers.push(handler);
  }

  stats(): { elements: number; drawCalls: number; triangles: number; frameMs: number } {
    const r = this.renderer.info.render;
    const elements = [...this.states.values()].reduce((n, s) => n + s.elements.size, 0);
    return { elements, drawCalls: r.calls, triangles: r.triangles, frameMs: this.lastFrameMs };
  }

  invalidate(): void {
    this.dirty = true;
  }

  private sourceMaterial(m: THREE.MeshStandardMaterial): THREE.Material {
    const transparent = m.opacity < 1;
    return this.material(`src|${m.color.getHexString()}|${m.opacity.toFixed(3)}`, () =>
      new THREE.MeshLambertMaterial({
        color: m.color.clone(), flatShading: true, side: THREE.DoubleSide,
        transparent, opacity: m.opacity, depthWrite: !transparent,
      }));
  }

  private material(id: string, make: () => THREE.Material): THREE.Material {
    let m = this.materials.get(id);
    if (!m) {
      m = make();
      this.materials.set(id, m);
    }
    return m;
  }

  private solid(color: THREE.Color): THREE.Material {
    return this.material(`c|${color.getHexString()}`, () =>
      new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide }));
  }

  private ghost(): THREE.Material {
    return this.material("ghost", () =>
      new THREE.MeshLambertMaterial({ color: 0x9aa3ad, transparent: true, opacity: GHOST_OPACITY, depthWrite: false }));
  }

  /** Materials and visibility follow at the next frame: several changes within one frame cost one pass. */
  private apply(): void {
    this.stale = true;
    this.invalidate();
  }

  private applyNow(): void {
    this.stale = false;
    this.pickables = [];
    for (const st of this.states.values()) {
      for (const [key, el] of st.elements) {
        const member = st.members.has(key);
        const visible = st.visible && (member || st.mode !== "isolate");
        const ghosted = !member && st.mode === "ghost";
        const selected = this.selection.get(st.label)?.has(key) ?? false;
        const hovered = st.label === this.hoverModel && this.hover.has(key);
        const highlight = selected ? SELECT : hovered ? HOVER : null;
        const colour = member ? st.colorOf(key) : null;
        el.meshes.forEach((mesh, i) => {
          mesh.visible = visible;
          if (!visible) return;
          mesh.material = highlight ? this.solid(highlight) : ghosted ? this.ghost() : colour ? this.solid(colour) : el.source[i];
          mesh.renderOrder = ghosted ? 1 : 0;
          if (!ghosted) this.pickables.push(mesh);
        });
      }
    }
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (performance.now() - f.t0) / FLY_MS), k = easeInOut(t);
      this.camera.position.lerpVectors(f.from[0], f.to[0], k);
      this.controls.target.lerpVectors(f.from[1], f.to[1], k);
      if (t === 1) {
        [this.camera.near, this.camera.far] = f.clip;
        this.camera.updateProjectionMatrix();
        this.flight = null;
      }
      this.dirty = true;
    }
    this.controls.update(); // damping: keeps moving a little after a drag ("change" marks the frame dirty)
    if (this.stale) this.applyNow();
    if (!this.dirty) return;
    this.dirty = false;
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.lastFrameMs = performance.now() - t0;
    if (this.labels.length) this.placeLabels();
  };

  private placeLabels(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    const taken: [number, number, number, number][] = [];
    for (const l of this.labels) {
      v.copy(l.at).project(this.camera);
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h - l.h;
      const free = v.z < 1 && x + l.w > 0 && x < w && y + l.h > 0 && y < h &&
        !taken.some(([a, b, c, d]) => x < c && a < x + l.w && y < d && b < y + l.h);
      l.el.style.visibility = free ? "visible" : "hidden";
      if (!free) continue;
      l.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      taken.push([x, y, x + l.w, y + l.h]);
    }
  }

  /** The element under the pointer: its key and the model it belongs to. */
  private keyAt(ev: PointerEvent | MouseEvent): { key: string | null; model: string | null } {
    if (this.stale) this.applyNow(); // pick what is shown now, not before the last change
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return {
      key: (hit?.object.userData.key as string | undefined) ?? null,
      model: (hit?.object.userData.model as string | undefined) ?? null,
    };
  }

  private bindPointer(): void {
    let down: { x: number; y: number } | null = null;
    let lastHover: { key: string | null; model: string | null } = { key: null, model: null };
    this.canvas.addEventListener("pointerdown", (ev) => (down = { x: ev.clientX, y: ev.clientY }));
    this.canvas.addEventListener("pointerup", (ev) => {
      const moved = down ? Math.hypot(ev.clientX - down.x, ev.clientY - down.y) : 99;
      down = null;
      if (moved > 4 || ev.button !== 0) return; // orbit/pan, not a click
      const { key, model } = this.keyAt(ev);
      this.pickHandlers.forEach((h) => h({ key, model, double: false, additive: ev.ctrlKey || ev.metaKey }));
    });
    this.canvas.addEventListener("dblclick", (ev) => {
      const { key, model } = this.keyAt(ev);
      if (key) this.pickHandlers.forEach((h) => h({ key, model, double: true, additive: false }));
    });
    this.canvas.addEventListener("pointermove", (ev) => {
      if (down || ev.buttons) return;
      const { key, model } = this.keyAt(ev);
      if (key === lastHover.key && model === lastHover.model) return;
      lastHover = { key, model };
      this.hoverHandlers.forEach((h) => h(key, model));
    });
  }
}
