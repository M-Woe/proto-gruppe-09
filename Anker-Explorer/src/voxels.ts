// Voxel previews of a model's geometry.glb on the Import page (D21), after the Sketch2Feedback bridge's preview.js:
// every element's surface is sampled onto a cube grid aligned with the model's origin, only cube faces that touch air
// are drawn, shaded by direction (top bright, sides darker, bottom darkest) with a dark seam on every cube edge, in a
// true isometric view (orthographic, 35.26° down) turning slowly about the model's vertical axis. Colours are the
// GLB's materials (IFC surface styles or IfcOpenShell's default grey). A picture of the geometry, not an inventory:
// nothing here is counted or classified.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SIZES = [0.4, 0.8, 1.6, 3.2]; // cube edge in metres: the smallest that keeps the model within MAX_CELLS per axis
const MAX_CELLS = 400;
const MAX_STEPS = 280; // samples per triangle edge (≈ 40 000 per triangle)
const OFF = 4096; // key packing: ±4096 cubes per axis
const ELEVATION = Math.atan(1 / Math.SQRT2); // true isometric: 35.26°

export interface VoxelModel {
  geometry: THREE.BufferGeometry;
  size: number; // cube edge, m
  cubes: number;
  radius: number; // of the footprint about the vertical axis, m
  height: number; // m
}

const VERTEX = `
varying vec3 vColor; varying vec3 vNormal; varying vec3 vGrid;
void main() {
  vColor = color; vNormal = normal; vGrid = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// one tone per face direction, a dark seam where cubes meet
const FRAGMENT = `
uniform float uSize; uniform vec3 uOrigin;
varying vec3 vColor; varying vec3 vNormal; varying vec3 vGrid;
void main() {
  vec3 n = vNormal;
  float shade = n.y > 0.5 ? 1.0 : n.y < -0.5 ? 0.5 : abs(n.x) > 0.5 ? 0.80 : 0.66;
  vec3 f = fract((vGrid - uOrigin) / uSize);
  vec3 d = min(f, 1.0 - f);
  float edge = abs(n.x) > 0.5 ? min(d.y, d.z) : abs(n.y) > 0.5 ? min(d.x, d.z) : min(d.x, d.y);
  float seam = mix(0.72, 1.0, smoothstep(0.015, 0.06, edge));
  gl_FragColor = vec4(vColor * shade * seam, 1.0);
}`;

// Work in slices of ≈ 20 ms and let a frame render between them (page transitions, the turntable, the dot grid). A
// throttled page may render no frames at all, so a timer goes on without one; a hidden page (no frames, timers
// clamped) goes on with the next task.
let sliceStart = 0;
const channel = new MessageChannel();
async function slice(): Promise<void> {
  if (performance.now() - sliceStart < 20) return;
  await new Promise<void>((r) => {
    if (document.hidden) {
      channel.port1.onmessage = () => r();
      channel.port2.postMessage(0);
      return;
    }
    requestAnimationFrame(() => setTimeout(r));
    setTimeout(r, 50);
  });
  sliceStart = performance.now();
}

/** Load a GLB and turn it into cubes; null when it has no triangles. */
export async function voxelize(url: string): Promise<VoxelModel | null> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  const extent = box.getSize(new THREE.Vector3());
  const size = SIZES.find((s) => Math.max(extent.x, extent.y, extent.z) / s <= MAX_CELLS) ?? SIZES[SIZES.length - 1];

  const cells = new Map<number, number>(); // packed cell index → colour (0xRRGGBB, sRGB)
  const key = (x: number, y: number, z: number) => ((x + OFF) * 8192 + (y + OFF)) * 8192 + (z + OFF);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  sliceStart = performance.now();
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const index = mesh.geometry.getIndex();
    const colour = ((mesh.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(0x999999)).getHex();
    const m = mesh.matrixWorld;
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const ia = index ? index.getX(t) : t, ib = index ? index.getX(t + 1) : t + 1, ic = index ? index.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      const longest = Math.max(ab.length(), ac.length(), b.distanceTo(c));
      const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(longest / (size * 0.5))));
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps - i; j++) {
          p.copy(a).addScaledVector(ab, i / steps).addScaledVector(ac, j / steps);
          const k = key(Math.floor(p.x / size), Math.floor(p.y / size), Math.floor(p.z / size));
          if (!cells.has(k)) cells.set(k, colour);
        }
      }
      await slice();
    }
  }
  if (!cells.size) return null;

  // exposed faces only; the model is moved so its footprint centre is on the vertical axis and its base at y = 0
  const centreX = (box.min.x + box.max.x) / 2, centreZ = (box.min.z + box.max.z) / 2;
  const baseY = Math.floor(box.min.y / size) * size;
  const FACES: [number, number, number, number[][]][] = [
    [1, 0, 0, [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [-1, 0, 0, [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
    [0, 1, 0, [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]], [0, -1, 0, [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]]],
    [0, 0, 1, [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]], [0, 0, -1, [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
  ];
  let faces = 0;
  const exposed: [number, number, number, number, number][] = [];
  let radius = 0;
  let i = 0;
  for (const [k, colour] of cells) {
    if (++i % 4096 === 0) await slice();
    const z = (k % 8192) - OFF, y = (Math.floor(k / 8192) % 8192) - OFF, x = Math.floor(k / 8192 / 8192) - OFF;
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACES[f];
      if (!cells.has(key(x + dx, y + dy, z + dz))) {
        exposed.push([x, y, z, f, colour]);
        faces++;
      }
    }
  }
  const positions = new Float32Array(faces * 12), normals = new Int8Array(faces * 12), colours = new Uint8Array(faces * 12);
  const indices = new Uint32Array(faces * 6);
  exposed.forEach(([x, y, z, f, colour], q) => {
    const [nx, ny, nz, corners] = FACES[f];
    corners.forEach(([cx, cy, cz], v) => {
      const o = (q * 4 + v) * 3;
      positions[o] = (x + cx) * size - centreX;
      positions[o + 1] = (y + cy) * size - baseY;
      positions[o + 2] = (z + cz) * size - centreZ;
      radius = Math.max(radius, Math.hypot(positions[o], positions[o + 2]));
      normals[o] = nx * 127; normals[o + 1] = ny * 127; normals[o + 2] = nz * 127;
      colours[o] = (colour >> 16) & 255; colours[o + 1] = (colour >> 8) & 255; colours[o + 2] = colour & 255;
    });
    indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3, true));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3, true));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const height = (Math.floor(box.max.y / size) + 1) * size - baseY;
  return { geometry, size, cubes: cells.size, radius, height };
}

function voxelMesh(model: VoxelModel): THREE.Mesh {
  // the seams follow the world grid: its origin, moved like the cubes, in the model's frame
  const origin = new THREE.Vector3(...[0, 1, 2].map((a) => {
    const v = model.geometry.attributes.position.array[a] as number;
    return v - Math.floor(v / model.size) * model.size;
  }));
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, vertexColors: true,
    uniforms: { uSize: { value: model.size }, uOrigin: { value: origin } },
  });
  return new THREE.Mesh(model.geometry, material);
}

/** An orthographic isometric camera that keeps a footprint of ``radius`` and ``height`` in frame at every angle. */
function fit(camera: THREE.OrthographicCamera, model: VoxelModel, aspect: number, margin = 1.12): void {
  const halfW0 = model.radius * margin;
  const halfH0 = ((model.height * Math.cos(ELEVATION) + 2 * model.radius * Math.sin(ELEVATION)) / 2) * margin;
  const [halfW, halfH] = halfW0 / halfH0 > aspect ? [halfW0, halfW0 / aspect] : [halfH0 * aspect, halfH0];
  const d = (model.radius + model.height) * 4 + 10;
  camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
  camera.near = 0.1; camera.far = d * 2;
  camera.position.set(Math.cos(ELEVATION) * d * Math.SQRT1_2, model.height / 2 + Math.sin(ELEVATION) * d, Math.cos(ELEVATION) * d * Math.SQRT1_2);
  camera.lookAt(0, model.height / 2, 0);
  camera.updateProjectionMatrix();
}

/** The large view: one model turning; still with "reduce motion". */
export class VoxelTurntable {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera();
  private mesh: THREE.Mesh | null = null;
  private model: VoxelModel | null = null;
  private still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private start = performance.now();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    new ResizeObserver(() => this.resize()).observe(canvas);
    requestAnimationFrame(this.loop);
  }

  show(model: VoxelModel | null): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      (this.mesh.material as THREE.Material).dispose();
    }
    this.model = model;
    this.mesh = model ? voxelMesh(model) : null;
    if (this.mesh) this.scene.add(this.mesh);
    this.start = performance.now();
    this.resize();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    if (this.model) fit(this.camera, this.model, w / h);
    this.draw();
  }

  private draw(): void {
    if (this.mesh) this.mesh.rotation.y = this.still ? Math.PI / 8 : ((performance.now() - this.start) / 1000) * ((2 * Math.PI) / 60);
    this.renderer.render(this.scene, this.camera);
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    if (this.mesh && !this.still && !document.hidden) this.draw();
  };
}

let shared: THREE.WebGLRenderer | null = null;
/** A still isometric picture of the model (for the list), as a data URL. */
export function snapshot(model: VoxelModel, width: number, height: number): string {
  shared ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  shared.setClearColor(0x000000, 0);
  shared.setPixelRatio(1);
  const dpr = Math.min(window.devicePixelRatio, 2);
  shared.setSize(width * dpr, height * dpr, false);
  const scene = new THREE.Scene();
  const mesh = voxelMesh(model);
  mesh.rotation.y = Math.PI / 8;
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera();
  fit(camera, model, width / height, 1.05);
  shared.render(scene, camera);
  (mesh.material as THREE.Material).dispose();
  return shared.domElement.toDataURL("image/png");
}
