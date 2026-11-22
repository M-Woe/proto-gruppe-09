// Light / dark theme, as in the Sketch2Feedback bridge pages: the system setting unless the header button was used
// (remembered); Option-click goes back to following the system. A classic script loaded in <head> so the page never
// flashes the wrong theme. Fires "themechange" so canvases and the 3D view can re-read the palette.
(function () {
  const root = document.documentElement, media = window.matchMedia("(prefers-color-scheme: dark)");
  const KEY = "reuse-twin-theme";
  const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const store = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* private mode */ } };
  const current = () => stored() || (media.matches ? "dark" : "light");
  const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  const moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  function apply() {
    const theme = current();
    root.setAttribute("data-theme", theme);
    const button = document.getElementById("theme-toggle");
    if (button) {
      button.innerHTML = theme === "dark" ? sun : moon;
      button.title = (theme === "dark" ? "Switch to light mode" : "Switch to dark mode") +
        (stored() ? " · ⌥-click: follow the system" : " · following the system");
    }
    window.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  }
  apply();
  media.addEventListener("change", apply);
  window.addEventListener("DOMContentLoaded", () => {
    apply();
    document.getElementById("theme-toggle")?.addEventListener("click", (event) => {
      store(event.altKey ? null : current() === "dark" ? "light" : "dark");
      apply();
    });
  });
})();
