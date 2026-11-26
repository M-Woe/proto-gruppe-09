export type ClassificationStatus =
  | "unclassified"
  | "candidate"
  | "manually_confirmed"
  | "geometrically_detected"
  | "ifc_relationship_confirmed";

export type ConnectionStatus = "unknown" | "manual" | "geometric_candidate" | "ifc_relationship";

export interface IfcReference {
  model: string;
  fingerprint: string;
  key: string;
  globalId: string;
}

export interface AnchorComponent extends IfcReference {
  role: string;
}

export interface AnchorRecord {
  anchorId: string;
  root: IfcReference;
  anchorType: string;
  components: AnchorComponent[];
  host: IfcReference | null;
  classificationStatus: ClassificationStatus;
  classificationSource: string;
  classificationRationale: string;
  connectionStatus: ConnectionStatus;
  connectionEvidence: string;
  updatedAt: string;
}

const STORAGE_KEY = "reuseTwin.anchorExplorer.v1";
const CLASSIFICATION_STATUSES: ClassificationStatus[] = [
  "unclassified", "candidate", "manually_confirmed", "geometrically_detected", "ifc_relationship_confirmed",
];
const CONNECTION_STATUSES: ConnectionStatus[] = ["unknown", "manual", "geometric_candidate", "ifc_relationship"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReference(value: unknown): value is IfcReference {
  return isRecord(value) && typeof value.model === "string" && typeof value.fingerprint === "string"
    && typeof value.key === "string" && typeof value.globalId === "string";
}

function isAnchor(value: unknown): value is AnchorRecord {
  if (!isRecord(value) || !isReference(value.root) || typeof value.anchorId !== "string"
    || typeof value.anchorType !== "string" || !Array.isArray(value.components)
    || !value.components.every((item) => isRecord(item) && isReference(item) && typeof item.role === "string")
    || !(value.host === null || isReference(value.host))
    || !CLASSIFICATION_STATUSES.includes(value.classificationStatus as ClassificationStatus)
    || !CONNECTION_STATUSES.includes(value.connectionStatus as ConnectionStatus)
    || typeof value.classificationSource !== "string" || typeof value.classificationRationale !== "string"
    || typeof value.connectionEvidence !== "string" || typeof value.updatedAt !== "string") return false;
  return true;
}

export function readAnchorRecords(): AnchorRecord[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    throw new Error(`Ankerdaten konnten nicht aus dem Browserspeicher gelesen werden: ${errorMessage(error)}`);
  }
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Der gespeicherte Anker-Datensatz ist ungültig: ${errorMessage(error)}`);
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.anchors)
    || !parsed.anchors.every(isAnchor)) {
    throw new Error("Der gespeicherte Anker-Datensatz hat ein unbekanntes oder ungültiges Format.");
  }
  return parsed.anchors;
}

export function writeAnchorRecords(anchors: AnchorRecord[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, anchors }));
  } catch (error) {
    throw new Error(`Ankerdaten konnten nicht im Browserspeicher gespeichert werden: ${errorMessage(error)}`);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const classificationLabels: Record<ClassificationStatus, string> = {
  unclassified: "Unclassified",
  candidate: "Candidate",
  manually_confirmed: "Manually confirmed",
  geometrically_detected: "Geometrically detected (AABB)",
  ifc_relationship_confirmed: "IFC relationship confirmed",
};

export const connectionLabels: Record<ConnectionStatus, string> = {
  unknown: "Unbekannt",
  manual: "Manuell dokumentiert",
  geometric_candidate: "Geometrischer Kandidat (AABB)",
  ifc_relationship: "IFC-Beziehung vorhanden",
};
