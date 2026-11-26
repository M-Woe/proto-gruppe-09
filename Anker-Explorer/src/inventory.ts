// Inventory: the shared IFC viewer, parts table, and manually curated anchor explorer.
// The anchor metadata stays separate from the source IFC; the viewer only reads the imported geometry.
import { failed, openPage } from "./page";
import { h } from "./dom";
import { PartsPanel } from "./parts-panel";
import { InfoCard } from "./info-card";
import { Explosion, type VisibilityMode } from "./explosion";
import { ExplosionPanel } from "./explosion-panel";
import { buildCatalog, catalogArrangement, catalogLabels, layoutCatalog, type CatalogItem } from "./catalog";
import { CatalogPanel } from "./catalog-panel";
import { AnchorExplorer } from "./anchor-explorer";

openPage().then((page) => {
  if (!page) return;

  // --- Die Bauteiltabelle und die Infokarte ------------------------------------------------------
  // Die Tabelle sitzt in dem Panel, das rechts oben schon da ist – dort, wo vorher der Platzhalter
  // stand. Die Infokarte liegt am Rand des 3D-Viewports. Beide hängen an derselben Auswahl wie der
  // 3D-Viewer: die Auswahl führt die Seite, alle Ansichten zeigen sie nur an.
  const panel = new PartsPanel(page.parts, document.getElementById("right-top")!);
  const card = new InfoCard(page.parts, document.getElementById("viewport")!);
  new AnchorExplorer(page, document.getElementById("left-top")!);

  // Ein Klick in der Tabelle wählt im 3D-Viewer (Strg/Cmd ergänzt die Auswahl).
  panel.onPick = (id, additive) => page.selection.select(id, additive);
  panel.onFocus = () => page.focusSelection();
  // Die Karte zoomt auf dieselbe Auswahl.
  card.onFocus = () => page.focusSelection();

  // --- Der Bauteilkatalog ---------------------------------------------------------------------------
  // Der Katalog loest die Bauteile aus dem Gebaeudeverband und ordnet sie wie in einem Bauteillager.
  // Er aendert nichts an den Daten: die Bauteile bekommen nur eine zusaetzliche, temporaere
  // Verschiebung und Drehung. In der Gebaeudeansicht stehen sie wieder exakt an ihrer IFC-Position.
  const catalogPanel = new CatalogPanel(document.getElementById("viewport")!);
  let catalogItems: CatalogItem[] = [];

  /** Der Katalog: aufbauen, anordnen, anzeigen. */
  const showCatalog = (): void => {
    const frames = page.viewer.elementFrames();
    catalogItems = buildCatalog(page.parts, frames);
    layoutCatalog(catalogItems);
    page.viewer.setArrangement(catalogArrangement(catalogItems));
    page.viewer.setLabels(catalogPanel.labels(catalogLabels(catalogItems)));
    catalogPanel.setSummary(catalogItems);
    // Die isometrische Gesamtansicht auf den Katalog.
    page.viewer.focus(catalogItems.map((i) => ({ model: i.model, key: i.key })), [1, 0.85, 1], true);
  };

  /** Zurueck zur Gebaeudeansicht: die Anordnung des Baues (Explosion) wiederherstellen. */
  const showBuilding = (): void => {
    page.viewer.setLabels([]);
    catalogPanel.clearLabels();
    const state = exPanel.getState();
    if (state.exploded) applyArrangement();
    else page.viewer.setArrangement(null);
  };

  catalogPanel.onChange = (mode) => {
    // Im Katalog gibt es keine Explosionsdarstellung: sie waere doppelt und unuebersichtlich.
    exPanel.setVisible(mode === "building");
    if (mode === "catalog") showCatalog();
    else showBuilding();
  };

  // --- Die Explosionsdarstellung ---------------------------------------------------------------------
  // Das Bedienfeld liegt im 3D-Viewport. Die Explosion ist nur eine zusaetzliche, temporaere
  // Verschiebung fuer das Bild: die IFC-Weltkoordinaten der Bauteile bleiben unveraendert.
  const explosion = new Explosion(page.parts, page.viewer);
  const exPanel = new ExplosionPanel(document.getElementById("viewport")!);

  /** Was im 3D zu sehen ist - getrennt von der Filterung der Tabelle. */
  const applyVisibility = (mode: VisibilityMode): void => {
    const selected = page.selection.list();
    const filtered = panel.filteredIds();
    for (const model of page.viewer.models()) {
      const prefix = `${model.label}\0`;
      const keys = (ids: string[]) => ids.filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length));
      const members = mode === "selection" ? keys(selected) : mode === "filter" ? keys(filtered) : model.keys;
      page.viewer.setDisplay(members, mode === "all" ? "all" : "isolate", model.label);
    }
  };

  /** Die Anordnung neu setzen (nach Grad, Gruppierung oder Auswahl). */
  const applyArrangement = (): void => {
    const state = exPanel.getState();
    const ids = page.selection.list();
    explosion.apply(state.criterion, state.exploded ? state.factor : 0, ids);
    exPanel.setGroups(explosion.groups(state.criterion, ids));
  };

  exPanel.onChange = (state) => {
    applyArrangement();
    applyVisibility(state.visibility);
  };
  // Ein Filter der Tabelle darf auch das 3D beeinflussen (nur ueber die Sichtbarkeit).
  panel.onFilter = () => {
    if (exPanel.getState().visibility === "filter") applyVisibility("filter");
  };
  // Jede Änderung der Auswahl kommt bei allen Ansichten an.
  page.selection.onChange((ids) => {
    panel.setSelection(ids);
    card.show(ids);
    const state = exPanel.getState();
    // Nach Auswahl gruppiert heisst jede neue Auswahl eine neue Anordnung.
    if (state.exploded && state.criterion === "selection") applyArrangement();
    if (state.visibility === "selection") applyVisibility("selection");
  });

  // --- Die rechte Spalte: Tabelle ein- und ausblenden, Breite ziehen ------------------------------
  const section = document.getElementById("slot-right-top")!;
  const toggle = document.getElementById("parts-toggle") as HTMLButtonElement | null;
  if (toggle) {
    toggle.onclick = () => {
      const off = section.classList.toggle("collapsed");
      toggle.textContent = off ? "▸" : "◂";
      toggle.title = off ? "Bauteiltabelle einblenden" : "Bauteiltabelle ausblenden";
      toggle.setAttribute("aria-expanded", off ? "false" : "true");
    };
  }
  const column = document.querySelector<HTMLElement>(".shell-right");
  if (column) {
    const resizer = h("div", { class: "parts-resizer", title: "Die Spalte breiter oder schmaler ziehen" });
    column.prepend(resizer);
    let dragging = false;
    resizer.addEventListener("pointerdown", (ev) => {
      dragging = true;
      resizer.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    resizer.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const width = Math.max(260, Math.min(720, window.innerWidth - ev.clientX));
      document.documentElement.style.setProperty("--shell-right", `${width}px`);
    });
    const stop = () => { dragging = false; };
    resizer.addEventListener("pointerup", stop);
    resizer.addEventListener("pointercancel", stop);
  }

  // The left column contains the complete anchor explorer and can be resized independently.
  const leftColumn = document.querySelector<HTMLElement>(".shell-left");
  if (leftColumn) {
    const resizer = h("div", { class: "anchor-resizer", title: "Anker-Explorer breiter oder schmaler ziehen" });
    leftColumn.append(resizer);
    let dragging = false;
    resizer.addEventListener("pointerdown", (ev) => {
      dragging = true;
      resizer.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    resizer.addEventListener("pointermove", (ev) => {
      if (!dragging || window.innerWidth <= 900) return;
      const width = Math.max(300, Math.min(560, ev.clientX));
      document.documentElement.style.setProperty("--shell-left", `${width}px`);
    });
    const stop = () => { dragging = false; };
    resizer.addEventListener("pointerup", stop);
    resizer.addEventListener("pointercancel", stop);
  }

}).catch(failed);