#!/usr/bin/env python3
"""Aggregate validated results into CSV files.

Scoring: erfüllt=1.0, teilweise=0.5, nicht=0.0, ungeprüft=0.0
score = round(points / 14 * 10, 1)
Caps: Preis > 1500 EUR -> max 4.0; Modultyp 'nicht' (kein passendes Sofa) -> max 3.0
Empfehlung = ja, wenn score >= 6.5, Preis <= 1500, Farbe, Breite und Modultyp
jeweils 'erfüllt' oder 'teilweise' (keine harten Ausschlüsse).
"""
import csv, json, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "out")
os.makedirs(OUT, exist_ok=True)
links = json.load(open(os.path.join(BASE, "links.json"), encoding="utf-8"))

KEYS = ["breite_265_285","tiefe_160_220","sitzhoehe_38_42","hoehe_68_75",
        "modultyp_longchair","platz_2_personen_110_130","ausstrecklaenge_140",
        "design_bodennah","unterfederung_nosag","polsterkern_hr","sitzgefuehl_weich",
        "farbe_salbei","bezug_weiche_haptik","budget_max_1500"]
LABEL = {
 "breite_265_285":"Breite 265-285 cm","tiefe_160_220":"Tiefe 160-220 cm",
 "sitzhoehe_38_42":"Sitzhöhe 38-42 cm","hoehe_68_75":"Höhe 68-75 cm",
 "modultyp_longchair":"Longchair XL / kein klass. Ecksofa",
 "platz_2_personen_110_130":"Recamiere 110-130 cm, 2 Personen",
 "ausstrecklaenge_140":"Ausstrecklänge >= 140 cm","design_bodennah":"Bodennahes Lounge-Design",
 "unterfederung_nosag":"Wellen-/Nosagfederung","polsterkern_hr":"HR-Kaltschaum",
 "sitzgefuehl_weich":"Weiches Einsinkgefühl","farbe_salbei":"Salbeigrün",
 "bezug_weiche_haptik":"Weiche Bezugshaptik","budget_max_1500":"Budget <= 1500 EUR"}
NONPRODUCT = {"015":"Polsterhocker, kein Sofa","023":"Bewertungsseite, kein Produkt","057":"Listing-/Filtereseite, kein Einzelprodukt"}

HEADER = ["Nr/ID","Preis","Preissegment(<1000, >=1000<1500, <=1500)","Link","Händler","Hersteller",
          "Maße korrekt?","Sitzkomfort angemessen?","Farbe passend?","Empfehlung(ja/nein)",
          "Kriterienerfüllung(1-10)","Erfüllte Kriterien","Nicht-Erfüllte Kriterien",
          "Ungeprüfte Kriterien(fehlende Kriterien listen)","Fazit"]
DETAIL_HEADER = ["Nr/ID","Titel","Preis","Preissegment","Link","Händler","Hersteller","Maße",
                 "Maße korrekt?","Sitzfläche","Récamiere-Breite","Liegefläche","Stoffe & Farben",
                 "Features & Besonderheiten","Sitzkomfort-Interpretation","Kundenfeedback",
                 "Erfüllte Kriterien","Teilweise erfüllt","Nicht erfüllt","Ungeprüft","Score","Empfehlung","Fazit"]

def seg(preis):
    if preis is None: return "unbekannt"
    if preis < 1000: return "<1000"
    if preis < 1500: return ">=1000<1500"
    return ">1500"

def fmt_eur(p):
    if p is None: return "unbekannt"
    return f"{p:,.2f} EUR".replace(",", "X").replace(".", ",").replace("X", ".")

rows, details, missing = [], [], []
for item in links:
    p = os.path.join(BASE, "results", item["id"] + ".json")
    if not os.path.exists(p):
        missing.append(item["id"]); continue
    d = json.load(open(p, encoding="utf-8"))
    k = d["kriterien"]
    price = d.get("preis_eur")
    if isinstance(price, str):
        try: price = float(price.replace("€","").replace(".","").replace(",",".").strip())
        except Exception: price = None
    pts = sum(1.0 if k[x]=="erfüllt" else 0.5 if k[x]=="teilweise" else 0.0 for x in KEYS)
    score = round(pts/14*10, 1)
    if price is not None and price > 1500: score = min(score, 4.0)
    if k.get("modultyp_longchair") == "nicht": score = min(score, 3.0)
    if item["id"] in NONPRODUCT: score = 0.0
    fulfilled = [LABEL[x] for x in KEYS if k[x]=="erfüllt"]
    partial   = [LABEL[x] for x in KEYS if k[x]=="teilweise"]
    failed    = [LABEL[x] for x in KEYS if k[x]=="nicht"]
    unknown   = [LABEL[x] for x in KEYS if k[x]=="ungeprüft"]
    empfehlung = "ja" if (score >= 6.5 and (price or 0) <= 1500 and price is not None
                          and k.get("farbe_salbei") in ("erfüllt", "teilweise")
                          and k.get("breite_265_285") in ("erfüllt", "teilweise")
                          and k.get("modultyp_longchair") in ("erfüllt", "teilweise")
                          and item["id"] not in NONPRODUCT) else "nein"
    m = d.get("masse") or {}
    def cm(v): return f"{v:g} cm" if isinstance(v,(int,float)) else "k. A."
    masse = f"B {cm(m.get('breite_cm'))} x T {cm(m.get('tiefe_cm'))} x H {cm(m.get('hoehe_cm'))} | Sitzhöhe {cm(m.get('sitzhoehe_cm'))}"
    if item["id"] in NONPRODUCT:
        fazit = NONPRODUCT[item["id"]] + ". " + (d.get("fazit") or d.get("weitere_anmerkungen") or "")
        empfehlung = "nein"
    else:
        fazit = d.get("fazit") or d.get("weitere_anmerkungen") or ""
        if not fazit:
            fazit = (f"{len(fulfilled)} von 14 Kriterien klar erfüllt, {len(partial)} teilweise, "
                     f"{len(failed)} nicht, {len(unknown)} ungeprüft. "
                     + ("Preis über Budget." if price and price>1500 else ""))
    rows.append([item["id"], fmt_eur(price), seg(price), d.get("link") or item["url"],
                 d.get("haendler") or item["retailer"], d.get("hersteller") or "unbekannt",
                 d.get("masse_korrekt") or "ungeprüft",
                 "ja" if k.get("sitzgefuehl_weich") in ("erfüllt","teilweise") else "nein",
                 "ja" if k.get("farbe_salbei") in ("erfüllt","teilweise") else "nein",
                 empfehlung, score,
                 "; ".join(fulfilled) or "-", "; ".join(failed) or "-",
                 "; ".join(unknown) or "-", fazit])
    details.append([item["id"], d.get("titel") or item["note"], fmt_eur(price), seg(price),
                    d.get("link") or item["url"], d.get("haendler") or item["retailer"],
                    d.get("hersteller") or "unbekannt", masse,
                    d.get("masse_korrekt") or "ungeprüft",
                    m.get("sitzflaeche") or "k. A.", cm(m.get("recamiere_breite_cm")),
                    m.get("liegeflaeche") or "k. A.", d.get("stoffe_farben") or "k. A.",
                    " | ".join(d.get("features") or []) or "k. A.",
                    d.get("sitzkomfort_interpretation") or "k. A.",
                    d.get("kundenfeedback") or "keine Bewertungen gefunden",
                    "; ".join(fulfilled) or "-", "; ".join(partial) or "-",
                    "; ".join(failed) or "-", "; ".join(unknown) or "-", score, empfehlung, fazit])

def write(path, header, data):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        w.writerow(header); w.writerows(data)

write(os.path.join(BASE, "couch_vergleich.csv"), HEADER, rows)
write(os.path.join(BASE, "couch_details.csv"), DETAIL_HEADER, details)

# Kombinierte Volldatei: Pflichtspalten + Detailspalten
COMBINED = HEADER + [h for h in DETAIL_HEADER if h not in ("Nr/ID", "Preis", "Preissegment",
                     "Link", "Händler", "Hersteller", "Maße korrekt?", "Erfüllte Kriterien", "Fazit")]
combined = [r + [d[i] for i, h in enumerate(DETAIL_HEADER)
                 if h in COMBINED[len(HEADER):]] for r, d in zip(rows, details)]
write(os.path.join(BASE, "couch_gesamt.csv"), COMBINED, combined)
write(os.path.join(OUT, "couch_vergleich.csv"), HEADER, rows)
write(os.path.join(OUT, "couch_details.csv"), DETAIL_HEADER, details)
write(os.path.join(OUT, "couch_gesamt.csv"), COMBINED, combined)

print(f"rows={len(rows)} missing={len(missing)}")
print("empfohlen:", sum(1 for r in rows if r[9]=="ja"))
if missing: print("MISSING:", " ".join(missing))
