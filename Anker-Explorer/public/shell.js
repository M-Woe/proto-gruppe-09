// Page switches between Import · Inventory (styles in style.css, "frame"), after the Sketch2Feedback bridge's
// shell.js. A classic script in <head>, so an arriving page is put in its hidden pose before its first paint.
//
// Two motions: the tab pill glides once to the clicked tab; the page leaves (side panels drift out, texts fade) and
// the next one arrives hidden and transitions in. Navigation waits for both. A reload or a direct visit shows the
// page at once; "reduce motion" switches without animation.
(function () {
  "use strict";
  const KEY = "reuse-twin-shell-from";
  const root = document.documentElement;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const OUT_MS = 160, IN_MS = 420, PILL_MS = 200;

  let from = null;
  try { from = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch { /* private mode */ }
  const arriving = !!from && !still;
  if (arriving) root.classList.add("shell-pre", "shell-moving");
  window.shellArriving = arriving; // the dot grid waits until the page has settled

  function placePill(tabs, target, glide) {
    let pill = tabs.querySelector(".shell-pill");
    if (!pill) {
      pill = document.createElement("span");
      pill.className = "shell-pill";
      tabs.prepend(pill);
    }
    tabs.classList.toggle("no-glide", !glide);
    const t = target.getBoundingClientRect(), r = tabs.getBoundingClientRect();
    tabs.style.setProperty("--pill-x", `${t.left - r.left}px`);
    tabs.style.setProperty("--pill-w", `${t.width}px`);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const tabs = document.querySelector(".shell-tabs");
    const active = tabs && tabs.querySelector("a.active");
    if (tabs && active) placePill(tabs, active, false);
    if (arriving) {
      // Two frames: the hidden pose is painted, then the transition runs. The timer is a safety net for paused
      // frames (a background tab): the page must never stay hidden.
      let shown = false;
      const show = () => {
        if (shown) return;
        shown = true;
        root.classList.remove("shell-pre");
        setTimeout(() => root.classList.remove("shell-moving"), IN_MS);
      };
      requestAnimationFrame(() => requestAnimationFrame(show));
      setTimeout(show, 150);
    }
  });

  let leaving = null;
  document.addEventListener("click", (event) => {
    const link = event.target.closest(".shell-tabs a");
    if (!link || link.classList.contains("active")) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    try { sessionStorage.setItem(KEY, location.href); } catch { /* private mode */ }
    if (still) { location.href = link.href; return; }
    placePill(link.closest(".shell-tabs"), link, true);
    root.classList.remove("shell-pre");
    root.classList.add("shell-out", "shell-moving");
    clearTimeout(leaving); // a second click retargets the same exit
    leaving = setTimeout(() => { location.href = link.href; }, Math.max(OUT_MS, PILL_MS));
  });

  // Back/forward can restore a page from the cache mid-exit; bring it back.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) root.classList.remove("shell-out", "shell-moving", "shell-pre");
  });
})();
