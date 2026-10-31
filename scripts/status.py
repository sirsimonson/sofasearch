#!/usr/bin/env python3
"""Track progress: which links are done, valid, missing, invalid."""
import json, os, glob, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
links = json.load(open(os.path.join(BASE, "links.json"), encoding="utf-8"))
KEYS = ["breite_265_285","tiefe_160_220","sitzhoehe_38_42","hoehe_68_75",
        "modultyp_longchair","platz_2_personen_110_130","ausstrecklaenge_140",
        "design_bodennah","unterfederung_nosag","polsterkern_hr","sitzgefuehl_weich",
        "farbe_salbei","bezug_weiche_haptik","budget_max_1500"]
STAT = {"erfüllt","teilweise","nicht","ungeprüft"}

valid, invalid, missing = [], [], []
for item in links:
    p = os.path.join(BASE, "results", item["id"] + ".json")
    if not os.path.exists(p):
        missing.append(item["id"]); continue
    try:
        d = json.load(open(p, encoding="utf-8"))
        assert d.get("id") == item["id"]
        k = d["kriterien"]
        assert set(KEYS) <= set(k), "keys missing"
        assert all(k[x] in STAT for x in KEYS), "bad status"
        valid.append(item["id"])
    except Exception as e:
        invalid.append((item["id"], str(e)[:80]))

print(f"TOTAL {len(links)} | VALID {len(valid)} | INVALID {len(invalid)} | MISSING {len(missing)}")
if invalid:
    print("INVALID:", invalid)
if missing:
    print("MISSING:", " ".join(missing))
