// Starts the core (Python, http://127.0.0.1:8765) and the pages (Vite, http://localhost:5173) together; Ctrl+C stops
// both. `--core-only` starts just the core. Ports: REUSE_TWIN_CORE_PORT, REUSE_TWIN_WEB_PORT; REUSE_TWIN_NO_OPEN=1
// keeps the browser closed.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const win = process.platform === "win32";
const python = resolve("core", ...(win ? [".venv-windows", "Scripts", "python.exe"] : [".venv", "bin", "python"]));
const corePort = process.env.REUSE_TWIN_CORE_PORT || "8765";
const webPort = process.env.REUSE_TWIN_WEB_PORT || "5173";
const coreOnly = process.argv.includes("--core-only");

if (!existsSync(python)) {
  console.error("The core is not set up yet: run  npm run setup  first.");
  process.exit(1);
}

const children = [];
function start(cmd, args, env) {
  const child = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
  child.on("exit", (code) => {
    for (const c of children) if (c !== child) c.kill();
    process.exit(code ?? 0);
  });
  children.push(child);
}

/** Waits until the core answers (it takes a few seconds to load), so the pages do not open on "core not running". */
async function coreUp(timeoutMs = 60000) {
  for (const t0 = Date.now(); Date.now() - t0 < timeoutMs; await new Promise((r) => setTimeout(r, 300))) {
    try {
      if ((await fetch(`http://127.0.0.1:${corePort}/api/health`)).ok) return true;
    } catch {
      /* not up yet */
    }
  }
  return false;
}

start(python, ["-m", "reuse_twin.student", "--out", "out", "--port", corePort], { PYTHONPATH: resolve("core") });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => children.forEach((c) => c.kill()));
if (!coreOnly) {
  if (!(await coreUp())) console.error("The core did not answer within a minute; starting the pages anyway.");
  const open = process.env.REUSE_TWIN_NO_OPEN ? [] : ["--open", "/import.html"];
  start(process.execPath, [join("node_modules", "vite", "bin", "vite.js"), "--port", webPort, ...open],
    { REUSE_TWIN_CORE_PORT: corePort });
}
