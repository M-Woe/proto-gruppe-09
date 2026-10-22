"""Tests für stab_liste_etappe1.py (Ausführung: python -m unittest -v test_stab_liste_etappe1)."""
import csv
import json
import math
import unittest
from collections import Counter

from stab_liste_etappe1 import (
    CSV_FIELDS, MODEL_PATH, OUT_CSV, OUT_JSON, build_stab_liste, read_objects, write_outputs,
)


class StabListeEtappe1Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stabe = build_stab_liste()
        write_outputs(cls.stabe)

    def test_anzahl_stabe_gesamt(self):
        self.assertEqual(len(self.stabe), 736)

    def test_anzahl_je_typ(self):
        counts = Counter(s["rfem_typ"] for s in self.stabe)
        self.assertEqual(counts["Beam"], 561)
        self.assertEqual(counts["Tension"], 175)

    def test_ids_eindeutig(self):
        self.assertEqual(len({s["stab_id"] for s in self.stabe}), len(self.stabe))
        self.assertEqual(len({s["rfem_beam_id"] for s in self.stabe}), len(self.stabe))

    def test_keine_doppelten_achslinien(self):
        keys = [tuple(sorted([(s["start_x"], s["start_y"], s["start_z"]),
                              (s["ende_x"], s["ende_y"], s["ende_z"])])) for s in self.stabe]
        self.assertEqual(len(set(keys)), len(keys))

    def test_laenge_stimmt_mit_endpunkten_ueberein(self):
        for s in self.stabe:
            d = math.dist((s["start_x"], s["start_y"], s["start_z"]),
                          (s["ende_x"], s["ende_y"], s["ende_z"]))
            self.assertAlmostEqual(d, s["laenge_m"], delta=2e-4, msg=s["stab_id"])
            self.assertGreater(s["laenge_m"], 0, msg=s["stab_id"])

    def test_beam_hat_brep_tension_nicht(self):
        for s in self.stabe:
            if s["rfem_typ"] == "Beam":
                self.assertTrue(s["brep_vorhanden"], msg=s["stab_id"])
            else:
                self.assertFalse(s["brep_vorhanden"], msg=s["stab_id"])

    def test_rohdaten_doppelte_darstellung_wird_zusammengefuehrt(self):
        found = read_objects()
        beam_ids_mit_brep = [b for b, v in found.items() if v["breps"]]
        self.assertEqual(len(beam_ids_mit_brep), 561)
        for b in beam_ids_mit_brep:
            self.assertEqual(len(found[b]["axes"]), 1)
            self.assertEqual(len(found[b]["breps"]), 1)

    def test_csv_und_json_vollstaendig(self):
        with open(OUT_CSV, encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            self.assertEqual(reader.fieldnames, CSV_FIELDS)
            rows = list(reader)
        self.assertEqual(len(rows), 736)
        with open(OUT_JSON, encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["anzahl_staebe"], 736)
        self.assertEqual(data["anzahl_je_typ"], {"Beam": 561, "Tension": 175})
        self.assertTrue(MODEL_PATH.exists())


if __name__ == "__main__":
    unittest.main()
