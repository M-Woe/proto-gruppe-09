# Ingestion audit — `C:\Users\marle\Desktop\Studium Master\Seminar\reuse-twin-student\out\_uploads\ae1e1498984a\UPV_BIM#7_ARC_2022_07_27.ifc`

| | |
|---|---|
| Schema | IFC2X3 |
| Authoring application | Autodesk Revit 2022 (ENU) 2022 |
| Header originating system | 22.0.2.392 - Exporter 22.0.2.392 - IU alternativa 22.0.2.392 |
| Units | length: METRE (×1.0 → m), area: SQUARE_METRE, volume: CUBIC_METRE |
| SHA-256 | `ae1e1498984a0eb1…` (22.0 MB) |
| Run | a357c6e769f0 · 2026-11-16T09:15:46+00:00 · 80.4 s · reuse-twin 0.1.0 · IfcOpenShell 0.9.0.post1 · geometry on |

## Summary

- Elements: **146** · types: 75 · spatial nodes: 9
- Identity: {'valid': 146}
- Material assignment kinds: {'layer_set_usage': 60, 'list': 60, 'single': 16, 'none': 9, 'layer_set': 1}
- Geometry status: {'ok': 146}
- Relationships: {'connects_path': 40, 'voids': 9}
- Findings: {'warning': 42, 'info': 33}

## Coverage by class (physical elements)

Evidence: material/build-up/Qto columns are source-derived; geometry is computed.

| Class | Count | Material | Layered build-up* | Geometry ok | Qto |
|---|---:|---:|---:|---:|---:|
| IfcWallStandardCase | 59 | 59 (100%) | 59 (100%) | 59 (100%) | 0 (0%) |
| IfcBuildingElementProxy | 42 | 42 (100%) | 0 (0%) | 42 (100%) | 0 (0%) |
| IfcPlate | 22 | 22 (100%) | 0 (0%) | 22 (100%) | 0 (0%) |
| IfcFurnishingElement | 5 | 5 (100%) | 0 (0%) | 5 (100%) | 0 (0%) |
| IfcColumn | 3 | 3 (100%) | 0 (0%) | 3 (100%) | 0 (0%) |
| IfcSlab | 2 | 2 (100%) | 1 (50%) | 2 (100%) | 0 (0%) |
| IfcWall | 2 | 2 (100%) | 0 (0%) | 2 (100%) | 0 (0%) |
| IfcRoof | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) |
| IfcWindow | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) |

\* layer set (usage), constituent set, or aggregated parts.

## Findings

| Severity | Code | Count | Message | Examples / details |
|---|---|---:|---|---|
| warning | `PROXY_ELEMENT` | 42 | Unclassified element (IfcBuildingElementProxy). | `09GJDKr1X91O$UHzvK$T7d` (IfcBuildingElementProxy), `09GJDKr1X91O$UHzvK$TvU` (IfcBuildingElementProxy), `0HcPr6H2L6sem_HeOsDoii` (IfcBuildingElementProxy) |
| info | `MESH_NOT_CLOSED` | 29 | Tessellated mesh is not closed; volume not computed. | `0R8l8bbqvBqeiCxJtgi9Ek` (IfcPlate), `0d$iHe$rDDdeIpWcEotKMq` (IfcPlate), `0d$iHe$rDDdeIpWcEotLu5` (IfcPlate) |
| info | `FILLING_WITHOUT_OPENING` | 1 | Door/window does not fill an opening. | `2UDQcfp091sOcL4x6pb6hV` (IfcWindow) |
| info | `GEOMETRY_AS_BOX` | 1 | Furnishing elements are shown as their bounding box, openings not cut; their closed-mesh test and volume are not evaluated. | n_elements=5 |
| info | `LAYER_THICKNESS_CHECK` | 1 | Layer thickness vs geometry: 60 elements compared, 0 on a different axis than declared, 0 matching no axis. | checked=60; direction_inconsistent=0; mismatched=0 |
| info | `QTO_VOLUME_CHECK` | 1 | NetVolume cross-check: 0 elements compared, 0 beyond tolerance. | checked=0; mismatched=0; rel_tol=0.05; abs_tol_m3=0.0001 |

## Not extracted by this ingestion version

- Meshes are summarised, not stored (Stage 2 exports geometry for the viewer).
- Geometry failure reasons from the kernel are not captured.
- Georeferencing (IfcMapConversion), space boundaries, groups/systems, classification references and IfcRelInterferesElements are not extracted.
- Property and quantity values are stored raw, in project units; only computed fields are SI.
