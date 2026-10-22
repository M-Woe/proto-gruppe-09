"""Tests für berechne_querschnitt_etappe2.py.

Ausführung (Projektwurzel): python -m unittest -v test_querschnitt_etappe2
"""
import math
import tempfile
import unittest
from collections import Counter
from pathlib import Path

import openpyxl

from berechne_querschnitt_etappe2 import (
    berechne_alle, brep_volume, flachstab_endflaechen, parse_profil, schreibe_excel,
)
from stab_liste_etappe1 import read_objects


class ParseProfilTest(unittest.TestCase):
    def test_flachstab(self):
        typ, b, h, t = parse_profil("Flat Bar 162.5/12")
        self.assertEqual(typ, "Flachstab")
        self.assertAlmostEqual(b, 0.1625)
        self.assertAlmostEqual(t, 0.012)

    def test_rundrohr(self):
        typ, D, _, t = parse_profil("RO 139.7x8.0 | EN 10210-2:2006")
        self.assertEqual(typ, "Rundrohr")
        self.assertAlmostEqual(D, 0.1397)
        self.assertAlmostEqual(t, 0.008)

    def test_kasten(self):
        typ, b, h, _ = parse_profil("Rectangle 500/500")
        self.assertEqual(typ, "Kastenprofil")
        self.assertAlmostEqual(b, 0.5)
        self.assertAlmostEqual(h, 0.5)

    def test_rd12_nicht_ableitbar(self):
        self.assertIsNone(parse_profil("RD 12"))


class QuerschnittEtappe2Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.zeilen = berechne_alle()
        cls.index = read_objects()

    def test_anzahl_und_status(self):
        self.assertEqual(len(self.zeilen), 736)
        status = Counter(z["pruefstatus"] for z in self.zeilen)
        self.assertEqual(status, Counter({"OK": 549, "PRÜFEN": 12, "UNKLAR": 175}))

    def test_flachstab_breite_passt_zum_layer(self):
        """Größere Endbreite (A/t) muss dem Layer-Sollwert entsprechen (1 mm Toleranz)."""
        for z in self.zeilen:
            if z["profil"].startswith("Flachstab") and z["A_start_m2"] is not None:
                typ, b, _, t = parse_profil(z["layer"])
                bmax = max(z["A_start_m2"], z["A_ende_m2"]) / t
                self.assertLess(abs(bmax - b), 0.001, msg=z["stab_id"])

    def test_flachstab_volumen_gegen_trapezformel(self):
        """Divergenzsatz am Brep-Netz und (A0+A1)/2*L müssen für OK-Flachstäbe übereinstimmen."""
        n = 0
        for z in self.zeilen:
            if z["profil"].startswith("Flachstab") and z["V_m3"] is not None:
                n += 1
                trap = (z["A_start_m2"] + z["A_ende_m2"]) / 2 * z["laenge_m"]
                # Länge ist auf 4 Stellen gerundet -> relative Toleranz 1e-3
                self.assertLess(abs(z["V_m3"] - trap) / trap, 0.001, msg=z["stab_id"])
        self.assertEqual(n, 502)

    def test_flachstab_volumen_direkt_aus_brep(self):
        """Stichprobe: Brep-Volumen direkt aus der Geometrie neu berechnen (unabhängig von Zeilen)."""
        bid = 1
        brep = self.index[bid]["breps"][0]["geom"]
        zeile = next(z for z in self.zeilen if z["rfem_beam_id"] == bid)
        self.assertAlmostEqual(brep_volume(brep), zeile["V_m3"], places=9)

    def test_rundrohr_modell_vollzylinder(self):
        """Rundrohre: Brep ist Vollzylinder mit D = 139,7 mm (kein Innenradius)."""
        n = 0
        for z in self.zeilen:
            if z["profil"].startswith("Rundrohr"):
                n += 1
                R = 0.1397 / 2
                self.assertAlmostEqual(z["A_m2"], math.pi * R * R, delta=2e-7, msg=z["stab_id"])
                self.assertAlmostEqual(z["V_m3"], z["A_m2"] * z["laenge_m"], delta=2e-6, msg=z["stab_id"])
                self.assertEqual(z["pruefstatus"], "PRÜFEN", msg=z["stab_id"])
        self.assertEqual(n, 12)

    def test_kasten_endflaeche_gemessen(self):
        """Kastenprofile: Endflächen ~249,5-249,75 cm² (499,5-500 mm Seiten), Volumen auf 0,01 % konsistent."""
        n = 0
        for z in self.zeilen:
            if z["profil"].startswith("Kasten"):
                n += 1
                self.assertEqual(z["pruefstatus"], "OK", msg=z["stab_id"])
                self.assertLess(z["abweichung_rel"], 0.0001, msg=z["stab_id"])
                self.assertAlmostEqual(z["A_start_m2"], 0.25, delta=0.0005, msg=z["stab_id"])
        self.assertEqual(n, 47)

    def test_rd12_wird_nicht_berechnet(self):
        for z in self.zeilen:
            if z["layer"] == "RD 12":
                self.assertEqual(z["pruefstatus"], "UNKLAR", msg=z["stab_id"])
                self.assertIsNone(z["A_m2"])
                self.assertIsNone(z["V_m3"])

    def test_excel_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            datei = Path(tmp) / "test.xlsx"
            schreibe_excel(self.zeilen, datei)
            wb = openpyxl.load_workbook(datei)
            self.assertEqual(wb.sheetnames, ["Detail", "Übersicht", "Zusammenfassung"])
            self.assertEqual(wb["Detail"].max_row - 1, 736)


if __name__ == "__main__":
    unittest.main()
