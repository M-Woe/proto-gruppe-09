# Ingestion audit — `C:\Users\marle\Desktop\Studium Master\Seminar\reuse-twin-student\out\_uploads\e931af3ac4e2\UPV_BIM#7_ST_2022_07_27.ifc`

| | |
|---|---|
| Schema | IFC4 |
| Authoring application | Autodesk Revit 2019 (ENU) 2019 |
| Header originating system | 20180328_1600(x64) - Exporter 19.0.1.1 - IU alternativa 19.0.1.1 |
| Units | length: METRE (×1.0 → m), area: SQUARE_METRE, volume: CUBIC_METRE |
| SHA-256 | `e931af3ac4e23d56…` (0.8 MB) |
| Run | ec6d67085f37 · 2026-11-16T09:18:05+00:00 · 4.8 s · reuse-twin 0.1.0 · IfcOpenShell 0.9.0.post1 · geometry on |

## Summary

- Elements: **188** · types: 66 · spatial nodes: 8
- Identity: {'valid': 188}
- Material assignment kinds: {'none': 106, 'single': 74, 'profile_set': 6, 'layer_set_usage': 2}
- Geometry status: {'ok': 187, 'no_representation': 1}
- Relationships: {'voids': 22, 'aggregates': 1}
- Findings: {'warning': 225, 'info': 4}

## Coverage by class (physical elements)

Evidence: material/build-up/Qto columns are source-derived; geometry is computed.

| Class | Count | Material | Layered build-up* | Geometry ok | Qto |
|---|---:|---:|---:|---:|---:|
| IfcBuildingElementProxy | 142 | 59 (42%) | 0 (0%) | 142 (100%) | 0 (0%) |
| IfcColumn | 18 | 18 (100%) | 0 (0%) | 18 (100%) | 0 (0%) |
| IfcFurniture | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) |
| IfcSlab | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) |
| IfcStair | 2 | 1 (50%) | 1 (50%) | 1 (50%) | 0 (0%) |

\* layer set (usage), constituent set, or aggregated parts.

## Findings

| Severity | Code | Count | Message | Examples / details |
|---|---|---:|---|---|
| warning | `PROXY_ELEMENT` | 142 | Unclassified element (IfcBuildingElementProxy). | `04OVEiKcf0ORhJ0ubEi$Zm` (IfcBuildingElementProxy), `04OVEiKcf0ORhJ0ubEiyHa` (IfcBuildingElementProxy), `04OVEiKcf0ORhJ0ubEiyni` (IfcBuildingElementProxy) |
| warning | `NO_MATERIAL` | 83 | No material association on the element, its type, or its parts. | `04OVEiKcf0ORhJ0ubEi$Zm` (IfcBuildingElementProxy), `04OVEiKcf0ORhJ0ubEiyHa` (IfcBuildingElementProxy), `04OVEiKcf0ORhJ0ubEiyni` (IfcBuildingElementProxy) |
| info | `GEOMETRY_AS_BOX` | 1 | Furnishing elements are shown as their bounding box, openings not cut; their closed-mesh test and volume are not evaluated. | n_elements=2 |
| info | `LAYER_THICKNESS_CHECK` | 1 | Layer thickness vs geometry: 2 elements compared, 0 on a different axis than declared, 0 matching no axis. | checked=2; direction_inconsistent=0; mismatched=0 |
| info | `NO_CONNECTION_RELATIONSHIPS` | 1 | No IfcRelConnects* relationships: element adjacency and connections must be inferred from geometry. |  |
| info | `QTO_VOLUME_CHECK` | 1 | NetVolume cross-check: 0 elements compared, 0 beyond tolerance. | checked=0; mismatched=0; rel_tol=0.05; abs_tol_m3=0.0001 |

## Not extracted by this ingestion version

- Meshes are summarised, not stored (Stage 2 exports geometry for the viewer).
- Geometry failure reasons from the kernel are not captured.
- Georeferencing (IfcMapConversion), space boundaries, groups/systems, classification references and IfcRelInterferesElements are not extracted.
- Property and quantity values are stored raw, in project units; only computed fields are SI.
