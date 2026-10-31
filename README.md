# Couch-Check

Kleine statische Web-App zur Auswertung von 71 geprüften Sofa-Links gegen ein definiertes
Kundenprofil (Maße, Longchair-Typ, Federung, Salbeigrün, Budget ≤ 1.500 €).

**Live:** https://couches.141.147.52.165.sslip.io

> `deploy.sick-simon.de` ist die Coolify-Oberfläche selbst. Die App läuft aktuell als eigener
> Container neben Coolify und wird über Traefik geroutet. Der `sslip.io`-Host zeigt direkt auf
> die Server-IP (141.147.52.165) und braucht **keinen DNS-Eintrag**.

## Features

- Tabelle & Kartenansicht, sortierbar
- Filter: Suche, Preissegment, Händler, Maximalpreis, Mindest-Score,
  „nur Empfehlungen“, „Salbeigrün verfügbar“, Nicht-Sofas ausblenden
- Detail-Dialog je Couch: alle Maße, Stoffe/Farben, Features, Komfort-Interpretation,
  Kundenfeedback, 14-Punkte-Kriteriencheck und Händlerlink
- Vollständig statisch (HTML/CSS/JS + `app/data.json`), kein Backend nötig

## Struktur

```
app/
  index.html      UI
  styles.css
  app.js          Filter, Sortierung, Detailansicht
  data.json       generierte Daten (71 Couches)
Dockerfile        nginx:alpine, Port 80, /healthz
nginx.conf        gzip, Caching, Security-Header
scripts/export_web.py   erzeugt app/data.json aus results/*.json
```

## Daten aktualisieren

```bash
python3 scripts/export_web.py
```

Danach committen/pushen – Coolify redeployt.

## Lokal testen

```bash
cd app && python3 -m http.server 8080
# http://localhost:8080
```

## Deployment (Coolify)

- Build Pack: Dockerfile
- Port: 80
- Standalone: `deploy/docker-compose.yml` + `deploy/traefik-couch-compare.yaml`
- Coolify-managed (Alternative): App aus diesem Repo, Build Pack Dockerfile, Port 80, Domain `couches.sick-simon.de`
- Healthcheck: `/healthz`
- Keine Umgebungsvariablen, kein Volume nötig
