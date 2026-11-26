// Studio (student version): the model on a blank sheet, one empty bubble and a chat. Experiment here — diagrams over
// the sheet, other arrangements, new interactions. The same data as on the Inventory page (src/inventory.ts).
import { failed, openPage } from "./page";
import { initChat } from "./chat";

initChat();

openPage().then((page) => {
  if (!page) return;
  document.getElementById("sheet-hint")!.hidden = false;

  // --- YOUR STUDIO -------------------------------------------------------------------------------------
  //   document.getElementById("left-top")   the bubble on the left
  //   document.getElementById("viewport")   the sheet (the 3D view fills it; put your own elements on top)
  //   page.summary, page.model(), page.onSelect(…), page.viewer — as on the Inventory page
  //   page.models, page.setModelVisible(…), page.setActiveModel(…) — all models are in the 3D view at once
}).catch(failed);
