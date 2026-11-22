// One-time setup of the core: a Python 3.13 environment in core/.venv (core/.venv-windows on Windows, so one folder
// shared between macOS and Windows keeps both) with the pinned packages (core/requirements.txt).
// The core is shipped compiled for Python 3.13, so exactly that version is needed. On Windows a missing Python 3.13 is
// offered for install with winget.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const win = process.platform === "win32";
const venv = join("core", win ? ".venv-windows" : ".venv");
const python = win ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");

function version(cmd, args) {
  const r = spawnSync(cmd, [...args, "-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Windows: Python 3.13 where its installers put it (python.org for this user or all users, the Python install
 *  manager), also when it was installed after this window opened and PATH does not have it yet. */
function windowsInstalls() {
  const local = process.env.LOCALAPPDATA ?? "";
  return [join(local, "Programs", "Python"), process.env.ProgramFiles ?? "", join(local, "Python")].flatMap((root) => {
    try {
      return readdirSync(root).filter((d) => /^(python313|pythoncore-3\.13)(-|$)/i.test(d))
        .map((d) => [join(root, d, "python.exe"), []]);
    } catch {
      return [];
    }
  });
}

function find() {
  const candidates = [
    ...(process.env.PYTHON ? [[process.env.PYTHON, []]] : []),
    ["python3.13", []],
    ...(win ? [["py", ["-3.13"]], ...windowsInstalls()] : []),
    // macOS: python.org's installer and Homebrew, also when PATH does not have them yet
    ...(process.platform === "darwin" ? ["/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13",
      "/opt/homebrew/bin/python3.13", "/usr/local/bin/python3.13"].map((p) => [p, []]) : []),
    ["python3", []],
    ["python", []],
  ];
  return candidates.find(([cmd, args]) => version(cmd, args) === "3.13");
}

async function yes(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return !/^n/i.test((await rl.question(question)).trim());
  } catch {
    return false;  // Ctrl+D or Ctrl+C
  } finally {
    rl.close();
  }
}

if (existsSync(python) && version(python, []) !== "3.13") {
  console.error(`${venv} does not use Python 3.13. Delete the folder ${venv} and run npm run setup again.`);
  process.exit(1);
}
if (!existsSync(python)) {
  let found = find();
  if (!found && win && spawnSync("winget", ["--version"]).status === 0
      && await yes("Python 3.13 is not installed. Install it now with winget (for this user)? [Y/n] ")) {
    spawnSync("winget", ["install", "--id", "Python.Python.3.13", "--exact", "--source", "winget", "--scope", "user",
      "--accept-source-agreements", "--accept-package-agreements"], { stdio: "inherit" });
    found = find();
  }
  if (!found) {
    console.error("Python 3.13 is needed for the core. Install it from https://www.python.org/downloads/ " +
      "(any 3.13.x), then run npm run setup again. To use a specific one: PYTHON=/path/to/python3.13 npm run setup" +
      (win ? "\nWith the Python install manager (py), in a terminal:  py install 3.13" : ""));
    process.exit(1);
  }
  console.log(`Creating ${venv} with ${[found[0], ...found[1]].join(" ")} …`);
  run(found[0], [...found[1], "-m", "venv", venv]);
}
console.log("Installing the core's packages (IfcOpenShell, FastAPI …) — the first time takes a minute …");
run(python, ["-m", "pip", "install", "--disable-pip-version-check", "--quiet", "-r", join("core", "requirements.txt")]);
console.log("\nThe core is ready. Start everything with:  npm start");
