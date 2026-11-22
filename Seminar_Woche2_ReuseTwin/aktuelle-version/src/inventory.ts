// Inventory (student version): the model in 3D, the parts table in the right panel, three empty bubbles
// for your panels, and a chat.
// Fill the bubbles with what you find useful — see "YOUR PANELS" below. All data comes from the core's API
// (src/api.ts): what the import read from the IFC (source) and what it computed from the geometry (computed).
import { failed, openPage } from "./page";
import { initChat } from "./chat";
import { h } from "./dom";
import { PartsPanel } from "./parts-panel";
import { InfoCard } from "./info-card";
import { Explosion, type VisibilityMode } from "./explosion";
import { ExplosionPanel } from "./explosion-panel";
import {
  buildCatalog, catalogArrangement, layoutCatalog, filterCatalog, sortCatalog,
  EMPTY_CATALOG_FILTERS, type CatalogItem, type CatalogSort, type CatalogFilters,
} from "./catalog";
import { CatalogPanel } from "./catalog-panel";

initChat();

openPage().then((page) => {
  if (!page) return;

  // --- Die Bauteiltabelle und die Infokarte ------------------------------------------------------
  // Die Tabelle sitzt in dem Panel, das rechts oben schon da ist – dort, wo vorher der Platzhalter
  // stand. Die Infokarte liegt am Rand des 3D-Viewports. Beide hängen an derselben Auswahl wie der
  // 3D-Viewer: die Auswahl führt die Seite, alle Ansichten zeigen sie nur an.
  const panel = new PartsPanel(page.parts, document.getElementById("right-top")!);
  const card = new InfoCard(page.parts, document.getElementById("viewport")!);

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
  let catalogSort: CatalogSort = "standard";
  let catalogFilters: CatalogFilters = { ...EMPTY_CATALOG_FILTERS };

  const catalogEntries = (): CatalogItem[] =>
    sortCatalog(filterCatalog(catalogItems, catalogFilters), catalogSort);

  catalogPanel.setProjection((model, key, plane) => page.viewer.elementProjection(model, key, plane));
  catalogPanel.onPick = (id, additive) => page.selection.select(id, additive);

  const focusCurrentView = (): void => {
    if (catalogPanel.getMode() === "catalog" && catalogPanel.getView() === "2d") {
      catalogPanel.focusSelected();
    } else {
      page.focusSelection();
    }
  };
  panel.onFocus = focusCurrentView;
  card.onFocus = focusCurrentView;
  catalogPanel.onFocus = focusCurrentView;

  /** Der Katalog: aufbauen, anordnen, anzeigen. */
  const showCatalog = (): void => {
    const frames = page.viewer.elementFrames();
    catalogItems = buildCatalog(page.parts, frames);
    catalogPanel.setItems(catalogItems);
    catalogPanel.setSummary(catalogEntries());
    panel.setCatalogFilter(catalogEntries().map((item) => item.id));
    page.catalog = catalogEntries();
    if (catalogPanel.getView() === "2d") {
      page.viewer.canvas.hidden = true;
      page.viewer.setLabels([]);
      page.viewer.setArrangement(null);
      catalogPanel.show2D(catalogEntries());
      catalogPanel.clearLabels();
      return;
    }
    page.viewer.canvas.hidden = false;
    const visible = catalogEntries();
    for (const model of page.viewer.models()) {
      const prefix = `${model.label}\0`;
      const keys = visible
        .filter((item) => item.id.startsWith(prefix))
        .map((item) => item.id.slice(prefix.length));
      page.viewer.setDisplay(keys, "isolate", model.label);
    }
    const labels = layoutCatalog(visible, catalogSort);
    page.viewer.setArrangement(catalogArrangement(visible));
    page.viewer.setLabels(catalogPanel.labels(labels));
    // Die isometrische Gesamtansicht auf den gefilterten Katalog.
    page.viewer.focus(visible.map((i) => ({ model: i.model, key: i.key })), [1, 0.85, 1], true);
  };

  /** Zurueck zur Gebaeudeansicht: die Anordnung des Baues (Explosion) wiederherstellen. */
  const showBuilding = (): void => {
    catalogPanel.hide2D();
    page.viewer.canvas.hidden = false;
    panel.setCatalogFilter(null);
    page.viewer.setLabels([]);
    catalogPanel.clearLabels();
    const state = exPanel.getState();
    if (state.exploded) applyArrangement();
    else page.viewer.setArrangement(null);
    for (const model of page.viewer.models()) {
      page.viewer.setDisplay(model.keys, "all", model.label);
    }
  };

  catalogPanel.onChange = (mode) => {
    // Im Katalog gibt es keine Explosionsdarstellung: sie waere doppelt und unuebersichtlich.
    exPanel.setVisible(mode === "building");
    if (mode === "catalog") showCatalog();
    else showBuilding();
  };

  catalogPanel.onViewChange = () => {
    if (catalogPanel.getMode() !== "catalog") return;
    showCatalog();
  };

  catalogPanel.onSortChange = (sort) => {
    catalogSort = sort;
    if (catalogPanel.getMode() === "catalog") showCatalog();
  };

  catalogPanel.onFilterChange = (filters) => {
    catalogFilters = filters;
    if (catalogPanel.getMode() === "catalog") showCatalog();
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
    catalogPanel.setSelected(ids);
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

  // --- YOUR PANELS -------------------------------------------------------------------------------------
  // The three bubbles. Each holds a note until you replace its content, e.g.
  //   slots.rightTop.replaceChildren(h("p", {}, "…"))      (h from ./dom builds elements)
  const slots = {
    leftTop: document.getElementById("left-top")!,
    rightTop: document.getElementById("right-top")!,
    rightBottom: document.getElementById("right-bottom")!,
  };
  // What you have:
  //   page.summary                 the active model's file, schema, units, storeys, counts
  //   await page.model()           everything the import read: elements, properties, materials, spatial structure …
  //   page.onSelect((key) => …)    the clicked element's key (null: none); api.element(page.label, key) gives its record
  //   page.viewer                  the 3D view: setSelection, setHover, setColors, setDisplay, frame
  //   page.models                  every model in the 3D view (label, keys, visible) — all of them are loaded at once
  //   page.setModelVisible(l, v)   show or hide one model in the 3D view (its geometry stays loaded)
  //   page.setActiveModel(l)       the model the panels and the API calls talk about (the model menu does this too)
  //   page.parts                   every element of every model, with the German names (src/parts.ts)
  void slots;
}).catch(failed);