// Die deutschen Bezeichnungen für die Bauteilanalyse: eine zentrale Stelle für alle Wörter, die die
// Bauteiltabelle und ihre Detailansichten zeigen.
//
// Grundsatz: nichts wird erfunden. Eine Bezeichnung wird nur vergeben, wenn sie sich auf einen Beleg in
// den IFC-Daten stützen kann – auf die Klasse, den PredefinedType, den Objekttyp, den Namen, das Material
// oder eine Eigenschaft. Was nicht belegt ist, bekommt einen neutralen deutschen Begriff
// („Sonstiges Bauteil"); der ursprüngliche Name bleibt immer abrufbar.
//
// Die Zuordnungen stehen als Tabellen in dieser Datei: ein neu importiertes Modell braucht keine
// Code-Änderung, solange es die Standardklassen benutzt. Fremdsprachige Bezeichnungen werden über
// Fachbegriffe in den IFC-Klassen, PredefinedTypes und Objekttypen aufgelöst – nicht durch Raten.

/** Woher eine Bezeichnung kommt – steht in den Details, damit jede Benennung nachvollziehbar ist. */
export type Basis = "IFC-Klasse" | "PredefinedType" | "Objekttyp" | "Name" | "Material" | "Eigenschaft" | "Vorgabe";

/** Der Typ eines Bauteils, mit dem Beleg, aus dem er abgeleitet wurde. */
export interface Naming {
  /** Der deutsche Typ, z. B. „Außenwand". */
  type: string;
  /** Die Art aus der IFC-Klasse, z. B. „Wand". */
  base: string;
  /** Woher der Typ kommt. */
  basis: Basis;
  /** Die Originalangabe, aus der er abgeleitet wurde. */
  raw: string;
  /** Alle Belege, die zusammen den Typ ergeben – für die Detailansicht. */
  sources: { label: string; value: string }[];
}

/** Der neutrale Typ, wenn die Daten keine genauere Art hergeben. */
export const UNKNOWN_TYPE = "Sonstiges Bauteil";

/** Wie ein fehlender Wert in der Tabelle und in den Details heisst. */
export const MISSING = "Nicht vorhanden";

/** 1. Die IFC-Klassen und ihre deutschen Bauteilarten. */
const CLASS_TYPES: Record<string, string> = {
  IfcWall: "Wand",
  IfcWallStandardCase: "Wand",
  IfcWallElementedCase: "Wand",
  IfcCurtainWall: "Vorhangfassade",
  IfcSlab: "Decke",
  IfcColumn: "Stütze",
  IfcBeam: "Träger",
  IfcMember: "Tragwerkselement",
  IfcPlate: "Platte",
  IfcFooting: "Fundament",
  IfcPile: "Gründungspfahl",
  IfcBuildingElementProxy: UNKNOWN_TYPE,
  IfcFurnishingElement: "Einrichtung",
  IfcFurniture: "Möbel",
  IfcOpeningElement: "Öffnung",
  IfcDoor: "Tür",
  IfcWindow: "Fenster",
  IfcRoof: "Dach",
  IfcStair: "Treppe",
  IfcStairFlight: "Treppenlauf",
  IfcRamp: "Rampe",
  IfcRampFlight: "Rampenlauf",
  IfcRailing: "Geländer",
  IfcCovering: "Bekleidung",
  IfcSpace: "Raum",
  IfcChimney: "Schornstein",
  IfcShadeDevice: "Sonnenschutz",
  IfcFastener: "Verbinder",
  IfcMechanicalFastener: "Verbinder",
  IfcDiscreteAccessory: "Zubehör",
  IfcElementAssembly: "Baugruppe",
  IfcCivilElement: "Tiefbauelement",
  IfcVirtualElement: "virtuelles Bauteil",
  IfcTransportElement: "Transportelement",
  IfcAnnotation: "Kommentar",
  IfcDistributionElement: "Installation",
  IfcFlowSegment: "Leitungssegment",
  IfcFlowFitting: "Leitungsformstück",
  IfcFlowTerminal: "Anschlussgerät",
  IfcFlowController: "Regelorgan",
  IfcFlowMovingDevice: "bewegliches Gerät",
  IfcEnergyConversionDevice: "Energieumsetzer",
  IfcGeographicElement: "Geometrieobjekt",
  IfcBuilding: "Gebäude",
  IfcBuildingStorey: "Geschoss",
  IfcSite: "Grundstück",
};

/** 2. PredefinedTypes: die festen Vorgaben der IFC – sie haben Vorrang vor jedem Namen. */
const PREDEFINED_TYPES: Record<string, Record<string, string>> = {
  IfcSlab: {
    FLOOR: "Geschossdecke", ROOF: "Dachdecke", BASESLAB: "Bodenplatte", LANDING: "Treppenabsatz",
    SIDEWALK: "Gehweg", TRACKSLAB: "Gleisbett", USERDEFINED: "Decke", NOTDEFINED: "Decke",
  },
  IfcRoof: {
    FLAT_ROOF: "Flachdach", SHED_ROOF: "Pultdach", GABLE_ROOF: "Satteldach", HIPPED_ROOF: "Walmdach",
    GAMBREL_ROOF: "Krüppelwalmdach", BARREL_ROOF: "Tonnendach", RAINBOW_ROOF: "Schmetterlingsdach",
    BUTTERFLY_ROOF: "Schmetterlingsdach", DOME_ROOF: "Kuppeldach", MANY_ROOF: "Mansarddach",
    USERDEFINED: "Dach", NOTDEFINED: "Dach",
  },
  IfcColumn: { COLUMN: "Stütze", PILASTER: "Pfeiler", USERDEFINED: "Stütze", NOTDEFINED: "Stütze" },
  IfcBeam: {
    BEAM: "Träger", JOIST: "Unterzug", HOLLOWCORE: "Hohlkernträger", LINTEL: "Stürze",
    SPANDREL: "Brüstungsträger", USERDEFINED: "Träger", NOTDEFINED: "Träger",
  },
  IfcDoor: { DOOR: "Tür", GATE: "Tor", TRAPDOOR: "Klappe", USERDEFINED: "Tür", NOTDEFINED: "Tür" },
  IfcWindow: {
    WINDOW: "Fenster", SKYLIGHT: "Dachfenster", LIGHTDOME: "Lichtkuppel",
    USERDEFINED: "Fenster", NOTDEFINED: "Fenster",
  },
  IfcWall: {
    MOVEMENT: "Wand", RETENTION: "Stützwand", PLUMBINGPARTITION: "Installationswand", SHEAR: "Scherwand",
    ELEMENTEDWALL: "Wand", USERDEFINED: "Wand", NOTDEFINED: "Wand",
  },
  IfcStair: {
    STRAIGHT_RUN_STAIR: "Geradetreppe", TWO_STRAIGHT_RUN_STAIR: "Treppe mit Podest",
    QUARTER_WINDING_STAIR: "Wendeltreppe", HALF_WINDING_STAIR: "Wendeltreppe", SPIRAL_STAIR: "Spindeltreppe",
    USERDEFINED: "Treppe", NOTDEFINED: "Treppe",
  },
  IfcRailing: {
    HANDRAIL: "Handlauf", GUARDRAIL: "Schutzgeländer", BALUSTRADE: "Brüstung",
    USERDEFINED: "Geländer", NOTDEFINED: "Geländer",
  },
  IfcMember: {
    BRACE: "Strebe", CHORD: "Gurt", MULLION: "Pfosten", POST: "Pfosten", PIER: "Stütze",
    USERDEFINED: "Tragwerkselement", NOTDEFINED: "Tragwerkselement",
  },
  IfcFooting: {
    FOOTING_BEAM: "Gründungsriegel", PAD_FOOTING: "Einzelfundament", PILE_CAP: "Pfahlkopf",
    STRIP_FOOTING: "Streifenfundament", USERDEFINED: "Fundament", NOTDEFINED: "Fundament",
  },
  IfcCovering: {
    CLADDING: "Bekleidung", WRAPPING: "Bekleidung", INSULATION: "Dämmung", WATERPROOFING: "Abdichtung",
    USERDEFINED: "Bekleidung", NOTDEFINED: "Bekleidung",
  },
  IfcFurniture: {
    CHAIR: "Stuhl", TABLE: "Tisch", DESK: "Schreibtisch", BED: "Bett", SOFA: "Sofa", CABINET: "Schrank",
    SHELF: "Regal", BED_FURNITURE: "Wohnmöbel", SYSTEM_FURNITURE: "Systemmöbel", OTHERFURNITURE: "Möbel",
    USERDEFINED: "Möbel", NOTDEFINED: "Möbel",
  },
  IfcPlate: { SHEET: "Platte", USERDEFINED: "Platte", NOTDEFINED: "Platte" },
  IfcBuildingElementProxy: {
    ELEMENT: "Bauteil", PART: "Bauteil", ACCESSORY: "Zubehör", USERDEFINED: UNKNOWN_TYPE,
    NOTDEFINED: UNKNOWN_TYPE,
  },
};

/** Bautypen, vor denen das Material steht: „Stahlbetonstütze", „Holzträger". */
const MATERIAL_TYPES = new Set([
  "Stütze", "Pfeiler", "Träger", "Unterzug", "Stürze", "Brüstungsträger", "Hohlkernträger",
  "Decke", "Geschossdecke", "Bodenplatte", "Dachdecke", "Fundament", "Einzelfundament",
  "Streifenfundament", "Gründungsriegel", "Pfahlkopf", "Gründungspfahl", "Strebe", "Gurt",
]);

/** Materialwörter, die als Vorsatz vor einem Bautyp stehen dürfen. */
const QUALIFIER_WORDS = new Set(["Beton", "Stahlbeton", "Stahl", "Holz", "Ziegel", "Mauerwerk", "Leichtbeton"]);
/** 3. Fachbegriffe, die in Objekttypen und Namen vorkommen – spanisch, italienisch, katalanisch, englisch.
 *  Gesucht wird nur an Wortgrenzen, damit „MODULO MURO" und „_viga" gefunden werden, „vigueta" aber nicht. */
function word(source: string): RegExp {
  return new RegExp(`(^|[^a-zA-Z])${source}([^a-zA-Z]|$)`, "i");
}

const KEYWORDS: [RegExp, string][] = [
  [word("muro\\s+cortina|cortina\\s+de\\s+muro"), "Vorhangfassade"],
  [word("curtain[\\s_-]?wall"), "Vorhangfassade"],
  [word("tabique|parede\\s+divisoria"), "Trennwand"],
  [word("muro|parede|wall"), "Wand"],
  [word("pilar|columna|pilaster"), "Stütze"],
  [word("viga|beam"), "Träger"],
  [word("forjado|slab|losa"), "Decke"],
  [word("cubierta|techo|roof"), "Dach"],
  [word("suelo|floor|pavimento"), "Boden"],
  [word("escalera|stair|scala"), "Treppe"],
  [word("puerta|door|porta"), "Tür"],
  [word("ventana|window|finestra"), "Fenster"],
  [word("zapatas?|footing"), "Fundament"],
  [word("anclajes?|anchor"), "Anker"],
  [word("encofrado|formwork"), "Schalung"],
  [word("palet|pallet"), "Palette"],
  [word("armario|armadi|cabinet"), "Schrank"],
  [word("barandilla|railing|balustrade"), "Geländer"],
  [word("fachada|facade|facciata"), "Fassade"],
  [word("carpinter"), "Schreinerarbeit"],
  [word("calor|emisor|radiador"), "Heizkörper"],
  [word("pilastra"), "Pfeiler"],
  [word("viga\\s+de\\s+madera"), "Träger"],
];

/** Der deutsche Typ aus einem Objekttyp oder einem Namen – null, wenn kein Fachbegriff vorkommt. */
function keyword(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const [re, type] of KEYWORDS) if (re.test(text)) return type;
  return null;
}

/** 4. Materialien: ganze Bezeichnungen zuerst, dann einzelne Fachwörter, zuletzt die Projektcodes. */
const MATERIAL_EXACT: [RegExp, string][] = [
  [/madera\s*-\s*madera\s+de\s+construcci[oó]n/i, "Holz – Konstruktionsholz"],
  [/madera\s+(?:de\s+)?fachadas?\s+ext/i, "Fassadenholz (außen)"],
  [/madera\s*-\s*listel/i, "Holz – Latte"],
  [/contrachapado,?\s*entablados/i, "Sperrholz, Bretter"],
  [/^cristal$/i, "Glas"],
  [/^vidrio$/i, "Glas"],
  [/^policarbonato$/i, "Polycarbonat"],
  [/suelo\s+por\s+defecto/i, "Standardbodenbelag"],
  [/cubierta\s+por\s+defecto/i, "Standarddachbelag"],
  [/^<unnamed>$/i, "Ohne Bezeichnung"],
];

/** Einzelne Materialwörter – die längste Übereinstimmung gewinnt, deshalb steht Stahlbeton vor Beton. */
const MATERIAL_WORDS: [RegExp, string][] = [
  [word("reinforced\\s+concrete|hormig[oó]n\\s+armado|sta[hl]beton|beton\\s+armado"), "Stahlbeton"],
  [word("concrete|hormig[oó]n|beton|cemento|mortero"), "Beton"],
  [word("steel|acero|sta[hl]"), "Stahl"],
  [word("timber|wood|madera|holz|legno"), "Holz"],
  [word("plywood|contrachapado|sperrholz"), "Sperrholz"],
  [word("brick|ladrillo|ziegel|mattone"), "Ziegel"],
  [word("glass|cristal|vidrio|vetro"), "Glas"],
  [word("insulation|aislamiento|isolante|isolierung|daemm"), "Dämmstoff"],
  [word("gypsum\\s*board|placa\\s+de\\s+yeso|gipskarton"), "Gipskarton"],
  [word("aluminio|alluminio|aluminium"), "Aluminium"],
  [word("polycarbonate|policarbonato"), "Polycarbonat"],
  [word("stone|piedra|pietra"), "Stein"],
  [word("marble|marmol|marmor"), "Marmor"],
  [word("plaster|yeso|intonaco|putz"), "Putz"],
  [word("copper|cobre|kupfer"), "Kupfer"],
  [word("ceramic|ceramica|keramik"), "Keramik"],
  [word("fabric|textile|tejido|stoff"), "Textil"],
];

/** Der erste Teil eines Schichtaufbaus: „Muro básico:…“ → „Muro básico“. */
const SET_BASES: [RegExp, string][] = [
  [/muro\s+b[aá]sico/i, "Standardwand"],
  [/muro\s+cortina/i, "Vorhangfassade"],
  [/muro/i, "Wand"],
  [/cubierta\s+b[aá]sica/i, "Standarddach"],
  [/cubierta|techo/i, "Dach"],
  [/suelo|piso/i, "Boden"],
  [/forjado|losa/i, "Decke"],
  [/tabique|pared/i, "Trennwand"],
];

/** Ein Material – mit dem deutschen Namen und dem Original. */
export interface MaterialLabel {
  /** Der deutsche Name, z. B. „Holz – Konstruktionsholz". */
  label: string;
  /** Der ursprüngliche Name aus der IFC-Datei. */
  raw: string;
  /** True, wenn der Name wirklich übersetzt wurde. */
  translated: boolean;
  /** Das kurze Wort für den Typ (z. B. „Holz"), null wenn es keines gibt. */
  word: string | null;
}

/** Die Angaben zur Materialzuweisung eines Bauteils. */
export interface MaterialFacts {
  /** Der Name der Zuweisung (ein Material, ein Schichtaufbau oder ein Profilsatz). */
  name: string | null;
  /** Die Art der Zuweisung (single, layer_set, layer_set_usage, profile_set …). */
  kind: string | null;
  /** Die Materialien, die in der Zuweisung stecken. */
  members: string[];
  /** Wie viele Schichten der Aufbau hat. */
  layerCount: number;
}

/** Das kurze Materialwort für den Typ – „Stahlbeton", „Holz" … oder null. */
export function materialWord(f: MaterialFacts): string | null {
  // Bei einem Profilsatz steckt das Material in den Profilen, nicht im Namen des Satzes.
  const raw = f.kind === "profile_set" ? (f.members[0] ?? f.name ?? "") : (f.name ?? f.members[0] ?? "");
  for (const [re, w] of MATERIAL_EXACT) if (re.test(raw)) return w.split(" ")[0].split(",")[0];
  for (const [re, w] of MATERIAL_WORDS) if (re.test(raw)) return w;
  return codeWord(raw);
}

/** Die Projektcodes der UPV-Modelle: OSB, Brettsperrholz, Polycarbonat, Luftschicht. */
function codeWord(raw: string): string | null {
  if (/OSB/i.test(raw)) return "OSB";
  if (/GL\d+h/i.test(raw)) return "Brettsperrholz";
  if (/C-?\d+h/i.test(raw)) return "Brettsperrholz";
  if (/PLC/i.test(raw)) return "Polycarbonat";
  if (/UPV_THI/i.test(raw)) return "Dämmstoff";
  return null;
}

/** Der deutsche Name eines Materials, eines Schichtaufbaus oder eines Profilsatzes. */
export function materialLabel(f: MaterialFacts): MaterialLabel {
  const raw = f.name ?? "";
  if (!raw) return { label: MISSING, raw: "", translated: false, word: null };
  const isSet = f.kind === "layer_set" || f.kind === "layer_set_usage" || f.kind === "constituent_set";
  const isProfile = f.kind === "profile_set";

  if (isProfile) {
    const dims = raw.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/);
    const word = materialWord({ ...f, name: f.members[0] ?? raw });
    const size = dims ? `${dims[1].replace(".", ",")} × ${dims[2].replace(".", ",")}` : "";
    const label = `Profil ${size}${word ? ` – ${word}` : ""}`.trim();
    return { label, raw, translated: true, word };
  }

  if (isSet) {
    const base = raw.split(":")[0] ?? raw;
    let name = base;
    for (const [re, w] of SET_BASES) if (re.test(base)) { name = w; break; }
    const translated = name !== base;
    const label = `${name} (${f.layerCount} ${f.layerCount === 1 ? "Schicht" : "Schichten"})`;
    return { label, raw, translated, word: null };
  }

  for (const [re, w] of MATERIAL_EXACT) if (re.test(raw)) return { label: w, raw, translated: true, word: w.split(" ")[0].split(",")[0] };
  for (const [re, w] of MATERIAL_WORDS) if (re.test(raw)) return { label: w, raw, translated: true, word: w };

  // Projektcodes, die sich eindeutig auflösen lassen.
  let m = raw.match(/UPV_BRD_OSB/i);
  if (m) return { label: "OSB-Platte", raw, translated: true, word: "OSB" };
  m = raw.match(/UPV_CONS_GL(\d+)h/i);
  if (m) {
    const autoclave = /autoclave/i.test(raw) ? " (autoklavierter)" : "";
    return { label: `Brettsperrholz GL${m[1]}h${autoclave}`, raw, translated: true, word: "Brettsperrholz" };
  }
  m = raw.match(/UPV_CONS_C-?(\d+)h/i);
  if (m) return { label: `Brettsperrholz C${m[1]}`, raw, translated: true, word: "Brettsperrholz" };
  m = raw.match(/UPV_CONS_PLC/i);
  if (m) return { label: "Polycarbonat", raw, translated: true, word: "Polycarbonat" };
  m = raw.match(/UPV_BRD_HONEXT/i);
  if (m) return { label: "Platte HONEXT (Typ nicht benannt)", raw, translated: true, word: null };
  m = raw.match(/UPV_THI/i);
  if (m) return { label: "Dämmstoff (Typ nicht benannt)", raw, translated: true, word: "Dämmstoff" };
  m = raw.match(/UPV_Air/i);
  if (m) return { label: "Luftschicht", raw, translated: true, word: null };

  // Nichts belastbares gefunden: der Originalname bleibt stehen und wird als ungeklärt gekennzeichnet.
  return { label: raw, raw, translated: false, word: null };
}
/** 5. Geschosse: die Ebene aus dem Kürzel, die Lage aus dem Anhang. */
const STOREY_SUFFIX: Record<string, string> = {
  TOS: "OK Geschoss",
  LEOS: "unterste OK",
};

/** Die kurze Form des Kürzels für die schmale Tabellenspalte. */
const STOREY_SUFFIX_SHORT: Record<string, string> = {
  TOS: "OK",
  LEOS: "unt. OK",
};

/** Ein Geschoss – mit dem deutschen Namen und dem Original. */
export interface StoreyLabel {
  /** Der deutsche Name, z. B. „Ebene 00 · OK Geschoss". */
  label: string;
  /** Die kurze Form für die schmale Tabellenspalte, z. B. „Ebene 00 · OK". */
  short: string;
  /** Der ursprüngliche Name aus der IFC-Datei. */
  raw: string;
  /** True, wenn das Kürzel sicher gedeutet wurde. */
  translated: boolean;
}

/** Der deutsche Name eines Geschosses. „L00_TOS" → „Ebene 00 · OK Geschoss". */
export function storeyLabel(raw: string | null): StoreyLabel {
  if (!raw) return { label: MISSING, short: MISSING, raw: "", translated: false };
  const m = raw.match(/^([A-Za-z]*)(\d*)(?:[-_](.+))?$/);
  if (!m) return { label: raw, short: raw, raw, translated: false };
  const [, prefix, digits, suffix] = m;
  let level: string;
  if (/^ro$/i.test(prefix)) level = "Dach";
  else if (/^l$/i.test(prefix) && digits) level = `Ebene ${digits.padStart(2, "0")}`;
  else level = prefix + digits;
  if (!suffix) return { label: level, short: level, raw, translated: true };
  const known = STOREY_SUFFIX[suffix.toUpperCase()];
  const short = STOREY_SUFFIX_SHORT[suffix.toUpperCase()] ?? suffix;
  if (known) {
    return { label: `${level} · ${known}`, short: `${level} · ${short}`, raw, translated: true };
  }
  // Unbekanntes Kürzel: es bleibt stehen, wird aber nicht als übersetzt ausgegeben.
  return { label: `${level} · ${suffix}`, short: `${level} · ${suffix}`, raw, translated: false };
}

/** 6. Eigenschaften und Property-Sets. */
const PROPERTY_LABELS: Record<string, string> = {
  LoadBearing: "Tragend",
  IsExternal: "Außenbauteil",
  ThermalTransmittance: "Wärmedurchgangskoeffizient",
  FireRating: "Feuerwiderstand",
  Reference: "Referenz",
  ExtendToStructure: "Durchlaufend",
  NumberOfTreads: "Anzahl Stufen",
  NumberOfRiser: "Anzahl Steigungen",
  Slope: "Neigung",
  PitchAngle: "Neigungswinkel",
  ProjectedArea: "Projektierte Fläche",
  TotalArea: "Gesamtfläche",
  Depth: "Tiefe",
  Height: "Höhe",
  Width: "Breite",
  Length: "Länge",
  NominalWidth: "Nennbreite",
  NominalHeight: "Nennhöhe",
  NominalLength: "Nennlänge",
  IsSelfSupported: "Selbsttragend",
  HasOpenings: "Hat Öffnungen",
  Status: "Status",
  LoadCapacity: "Traglast",
  Compartments: "Brandabschnitte",
  FireExit: "Feuerwehrweg",
  AirTransmittance: "Luftdurchgang",
  Visible: "Sichtbar",
  IsNatural: "Natürlich belüftet",
  SoundTransmission: "Schalldurchgang",
  DocumentReference: "Dokumentenverweis",
  AssemblyPlace: "Einbauort",
  Manufacturer: "Hersteller",
  ModelReference: "Typenbezeichnung",
  StandardName: "Normbezeichnung",
};

const PSET_LABELS: Record<string, string> = {
  Pset_WallCommon: "Wandeigenschaften",
  Pset_SlabCommon: "Deckeneigenschaften",
  Pset_ColumnCommon: "Stützeneigenschaften",
  Pset_BeamCommon: "Trägereigenschaften",
  Pset_WindowCommon: "Fenstereigenschaften",
  Pset_DoorCommon: "Türeigenschaften",
  Pset_RoofCommon: "Dacheigenschaften",
  Pset_StairCommon: "Treppeneigenschaften",
  Pset_PlateCommon: "Platteneigenschaften",
  Pset_FurnitureCommon: "Möbeleigenschaften",
  Pset_CoveringCommon: "Bekleidungseigenschaften",
  Pset_MemberCommon: "Tragwerkseigenschaften",
  Pset_FootingCommon: "Fundamenteigenschaften",
  Pset_PileCommon: "Pfahleigenschaften",
  Pset_RailingCommon: "Geländereigenschaften",
  Pset_CurtainWallCommon: "Vorhangfassade",
  Pset_SpaceCommon: "Raumeigenschaften",
  Pset_BuildingElementProxyCommon: "Allgemeine Bauteileigenschaften",
  Pset_ElementAssemblyCommon: "Baugruppeneigenschaften",
  Pset_ProvisionForVoid: "Aussparung",
  Pset_ReinforcementBarPitchOfColumn: "Bewehrung der Stütze (Stababstand)",
  Pset_ReinforcementBarPitchOfSlab: "Bewehrung der Decke (Stababstand)",
  Pset_ThermalTransmittance: "Wärmedurchgang",
  Pset_ProjectedCRSCommon: "Abgestelltes Koordinatensystem",
  Pset_CivilElementCommon: "Tiefbaueigenschaften",
  Pset_DistributionElementCommon: "Installationseigenschaften",
  Pset_SpatialElementCommon: "Raumeigenschaften",
  Pset_QuantityCommon: "Mengen",
};

/** Der deutsche Name einer IFC-Eigenschaft. Unbekannte behalten ihren Namen. */
export function propertyLabel(raw: string): string {
  return PROPERTY_LABELS[raw] ?? raw;
}

/** Der deutsche Name eines Property-Sets. Unbekannte behalten ihren Namen. */
export function psetLabel(raw: string): string {
  return PSET_LABELS[raw] ?? raw;
}

/** 7. Zahlen und Einheiten im deutschen Format. */
const nf = (digits: number): Intl.NumberFormat =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Eine Zahl, z. B. „2,50". */
export function number(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return nf(digits).format(v);
}

/** Eine Länge in Metern, z. B. „2,50 m". */
export function length(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return `${nf(digits).format(v)} m`;
}

/** Eine Fläche in Quadratmetern, z. B. „15,40 m²". */
export function area(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return `${nf(digits).format(v)} m²`;
}

/** Ein Volumen in Kubikmetern, z. B. „8,25 m³". */
export function volume(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return `${nf(digits).format(v)} m³`;
}

/** Eine Dicke: unter einem Meter in Millimetern, z. B. „58 mm". */
export function thickness(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  if (Math.abs(v) < 1) return `${nf(0).format(Math.round(v * 1000))} mm`;
  return `${nf(2).format(v)} m`;
}

/** Eine Höhe über der Bezugsebene, z. B. „2,86 m". */
export function elevation(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return `${nf(2).format(v)} m`;
}

/** Ein Wahrheitswert als „ja" / „nein". */
export function yesNo(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return MISSING;
  return v ? "ja" : "nein";
}

/** Liest einen Wahrheitswert, so wie ihn die IFC-Dateien schreiben („True", „false", 1 …). */
export function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "ja", "y"].includes(s)) return true;
    if (["false", "0", "no", "nein", "n"].includes(s)) return false;
  }
  return null;
}

/** Das kurze Kürzel eines Modells, z. B. „ARC" aus „UPV_BIM-7_ARC_2022_07_27". */
export function modelCode(label: string): string {
  const parts = label.split(/[_\-.]/).filter((p) => p && !/^\d+$/.test(p));
  return parts.length ? parts[parts.length - 1] : label;
}
/** 8. Die Benennung eines Bauteils. */
const WALL_CLASSES = new Set(["IfcWall", "IfcWallStandardCase", "IfcWallElementedCase", "IfcCurtainWall"]);

/**
 * Welche Verfeinerungen eine Klasse zulässt. Steht eine Klasse nicht in dieser Liste, wird ihr Typ
 * nicht verfeinert – eine Öffnung bleibt eine Öffnung, auch wenn sie „Muro MURO" heisst. null
 * bedeutet: die Klasse ist die generische, dort ist jeder Fachbegriff erlaubt.
 */
const REFINEMENTS: Record<string, string[] | null> = {
  IfcBuildingElementProxy: null,
  IfcWall: ["Wand", "Vorhangfassade", "Trennwand", "Fassade"],
  IfcWallStandardCase: ["Wand", "Vorhangfassade", "Trennwand", "Fassade"],
  IfcWallElementedCase: ["Wand", "Vorhangfassade", "Trennwand", "Fassade"],
  IfcCurtainWall: ["Wand", "Vorhangfassade", "Fassade"],
  IfcColumn: ["Stütze", "Pfeiler"],
  IfcBeam: ["Träger", "Unterzug", "Stürze"],
  IfcMember: ["Träger", "Stütze"],
  IfcSlab: ["Decke", "Boden", "Geschossdecke"],
  IfcRoof: ["Dach", "Fassade"],
  IfcStair: ["Treppe"],
  IfcStairFlight: ["Treppe"],
  IfcRamp: ["Rampe"],
  IfcDoor: ["Tür"],
  IfcWindow: ["Fenster"],
  IfcRailing: ["Geländer"],
  IfcCovering: ["Bekleidung"],
  IfcFurnishingElement: ["Schrank", "Treppe", "Heizkörper", "Einrichtung"],
  IfcFurniture: ["Schrank", "Treppe", "Möbel"],
  IfcFooting: ["Fundament"],
  IfcPile: ["Gründungspfahl"],
};

/** Alles, was für die Benennung eines Bauteils gelesen wird. */
export interface ElementFacts {
  /** Die IFC-Klasse, z. B. „IfcWallStandardCase". */
  ifcClass: string;
  /** Der PredefinedType, wenn die Datei einen nennt. */
  predefinedType: string | null;
  /** Der ObjectType (der Familienname), wenn die Datei einen nennt. */
  objectType: string | null;
  /** Der Name des Bauteils. */
  name: string | null;
  /** Die Materialzuweisung. */
  material: MaterialFacts;
  /** IsExternal, wenn die Datei es sagt. */
  isExternal: boolean | null;
  /** LoadBearing, wenn die Datei es sagt. */
  loadBearing: boolean | null;
}

/** Der Fachbegriff aus einem Objekttyp oder Namen – nur wenn die Klasse ihn zulässt. */
function refine(cls: string, text: string | null): { type: string; raw: string } | null {
  const k = keyword(text);
  if (!k) return null;
  const allowed = REFINEMENTS[cls];
  if (allowed === undefined) return null;
  if (allowed !== null && !allowed.includes(k)) return null;
  return { type: k, raw: text! };
}

/**
 * Der deutsche Typ eines Bauteils – mit dem Beleg, aus dem er abgeleitet wurde.
 *
 * Die Reihenfolge ist die Stärke des Belegs: der PredefinedType der IFC ist normativ, der Objekttyp
 * (der Familienname) und der Name sind Angaben des Planers, die Klasse ist der letzte Ausweg. Wände
 * bekommen „Außenwand" / „Innenwand" nur aus der Eigenschaft IsExternal, und nur wenn die Klasse
 * selbst eine Wand ist – ein „Sonstiges Bauteil" mit dem Wort „Wand" im Namen bleibt ein Bauteil
 * mit Wandcharakter und wird nicht zur Innenwand erklärt.
 */
/**
 * True, wenn der Text einen bekannten Fachbegriff aus einer Fremdsprache enthält – also einen Namen
 * und keinen Planbezug. Damit lässt sich unterscheiden, was in die Tabellenspalte darf.
 */
export function hasForeignTerm(text: string): boolean {
  return keyword(text) !== null;
}
export function naming(f: ElementFacts): Naming {
  const base = CLASS_TYPES[f.ifcClass] ?? UNKNOWN_TYPE;
  let type = base;
  let basis: Basis = "IFC-Klasse";
  let raw = f.ifcClass;
  const sources: { label: string; value: string }[] = [];

  const pre = f.predefinedType ? PREDEFINED_TYPES[f.ifcClass]?.[f.predefinedType.toUpperCase()] : undefined;
  if (pre) {
    type = pre;
    basis = "PredefinedType";
    raw = f.predefinedType!;
    sources.push({ label: "PredefinedType", value: f.predefinedType! });
  } else {
    const fromObject = refine(f.ifcClass, f.objectType);
    const fromName = fromObject ? null : refine(f.ifcClass, f.name);
    if (fromObject) {
      type = fromObject.type;
      basis = "Objekttyp";
      raw = fromObject.raw;
      sources.push({ label: "Objekttyp", value: fromObject.raw });
    } else if (fromName) {
      type = fromName.type;
      basis = "Name";
      raw = fromName.raw;
      sources.push({ label: "Name", value: fromName.raw });
    } else {
      sources.push({ label: "IFC-Klasse", value: f.ifcClass });
    }
  }

  // Wände: die Datei sagt, ob sie außen liegen.
  if (WALL_CLASSES.has(f.ifcClass) && type === "Wand" && f.isExternal !== null) {
    type = f.isExternal ? "Außenwand" : "Innenwand";
    basis = "Eigenschaft";
    raw = "IsExternal";
    sources.push({ label: "IsExternal", value: f.isExternal ? "true" : "false" });
  }

  // Tragende Bauteile: das Material steht davor, z. B. „Stahlbetonstütze".
  if (MATERIAL_TYPES.has(type) && f.material.name) {
    const w = materialWord(f.material);
    if (w && QUALIFIER_WORDS.has(w)) {
      type = w + type.charAt(0).toLowerCase() + type.slice(1);
      basis = "Material";
      raw = f.material.name;
      sources.push({ label: "Material", value: f.material.name });
    }
  }

  return { type, base, basis, raw, sources };
}

/** Wie die Belegstelle in den Details heißt. */
export function basisLabel(basis: Basis): string {
  switch (basis) {
    case "IFC-Klasse": return "IFC-Klasse";
    case "PredefinedType": return "PredefinedType";
    case "Objekttyp": return "Objekttyp";
    case "Name": return "Name";
    case "Material": return "Material";
    case "Eigenschaft": return "IFC-Eigenschaft";
    default: return "Vorgabe";
  }
}