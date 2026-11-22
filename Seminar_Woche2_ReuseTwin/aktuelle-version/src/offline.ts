// Full-page notice when the core is not running; reconnects (reloads) as soon as it answers again.
import { serverUp } from "./api";
import { h } from "./dom";

let offline = false;

export function showOffline(): void {
  if (offline) return;
  offline = true;
  const el = document.getElementById("offline") as HTMLElement;
  el.replaceChildren(h("div", { class: "card" },
    h("h3", {}, "The core isn't running"),
    h("p", {}, "These pages show what the core provides: it reads the IFC files, runs imports and serves the models. ",
      "Start it together with the pages by running ", h("code", {}, "npm start"), " in the project folder, or on its own with ",
      h("code", {}, "npm run core"), "."),
    h("p", { class: "muted" }, "This page reconnects by itself as soon as the core is up.")));
  el.hidden = false;
  const retry = async () => {
    if (await serverUp()) location.reload();
    else window.setTimeout(retry, 2000);
  };
  window.setTimeout(retry, 2000);
}
