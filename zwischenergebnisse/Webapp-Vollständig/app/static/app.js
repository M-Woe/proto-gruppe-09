import * as THREE from "three";
import { OrbitControls } from "/static/vendor/OrbitControls.js";

const $ = (s) => document.querySelector(s);
const fmt = (v, d = 2) => (v == null ? "–" : Number(v).toLocaleString("de-AT", { minimumFractionDigits: d, maximumFractionDigits: d }));
// 16 gut unterscheidbare Farben, bewusst ohne Gelb (Gelb = Auswahl)
const PALETTE = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#6a3d9a", "#ff9da7", "#9c755f",
                 "#7f7f7f", "#1b9e77", "#17becf", "#8c6d31", "#a6cee3", "#d62ca0", "#1f3a93", "#b2df8a"];
const SEL_COLOR = new THREE.Color("#ffd000");
const SEC_COLOR = new THREE.Color("#ffe98a");

const state = { members: new Map(), objects: new Map(), rows: new Map(), selected: null, section: null, colors: {},
                carbon: null, co2: new Map(), co2Rows: new Map() };
// kg CO2e: grosse Werte mit 1, mittlere mit 2, kleine mit 3 Nachkommastellen
const fmtc = (v) => (v == null ? "–" : fmt(v, Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 1 || v === 0 ? 2 : 3));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

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
  const mat = new THREE.MeshStandardMaterial({ color: state.colors[state.members.get(id).section], roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
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
    const base = new THREE.Color(state.colors[m.section]);
    let color = base;
    if (state.section && m.section === state.section) color = SEC_COLOR;
    if (id === state.selected) color = SEL_COLOR;
    obj.material.color.copy(color);
    obj.material.emissive.set(id === state.selected ? 0x553f00 : 0x000000);
    const dimmed = state.selected != null ? id !== state.selected : state.section && m.section !== state.section;
    obj.material.opacity = dimmed ? (state.selected != null ? 0.45 : 0.25) : 1;
    obj.material.transparent = obj.material.opacity < 1;
  }
  document.querySelectorAll("#tbl-members tr.sel").forEach((r) => r.classList.remove("sel"));
  document.querySelectorAll("#tbl-sections tr.sec-active").forEach((r) => r.classList.remove("sec-active"));
  const sectionOfSel = state.selected != null ? state.members.get(state.selected).section : state.section;
  if (sectionOfSel) document.querySelector(`#tbl-sections tr[data-sec="${CSS.escape(sectionOfSel)}"]`)?.classList.add("sec-active");
  const row = state.selected != null ? state.rows.get(state.selected) : null;
  if (row) {
    row.classList.add("sel");
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  document.querySelectorAll("#tbl-co2 tr.sel").forEach((r) => r.classList.remove("sel"));
  const row2 = state.selected != null ? state.co2Rows.get(state.selected) : null;
  if (row2) {
    row2.classList.add("sel");
    const sc = $("#co2-scroll"), top = row2.offsetTop - sc.clientHeight / 2;
    sc.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }
  showDetail();
  showCo2Detail();
}

function showDetail() {
  const el = $("#detail");
  if (state.selected == null) { el.textContent = ""; return; }
  const m = state.members.get(state.selected);
  el.innerHTML = `<b>Stab ${m.id}</b> · ${m.section}${m.section_end ? " → " + m.section_end : ""} · L = ${fmt(m.length_m, 3)} m · V = ${fmt(m.volume_m3, 5)} m³` +
    (m.note ? `<br><i>${m.note}</i>` : "");
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
    tr.innerHTML = `<td><span class="swatch" style="background:${state.colors[s.name]}"></span></td><td>${s.name}</td>` +
      `<td class="num">${s.count}</td><td class="num">${fmt(s.area_nom_mm2, 1)}</td>` +
      `<td class="num">${fmt(s.length_m, 2)}</td><td class="num">${fmt(s.volume_m3, 4)}</td>`;
    tr.addEventListener("click", () => setSection(s.name));
    tb.appendChild(tr);
  }
  const tot = document.createElement("tr");
  tot.className = "sec-total";
  tot.innerHTML = `<td></td><td>Summe</td><td class="num">${n}</td><td></td><td class="num">${fmt(len, 2)}</td><td class="num">${fmt(vol, 4)}</td>`;
  tb.appendChild(tot);
}

function buildMemberTable(members) {
  const tb = $("#tbl-members tbody");
  for (const m of members) {
    const tr = document.createElement("tr");
    tr.dataset.id = m.id;
    tr.title = m.note || "";
    tr.innerHTML = `<td class="num">${m.id}</td><td>${m.section}${m.section_end ? " → " + m.section_end : ""}</td>` +
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
    const ok = (!q || String(id) === q || m.section.toLowerCase().includes(q)) && (!state.section || m.section === state.section);
    tr.style.display = ok ? "" : "none";
    const r2 = state.co2Rows.get(id);
    if (r2) r2.style.display = ok ? "" : "none";
    if (ok) shown++;
  }
  $("#member-count").textContent = `(${shown} von ${state.members.size})`;
  updateCo2Footer();
}

// ---------- CO2e-Tabelle (OEKOBAUDAT) ----------
function visibleCo2Members() {
  return [...state.co2.values()].filter((m) => state.co2Rows.get(m.id)?.style.display !== "none");
}

function updateCo2Footer() {
  const c = state.carbon;
  if (!c) return;
  const vis = visibleCo2Members();
  const filtered = vis.length !== state.co2.size;
  const sum = (f) => vis.reduce((a, m) => a + (f(m) ?? 0), 0);
  $("#tbl-co2 tfoot").innerHTML = `<tr><td></td><td>${filtered ? "Summe (Auswahl)" : "Summe"}</td><td class="num">${vis.length}</td>` +
    `<td class="num">${fmt(sum((m) => m.mass_kg), 1)}</td>` +
    c.modules.map((k) => `<td class="num">${fmtc(sum((m) => m.gwp[k]))}</td>`).join("") + `</tr>`;
}

function buildCo2Table(c) {
  state.carbon = c;
  state.co2.clear();
  state.co2Rows.clear();
  $("#tbl-co2 thead").innerHTML = `<tr><th class="num">ID</th><th>Querschnitt</th><th>Material</th><th class="num">Masse [kg]</th>` +
    c.modules.map((k) => `<th class="num" title="GWP-total, Modul ${k}${k === "D" ? " (Gutschrift/Last außerhalb der Systemgrenze, nicht zu A–C addieren)" : ""}">${k} [kg CO₂e]</th>`).join("") + `</tr>`;
  const tb = $("#tbl-co2 tbody");
  tb.innerHTML = "";
  for (const m of c.members) {
    state.co2.set(m.id, m);
    const tr = document.createElement("tr");
    tr.dataset.id = m.id;
    tr.title = m.note || "";
    tr.innerHTML = `<td class="num">${m.id}</td><td>${esc(m.section)}</td><td>${esc(m.material)}</td><td class="num">${fmt(m.mass_kg, 1)}</td>` +
      c.modules.map((k) => `<td class="num">${fmtc(m.gwp[k])}</td>`).join("");
    tr.addEventListener("click", () => select(state.selected === m.id ? null : m.id, { fromTable: true }));
    tb.appendChild(tr);
    state.co2Rows.set(m.id, tr);
  }
  const srcs = c.epds.map((e) => `<div><b>${esc(e.role)}:</b> ${esc(e.name)} · Bezug <b>${fmt(e.ref_amount, 0)} ${e.ref_unit === "m3" ? "m³" : e.ref_unit}</b> · ` +
    `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.uuid)}</a> · abgerufen ${esc(e.fetched)}</div>`).join("");
  $("#co2-sources").innerHTML = srcs + `<div>Bewehrung Fundamente: pauschal ${c.options.rebar_kg_per_m3} kg Betonstahl je m³ Beton · Rohrstützen als Hohlquerschnitt gerechnet · Leere Werte (–): Modul im Datensatz nicht deklariert.</div>`;
  applyFilter();
  paint();
}

function showCo2Detail() {
  const el = $("#co2-detail");
  const c = state.carbon, m = state.selected != null ? state.co2.get(state.selected) : null;
  if (!c || !m) { el.innerHTML = ""; return; }
  const unit = (u) => (u === "m3" ? "m³" : u);
  const rows = m.parts.map((p) => `<tr><td>${esc(p.label)}</td><td>${fmt(p.amount, p.unit === "kg" ? 2 : 5)} ${unit(p.unit)}</td>` +
    c.modules.map((k) => `<td class="num">${fmtc(p.gwp[k])}</td>`).join("") + `</tr>`).join("");
  el.innerHTML = `<b>Stab ${m.id} · ${esc(m.section)}</b> (${esc(m.material)}) · L = ${fmt(m.length_m, 3)} m · V = ${fmt(m.volume_m3, 5)} m³ · m = ${fmt(m.mass_kg, 2)} kg` +
    `<table class="mini"><thead><tr><th>Anteil</th><th>Menge</th>${c.modules.map((k) => `<th class="num">${k}</th>`).join("")}</tr></thead><tbody>${rows}` +
    `<tr class="tot"><td>Summe</td><td></td>${c.modules.map((k) => `<td class="num">${fmtc(m.gwp[k])}</td>`).join("")}</tr></tbody></table>` +
    (m.note ? `<i>${esc(m.note)}</i>` : "");
}

async function loadCarbon(refresh = false) {
  const st = $("#co2-status");
  st.className = "";
  st.textContent = "rufe Datensätze live aus der ÖKOBAUDAT ab …";
  const q = new URLSearchParams({ steel: $("#sel-steel").value, concrete: $("#sel-concrete").value });
  if (refresh) q.set("refresh", "true");
  try {
    const r = await fetch("/api/carbon?" + q);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
    buildCo2Table(await r.json());
    st.textContent = "";
  } catch (e) {
    st.className = "err";
    st.textContent = "CO₂e konnte nicht geladen werden: " + e.message;
  }
}

// ---------- Start ----------
async function init() {
  const [tab, geo] = await Promise.all([
    fetch("/api/members").then((r) => r.json()),
    fetch("/api/geometry").then((r) => r.json()),
  ]);
  tab.sections.forEach((s, i) => (state.colors[s.name] = PALETTE[i % PALETTE.length]));
  tab.members.forEach((m) => state.members.set(m.id, m));
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
  loadCarbon(); // CO2e-Tabelle nachladen (Abruf bei der OEKOBAUDAT kann einige Sekunden dauern)
}

$("#sel-steel").addEventListener("change", () => loadCarbon());
$("#sel-concrete").addEventListener("change", () => loadCarbon());
$("#btn-co2-reload").addEventListener("click", () => loadCarbon(true));
$("#filter").addEventListener("input", applyFilter);
$("#btn-fit").addEventListener("click", fitView);
$("#btn-clear").addEventListener("click", () => { state.section = null; state.selected = null; applyFilter(); paint(); });

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
init().catch((e) => { $("#status").textContent = "Fehler: " + e.message; console.error(e); });
window.__state = state; // zum Debuggen in der Browser-Konsole
