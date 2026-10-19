import * as THREE from "three";
import { OrbitControls } from "/static/vendor/OrbitControls.js";

const $ = (s) => document.querySelector(s);
const fmt = (v, d = 2) => (v == null ? "–" : Number(v).toLocaleString("de-AT", { minimumFractionDigits: d, maximumFractionDigits: d }));
// 16 gut unterscheidbare Farben, bewusst ohne Gelb (Gelb = Auswahl)
const PALETTE = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#6a3d9a", "#ff9da7", "#9c755f",
                 "#7f7f7f", "#1b9e77", "#17becf", "#8c6d31", "#a6cee3", "#d62ca0", "#1f3a93", "#b2df8a"];
const SEL_COLOR = new THREE.Color("#ffd000");
const SEC_COLOR = new THREE.Color("#ffe98a");

const state = { members: new Map(), objects: new Map(), rows: new Map(), selected: null, section: null, material: null,
                colors: {}, matColors: {}, materials: [], sectionInfo: {}, colorMode: "material" };
const STATUS_TXT = { ok: "plausibel", info: "Hinweis", warn: "Warnung", fail: "Widerspruch" };
const colorOf = (m) => (state.colorMode === "material" && m.material ? state.matColors[m.material] : state.colors[m.section]);
const isDimmed = (m) => (state.section && m.section !== state.section) || (state.material && m.material !== state.material);

// ---------- 3D-Szene ----------
const viewer = $("#viewer");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
viewer.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#f7f9fc");
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
camera.up.set(0, 0, 1); // Rhino: Z nach oben
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-10, -20, 30);
scene.add(sun);
const grid = new THREE.GridHelper(40, 40, 0x9aa5b5, 0xd5dbe5);
grid.rotation.x = Math.PI / 2;
scene.add(grid);
const group = new THREE.Group();
scene.add(group);

function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewer);

function fitView() {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const d = r / Math.sin((camera.fov * Math.PI) / 360);
  camera.position.set(c.x - d * 0.55, c.y - d * 0.75, c.z + d * 0.55);
  controls.target.copy(c);
  controls.update();
}

function buildObject(id, geo) {
  const mat = new THREE.MeshStandardMaterial({ color: colorOf(state.members.get(id)), roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  let obj;
  if (geo.mesh) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(geo.mesh.p, 3));
    g.setIndex(geo.mesh.i);
    g.computeVertexNormals();
    obj = new THREE.Mesh(g, mat);
  } else {
    // Zugstab (nur Achslinie): duenner Zylinder, nur zur Darstellung ueberhoeht
    const [x0, y0, z0, x1, y1, z1] = geo.line;
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(0.02, 0.02, len, 6);
    obj = new THREE.Mesh(g, mat);
    obj.position.copy(a).add(b).multiplyScalar(0.5);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }
  obj.userData.id = id;
  return obj;
}

function paint() {
  for (const [id, obj] of state.objects) {
    const m = state.members.get(id);
    let color = new THREE.Color(colorOf(m));
    if (state.section && m.section === state.section) color = SEC_COLOR;
    if (id === state.selected) color = SEL_COLOR;
    obj.material.color.copy(color);
    obj.material.emissive.set(id === state.selected ? 0x553f00 : 0x000000);
    const dimmed = state.selected != null ? id !== state.selected : isDimmed(m);
    obj.material.opacity = dimmed ? (state.selected != null ? 0.45 : 0.25) : 1;
    obj.material.transparent = obj.material.opacity < 1;
  }
  document.querySelectorAll("#tbl-members tr.sel").forEach((r) => r.classList.remove("sel"));
  document.querySelectorAll("#tbl-sections tr.sec-active").forEach((r) => r.classList.remove("sec-active"));
  document.querySelectorAll(".mat-card.active").forEach((r) => r.classList.remove("active"));
  const sectionOfSel = state.selected != null ? state.members.get(state.selected).section : state.section;
  if (sectionOfSel) document.querySelector(`#tbl-sections tr[data-sec="${CSS.escape(sectionOfSel)}"]`)?.classList.add("sec-active");
  const matOfSel = state.selected != null ? state.members.get(state.selected).material : state.material;
  if (matOfSel) document.querySelector(`.mat-card[data-mat="${CSS.escape(matOfSel)}"]`)?.classList.add("active");
  showMaterialCheck(sectionOfSel);
  const row = state.selected != null ? state.rows.get(state.selected) : null;
  if (row) {
    row.classList.add("sel");
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  showDetail();
}

function showDetail() {
  const el = $("#detail");
  if (state.selected == null) { el.textContent = ""; return; }
  const m = state.members.get(state.selected);
  el.innerHTML = `<b>Stab ${m.id}</b> · ${m.section}${m.section_end ? " → " + m.section_end : ""} · L = ${fmt(m.length_m, 3)} m · V = ${fmt(m.volume_m3, 5)} m³` +
    ` · <b>${m.material ?? "kein Material"}</b>${m.mass_kg != null ? ` · ${fmt(m.mass_kg, 1)} kg` : ""}` +
    (m.material_model ? ` · Modell: ${m.material_model}` : "") +
    (m.note ? `<br><i>${m.note}</i>` : "");
}

// ---------- Materialbereich ----------
function buildMaterialCards() {
  const box = $("#mat-cards");
  for (const r of state.materials) {
    const used = r.count > 0;
    const card = document.createElement("div");
    card.className = "mat-card" + (used ? "" : " unused");
    card.dataset.mat = r.name;
    card.style.borderLeftColor = r.color;
    card.title = used ? r.sections.map((s) => `${s.name} (${s.count})`).join("\n") : (r.unused_reason || "");
    card.innerHTML = `<b>${r.name}</b>${used ? `<span class="badge ${r.status}">${STATUS_TXT[r.status]}</span>` : ""}` +
      `<div class="sub">${r.label} · ${fmt(r.density_kg_m3, 0)} kg/m³</div>` +
      (used
        ? `<div class="nums">${r.count} Stäbe · ${fmt(r.volume_m3, 3)} m³ · ${fmt(r.mass_kg, 0)} kg</div>`
        : `<div class="sub">nicht verwendet: ${r.unused_reason ?? ""}</div>`);
    if (used) card.addEventListener("click", () => setMaterial(r.name));
    box.appendChild(card);
  }
}

function showMaterialCheck(sectionName) {
  const el = $("#mat-check");
  const s = sectionName ? state.sectionInfo[sectionName] : null;
  if (!s) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="why"><b>${s.name}</b> → <b>${s.material ?? "–"}</b> (Sicherheit: ${s.material_confidence}) – ${s.material_reason}</div>` +
    s.material_checks.map((c) => `<div class="chk ${c.level}"><b>${STATUS_TXT[c.level]}:</b> ${c.text}</div>`).join("");
}

function setMaterial(name) {
  state.material = state.material === name ? null : name;
  state.section = null;
  state.selected = null;
  applyFilter();
  paint();
}

function setColorMode(mode) {
  state.colorMode = mode;
  for (const [id, obj] of state.objects) obj.material.color.set(colorOf(state.members.get(id)));
  document.querySelectorAll("#tbl-sections tbody tr[data-sec] .swatch").forEach((sw) => {
    const s = state.sectionInfo[sw.closest("tr").dataset.sec];
    sw.style.background = mode === "material" && s.material ? state.matColors[s.material] : state.colors[s.name];
  });
  paint();
}

function select(id, { fromTable = false } = {}) {
  state.selected = id;
  paint();
  if (fromTable && id != null) {
    const box = new THREE.Box3().setFromObject(state.objects.get(id));
    controls.target.copy(box.getCenter(new THREE.Vector3()));
  }
}

function setSection(name) {
  state.section = state.section === name ? null : name;
  state.material = null;
  state.selected = null;
  applyFilter();
  paint();
}

// ---------- Klick im 3D-Modell ----------
const ray = new THREE.Raycaster();
let down = null;
renderer.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.intersectObjects([...state.objects.values()], false)[0];
  select(hit ? hit.object.userData.id : null);
});

// ---------- Tabellen ----------
function buildSectionTable(sections) {
  const tb = $("#tbl-sections tbody");
  let n = 0, len = 0, vol = 0;
  for (const s of sections) {
    n += s.count; len += s.length_m; vol += s.volume_m3;
    const tr = document.createElement("tr");
    tr.dataset.sec = s.name;
    tr.title = s.volume_source === "berechnet" ? "Volumen berechnet (A × L), nur Achslinien im Modell" : "";
    tr.title = (tr.title ? tr.title + "\n" : "") + `${s.material ?? "kein Material"} (${s.material_confidence}): ${s.material_reason}`;
    const mc = s.material ? state.matColors[s.material] : "#ccc";
    tr.innerHTML = `<td><span class="swatch" style="background:${state.colorMode === "material" ? mc : state.colors[s.name]}"></span></td><td>${s.name}</td>` +
      `<td><span class="matdot" style="background:${mc}"></span>${s.material ?? "–"}<span class="badge ${s.material_status}">${STATUS_TXT[s.material_status]}</span></td>` +
      `<td class="num">${s.count}</td><td class="num">${fmt(s.area_nom_mm2, 1)}</td>` +
      `<td class="num">${fmt(s.length_m, 2)}</td><td class="num">${fmt(s.volume_m3, 4)}</td>`;
    tr.addEventListener("click", () => setSection(s.name));
    tb.appendChild(tr);
  }
  const tot = document.createElement("tr");
  tot.className = "sec-total";
  tot.innerHTML = `<td></td><td>Summe</td><td></td><td class="num">${n}</td><td></td><td class="num">${fmt(len, 2)}</td><td class="num">${fmt(vol, 4)}</td>`;
  tb.appendChild(tot);
}

function buildMemberTable(members) {
  const tb = $("#tbl-members tbody");
  for (const m of members) {
    const tr = document.createElement("tr");
    tr.dataset.id = m.id;
    tr.title = m.note || "";
    tr.title = [m.note, m.material ? `${m.material}: ${m.material_reason}` : ""].filter(Boolean).join("\n");
    tr.innerHTML = `<td class="num">${m.id}</td><td>${m.section}${m.section_end ? " → " + m.section_end : ""}</td>` +
      `<td><span class="matdot" style="background:${m.material ? state.matColors[m.material] : "#ccc"}"></span>${m.material ?? "–"}</td>` +
      `<td class="num">${fmt(m.length_m, 3)}</td><td class="num">${fmt(m.area_nom_mm2, 1)}</td>` +
      `<td class="num">${fmt(m.area_mean_mm2, 1)}</td><td class="num">${fmt(m.volume_m3, 5)}</td><td>${m.volume_source}</td>`;
    tr.addEventListener("click", () => select(state.selected === m.id ? null : m.id, { fromTable: true }));
    tb.appendChild(tr);
    state.rows.set(m.id, tr);
  }
}

function applyFilter() {
  const q = $("#filter").value.trim().toLowerCase();
  let shown = 0;
  for (const [id, tr] of state.rows) {
    const m = state.members.get(id);
    const ok = (!q || String(id) === q || m.section.toLowerCase().includes(q) || (m.material || "").toLowerCase().includes(q)) &&
      (!state.section || m.section === state.section) && (!state.material || m.material === state.material);
    tr.style.display = ok ? "" : "none";
    if (ok) shown++;
  }
  $("#member-count").textContent = `(${shown} von ${state.members.size})`;
}

// ---------- Start ----------
async function init() {
  const [tab, geo] = await Promise.all([
    fetch("/api/members").then((r) => r.json()),
    fetch("/api/geometry").then((r) => r.json()),
  ]);
  tab.sections.forEach((s, i) => { state.colors[s.name] = PALETTE[i % PALETTE.length]; state.sectionInfo[s.name] = s; });
  tab.materials.forEach((r) => (state.matColors[r.name] = r.color));
  state.materials = tab.materials;
  tab.members.forEach((m) => state.members.set(m.id, m));
  buildMaterialCards();
  buildSectionTable(tab.sections);
  buildMemberTable(tab.members);
  for (const m of tab.members) {
    const obj = buildObject(m.id, geo[String(m.id)]);
    state.objects.set(m.id, obj);
    group.add(obj);
  }
  applyFilter();
  resize();
  fitView();
  $("#status").textContent = `${tab.member_count} Stäbe · ${tab.source}`;
  const pre = Number(new URLSearchParams(location.search).get("select")); // z. B. /?select=84
  if (pre && state.members.has(pre)) select(pre, { fromTable: true });
}

$("#filter").addEventListener("input", applyFilter);
$("#btn-fit").addEventListener("click", fitView);
$("#btn-clear").addEventListener("click", () => { state.section = null; state.material = null; state.selected = null; applyFilter(); paint(); });
document.querySelectorAll('input[name="cm"]').forEach((r) => r.addEventListener("change", (e) => setColorMode(e.target.value)));

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
init().catch((e) => { $("#status").textContent = "Fehler: " + e.message; console.error(e); });
window.__state = state; // zum Debuggen in der Browser-Konsole
