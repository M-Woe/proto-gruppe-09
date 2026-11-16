# Reuse Twin — student version

You build the interface: panels, diagrams and interactions for finding and understanding the recoverable materials
in real building models. This folder has three pages:

| Page | What is there | What you do |
|---|---|---|
| **Import** | Drop an IFC file: it is read on this computer into a model with 3D geometry and an audit. | Use it as it is. |
| **Inventory** | The model in 3D (click an element to select it), three empty bubbles, and a chat. | Fill the bubbles with the information you find useful. |
| **Studio** | The model on a blank sheet, one empty bubble, and a chat. | Experiment. |

The **core** (folder `core/`) reads IFC files and serves what it read. It is compiled and not for editing; your
code talks to it only through its HTTP API (`/api/…`).

## Setup (once)

Install, once per computer:

1. [Node.js](https://nodejs.org) 22 or 24 (LTS).
2. [Python](https://www.python.org/downloads/) **3.13** (any 3.13.x — the core is compiled for exactly that version).
   On Windows, tick "Add python.exe to PATH" in the installer — or, with the Python install manager, run
   `py install 3.13` in a terminal.
3. For the chat (optional): [Ollama](https://ollama.com), then in a terminal `ollama pull qwen3:1.7b` (1.4 GB).

You can skip 1 and 2: when Node.js or Python 3.13 is missing, the start file offers to install it — on Windows with
winget (Node.js asks for administrator rights), on macOS with Homebrew if you have it, otherwise with the official
installers from nodejs.org and python.org (macOS asks for your password).

## Start

Double-click **`Start Reuse Twin (Mac).command`** or **`Start Reuse Twin (Windows).bat`** in this folder. The first
start installs the pages' and the core's packages (a few minutes, needs internet); every start then runs the core
and the pages and opens <http://localhost:5173/import.html>. Import an IFC file (drop it onto the page), then switch
to Inventory or Studio. The pages reload as you edit. Close the window (or `Ctrl+C`) to stop.

macOS may refuse the first double-click ("unidentified developer"): right-click the file → **Open** → **Open**.

The folder can also be on a network or shared drive (Windows then first says "UNC paths are not supported" — that
is expected). One folder used from both macOS and Windows keeps a core environment for each (`core/.venv`,
`core/.venv-windows`); the pages' packages are reinstalled for the system you start on (a few seconds).

The same in a terminal, in this folder:

```bash
npm install
```

```bash
npm run setup
```

```bash
npm start
```

## Where things are

| File | What it does |
|---|---|
| `src/inventory.ts` | The Inventory page — **your bubbles** (`slots.leftTop`, `slots.rightTop`, `slots.rightBottom`). |
| `src/studio.ts` | The Studio page — **your sheet**. |
| `src/page.ts` | Shared by both: model menu, 3D view, click and hover, Frame (F), Esc. |
| `src/chat.ts` | The chat with the local model. |
| `src/api.ts`, `src/api.gen.ts` | Calls to the core and their types (generated; `npm run gen:api` while the core runs). |
| `src/viewer.ts` | The three.js view: `setSelection`, `setHover`, `setColors`, `setDisplay`, `frame`, `onPick`. |
| `src/dom.ts` | `h(tag, props, ...children)` builds elements. |
| `src/style.css`, `src/student.css` | The look, including the evidence colours `--ev-source`, `--ev-computed` … |
| `index.html`, `studio.html`, `import.html` | The pages' layout. `src/importer.ts` runs the Import page. |
| `core/` | The core (compiled). `out/` holds the imported models. |

## The data

| Endpoint | Gives |
|---|---|
| `GET /api/models` · `GET /api/models/{label}` | The imported models; one model's file, schema, units, storeys, counts |
| `GET /api/models/{label}/model.json` | **Everything the import read**: spatial structure, type objects, every element with its properties, quantities, material assignment (layers, constituents …), placement and geometry summary, relationships, audit findings |
| `GET /api/models/{label}/elements/{key}` | One element of `model.json` |
| `GET /api/models/{label}/audit.json` | The import's audit: what the file lacks or contradicts |
| `GET /api/models/{label}/geometry.glb` | The 3D geometry, one node per element key |

Every endpoint and type, with try-it-out: <http://127.0.0.1:8765/docs> while the core runs. Values are what the IFC
says (**source**) or what the import computed from the geometry — bounding boxes, volumes, placements in metres
(**computed**). Property and quantity values stay raw, in the file's units.

## Ground rules

1. **Show how each value is known.** Source, computed — and when *you* compute something (a count, a sum, a class),
   say so and show what it is based on.
2. **Unknown stays visible.** Do not drop, fill or guess missing values; count them and show them.
3. **The chat's answers are generated.** The model sees only the conversation and can be wrong. Never present its
   answers as data from the IFC.

The IFC files you get in this course are third-party models: do not share them outside the course.

## The chat

`qwen3:1.7b`, running on your computer through Ollama. It sees only what is written in the conversation — not the
model, the selection or the screen. What it should know, and whether it may do anything in the viewer, is yours to
design (`src/chat.ts`). Another Ollama model: change `MODEL` there.
