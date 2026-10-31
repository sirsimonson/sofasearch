#!/usr/bin/env python3
"""Couch-Check server: static app + anonymous per-device voting persisted in SQLite."""

import json
import os
import re
import sqlite3
import time

from flask import Flask, g, jsonify, request, send_from_directory

BASE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(BASE, "app")
DATA_DIR = os.environ.get("DATA_DIR", "/data")
DB_PATH = os.path.join(DATA_DIR, "votes.db")
VOTER_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

with open(os.path.join(APP_DIR, "data.json"), encoding="utf-8") as fh:
    VALID_IDS = {item["id"] for item in json.load(fh)["items"]}

os.makedirs(DATA_DIR, exist_ok=True)

app = Flask(__name__, static_folder=None)


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, timeout=5)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA busy_timeout=5000")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS votes (
               couch_id   TEXT NOT NULL,
               voter_id   TEXT NOT NULL,
               value      INTEGER NOT NULL CHECK (value IN (-1, 1)),
               updated_at REAL NOT NULL,
               PRIMARY KEY (couch_id, voter_id)
           )"""
    )
    conn.commit()
    conn.close()


init_db()


def totals():
    rows = db().execute(
        """SELECT couch_id,
                  SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END)  AS up,
                  SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS down
             FROM votes GROUP BY couch_id"""
    ).fetchall()
    return {r["couch_id"]: {"up": r["up"] or 0, "down": r["down"] or 0} for r in rows}


def mine(voter_id):
    if not voter_id:
        return {}
    rows = db().execute(
        "SELECT couch_id, value FROM votes WHERE voter_id = ?", (voter_id,)
    ).fetchall()
    return {r["couch_id"]: r["value"] for r in rows}


@app.get("/api/votes")
def get_votes():
    voter = request.args.get("voter", "")
    if voter and not VOTER_RE.match(voter):
        return jsonify({"error": "invalid voter id"}), 400
    return jsonify({"totals": totals(), "mine": mine(voter)})


@app.post("/api/vote")
def vote():
    body = request.get_json(silent=True) or {}
    couch_id = str(body.get("couchId", ""))
    voter_id = str(body.get("voterId", ""))
    value = body.get("value")

    if couch_id not in VALID_IDS:
        return jsonify({"error": "unknown couch"}), 400
    if not VOTER_RE.match(voter_id):
        return jsonify({"error": "invalid voter id"}), 400
    if value not in (-1, 0, 1):
        return jsonify({"error": "value must be -1, 0 or 1"}), 400

    now = time.time()
    if value == 0:
        db().execute(
            "DELETE FROM votes WHERE couch_id = ? AND voter_id = ?",
            (couch_id, voter_id),
        )
    else:
        db().execute(
            """INSERT INTO votes (couch_id, voter_id, value, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(couch_id, voter_id)
               DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at""",
            (couch_id, voter_id, value, now),
        )
    db().commit()

    row = db().execute(
        """SELECT SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END)  AS up,
                  SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS down
             FROM votes WHERE couch_id = ?""",
        (couch_id,),
    ).fetchone()
    return jsonify(
        {
            "couchId": couch_id,
            "up": row["up"] or 0,
            "down": row["down"] or 0,
            "mine": value,
        }
    )


@app.get("/healthz")
def healthz():
    db().execute("SELECT 1")
    return "ok\n", 200, {"Content-Type": "text/plain"}


@app.after_request
def headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return resp


@app.get("/")
def index():
    resp = send_from_directory(APP_DIR, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/<path:path>")
def static_files(path):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    full = os.path.join(APP_DIR, path)
    if os.path.isfile(full):
        resp = send_from_directory(APP_DIR, path)
        resp.headers["Cache-Control"] = (
            "public, max-age=300" if path == "data.json" else "public, max-age=60"
        )
        return resp
    return jsonify({"error": "not found"}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
