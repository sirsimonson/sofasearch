# Couch-Check

Kleine Web-App zur Auswertung von 71 geprüften Sofa-Links gegen ein definiertes
Kundenprofil (Maße, Longchair-Typ, Federung, Salbeigrün, Budget ≤ 1.500 €) –
inklusive anonymem Up-/Downvoting pro Couch.

**Live:** https://couches.141.147.52.165.sslip.io

> `deploy.sick-simon.de` ist die Coolify-Oberfläche selbst. Die App läuft als eigener
> Container neben Coolify und wird über Traefik geroutet. Der `sslip.io`-Host zeigt direkt
> auf die Server-IP (141.147.52.165) und braucht **keinen DNS-Eintrag**.

## Features

- Tabelle & Kartenansicht, sortierbar
- Filter: Suche, Preissegment, Händler, Maximalpreis, Mindest-Score,
  „nur Empfehlungen“, „Salbeigrün verfügbar“, Nicht-Sofas ausblenden
- Detail-Dialog je Couch: alle Maße, Stoffe/Farben, Features, Komfort-Interpretation,
  Kundenfeedback, 14-Punkte-Kriteriencheck und Händlerlink
- **Up-/Downvote pro Couch** (anonym, ein Vote pro Browser; umschaltbar/entfernbar)
- Votes liegen in SQLite (`/data/votes.db`), persistent über Deploys/Restarts

## Stack

- Backend: Python 3.12 + Flask + Gunicorn, SQLite (WAL)
- Frontend: statisches HTML/CSS/JS (kein Build-Schritt)
- Container: `python:3.12-slim`, Port 8000, Healthcheck `/healthz`

## Struktur

```
server.py               Flask-App: Static + /api/votes + /api/vote + /healthz
requirements.txt        flask, gunicorn
app/
  index.html            UI
  styles.css
  app.js                Filter, Sortierung, Detailansicht, Voting
  data.json             generierte Daten (71 Couches)
deploy/
  docker-compose.yml    Container + Traefik-Labels + SQLite-Volume
  traefik-couch-compare.yaml
scripts/export_web.py   erzeugt app/data.json aus results/*.json
scripts/e2e_votes.mjs   Playwright-E2E für den Vote-Flow
```

## API

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/votes?voter=<id>` | Summen aller Couches + eigenes Vote |
| POST | `/api/vote` | `{couchId, voterId, value: -1\|0\|1}`; 0 entfernt das Vote |
| GET | `/healthz` | Healthcheck |

Die Voter-ID ist eine zufällige UUID im `localStorage`; es gibt keine Accounts.

## Daten aktualisieren

```bash
python3 scripts/export_web.py
```

## Lokal testen

```bash
docker build -t couch-compare:test .
docker run --rm -p 8100:8000 -v /tmp/couch-data:/data couch-compare:test
# http://localhost:8100
```

E2E (laufende Instanz vorausgesetzt):

```bash
npm install
node scripts/e2e_votes.mjs http://localhost:8100
```

## Deployment

- Server: `141.147.52.165`, User `ubuntu`, Pfad `/opt/couch-compare`
- Update:
  ```bash
  cd /opt/couch-compare
  git pull
  sudo docker build -t couch-compare:latest .
  sudo docker compose -p couch-compare -f deploy/docker-compose.yml up -d
  ```
- SQLite-Volume: `/data/couch-votes` auf dem Host → `/data` im Container
- Traefik: `deploy/traefik-couch-compare.yaml` → `/data/coolify/proxy/dynamic/couch-compare.yaml`

Alternativ als Coolify-App: Public Repository `https://github.com/sirsimonson/sofasearch`,
Build Pack **Dockerfile**, Port **8000**, Volume für `/data`, Domain setzen.
