// Minimal DOM builder shared by the panels.
export function h(tag: string, props: Record<string, unknown> = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "style") el.setAttribute("style", String(v));
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Inline SVG from trusted, static markup (icons). */
export function svg(markup: string): Element {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstElementChild!;
}

let toastTimer = 0;
/** A short message at the bottom of the page (#toast). */
export function toast(text: string, error = false): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("error", error);
  el.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("visible"), error ? 5000 : 2200);
}

/** Resolves once the page's entrance (shell.js) has played, so heavy work started after it does not stall it. */
export function arrived(): Promise<void> {
  const arriving = (window as unknown as { shellArriving?: boolean }).shellArriving;
  return new Promise((r) => (arriving ? setTimeout(r, 420) : r()));
}
