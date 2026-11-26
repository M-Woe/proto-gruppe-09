// Typed access to the student core (core/, started by `npm start`): the imported models as the import read them,
// their 3D geometry, and IFC import. Types are generated from the core's schema (src/api.gen.ts; `npm run gen:api`
// while the core runs). Every value is source (from the IFC) or computed (geometry: boxes, volumes, placements in m).
import type { components } from "./api.gen";

export type Schemas = components["schemas"];
export type ModelListItem = Schemas["ModelListItem"];
export type ModelSummary = Schemas["ModelSummary"];
/** Everything the import read for one model (model.json): spatial structure, types, elements, relationships, audit. */
export type IngestResult = Schemas["IngestResult"];
/** One element as the import read it: identity, class, names, properties, quantities, material, geometry summary. */
export type SourceElement = Schemas["SourceElement"];
export type ImportJob = Schemas["ImportJob"];

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method });
  } catch {
    throw new ApiError(0, "the core is not reachable");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, `${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

/** True when the core answers at /api/health (not just any server). */
export async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    return r.ok && (await r.json()).app === "reuse-twin";
  } catch {
    return false;
  }
}

/** Upload an .ifc as raw bytes (XHR, for upload progress); resolves with the import job. */
function uploadIfc(file: File, geometry: boolean, onProgress: (fraction: number) => void): Promise<ImportJob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/imports?filename=${enc(file.name)}&geometry=${geometry}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(JSON.parse(xhr.responseText) as ImportJob);
      let detail = xhr.statusText;
      try {
        detail = JSON.parse(xhr.responseText).detail ?? detail;
      } catch {
        /* non-JSON body */
      }
      reject(new ApiError(xhr.status, `${xhr.status}: ${detail}`));
    };
    xhr.onerror = () => reject(new ApiError(0, "the core is not reachable"));
    xhr.send(file);
  });
}

export const api = {
  models: () => call<ModelListItem[]>("GET", "/api/models"),
  /** Deletes out/<label>/ and its stored upload (never the original file); returns the models that remain. */
  deleteModel: (label: string) => call<ModelListItem[]>("DELETE", `/api/models/${enc(label)}`),
  summary: (label: string) => call<ModelSummary>("GET", `/api/models/${enc(label)}`),
  /** The whole model.json (tens of MB for a big model): fetch it once and keep it. */
  model: (label: string) => call<IngestResult>("GET", `/api/models/${enc(label)}/model.json`),
  /** The import's audit (audit.json): summary, coverage per IFC class, findings. */
  audit: (label: string) => call<Record<string, unknown>>("GET", `/api/models/${enc(label)}/audit.json`),
  element: (label: string, key: string) => call<SourceElement>("GET", `/api/models/${enc(label)}/elements/${enc(key)}`),
  glbUrl: (label: string) => `/api/models/${enc(label)}/geometry.glb`,
  uploadIfc,
  imports: () => call<ImportJob[]>("GET", "/api/imports"),
  importJob: (id: string) => call<ImportJob>("GET", `/api/imports/${enc(id)}`),
  cancelImport: (id: string) => call<ImportJob>("POST", `/api/imports/${enc(id)}/cancel`),
};
