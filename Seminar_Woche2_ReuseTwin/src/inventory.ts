// Inventory (student version): the model in 3D, the parts table in the right panel, three empty bubbles
// for your panels, and a chat.
// Fill the bubbles with what you find useful — see "YOUR PANELS" below. All data comes from the core's API
// (src/api.ts): what the import read from the IFC (source) and what it computed from the geometry (computed).
import { failed, openPage } from "./page";
import { initChat } from "./chat";
import { h } from "./dom";
import { PartsPanel } from "./parts-panel";
import { InfoCard } from "./info-card";

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
  // Jede Änderung der Auswahl kommt bei allen drei Ansichten an.
  page.selection.onChange((ids) => {
    panel.setSelection(ids);
    card.show(ids);
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