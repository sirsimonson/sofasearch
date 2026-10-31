(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

  let DATA = [];
  let view = "table";
  let VOTES = {};
  let MINE = {};
  const VOTER = (() => {
    try {
      let v = localStorage.getItem("couch-voter");
      if (!v) {
        v = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, 32);
        localStorage.setItem("couch-voter", v);
      }
      return v;
    } catch (_) {
      return "anon" + Math.random().toString(36).slice(2, 12);
    }
  })();

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const scoreClass = (s) => (s >= 6.5 ? "high" : s >= 4 ? "mid" : "low");
  const cm = (v) => (typeof v === "number" ? `${v} cm` : "–");
  const colorLabel = (c) => {
    const st = c.kriterien?.farbe_salbei;
    return st === "erfüllt" ? "Salbeigrün" : st === "teilweise" ? "grün (Näherung)" : st === "nicht" ? "kein Salbei" : "Farbe unklar";
  };
  const colorCell = (c) => {
    const st = c.kriterien?.farbe_salbei;
    if (st === "erfüllt") return '<span class="badge sage">Salbei</span>';
    if (st === "teilweise") return '<span class="badge warn">grün</span>';
    if (st === "nicht") return '<span class="tag">kein Salbei</span>';
    return '<span class="tag">unklar</span>';
  };
  const dims = (c) => (c.breite || c.tiefe || c.hoehe ? `${c.breite ?? "?"} × ${c.tiefe ?? "?"} × ${c.hoehe ?? "?"} cm` : "Maße unbekannt");

  fetch("data.json")
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((d) => {
      DATA = d.items || [];
      initRetailers();
      renderStats();
      bind();
      render();
      loadVotes();
    })
    .catch((err) => {
      $("#count").textContent = "Daten konnten nicht geladen werden";
      $("#hint").textContent = String(err.message || err);
    });

  function initRetailers() {
    const shops = [...new Set(DATA.map((c) => c.haendler))].sort((a, b) => a.localeCompare(b, "de"));
    const sel = $("#retailer");
    for (const s of shops) {
      const o = document.createElement("option");
      o.value = s; o.textContent = s;
      sel.appendChild(o);
    }
  }

  function voteMarkup(id, compact = false) {
    const v = VOTES[id] || { up: 0, down: 0 };
    const m = MINE[id] || 0;
    return `<div class="votes${compact ? " compact" : ""}" data-votes-for="${esc(id)}">
      <button type="button" class="vote up${m === 1 ? " active" : ""}" data-id="${esc(id)}" data-vote="1" title="Upvote" aria-label="Upvote">▲ <span data-up>${v.up}</span></button>
      <button type="button" class="vote down${m === -1 ? " active" : ""}" data-id="${esc(id)}" data-vote="-1" title="Downvote" aria-label="Downvote">▼ <span data-down>${v.down}</span></button>
    </div>`;
  }

  function syncVotes(id) {
    document.querySelectorAll(`[data-votes-for="${id}"]`).forEach((box) => {
      const v = VOTES[id] || { up: 0, down: 0 };
      const m = MINE[id] || 0;
      box.querySelector("[data-up]").textContent = v.up;
      box.querySelector("[data-down]").textContent = v.down;
      box.querySelector(".vote.up").classList.toggle("active", m === 1);
      box.querySelector(".vote.down").classList.toggle("active", m === -1);
    });
  }

  async function loadVotes() {
    try {
      const r = await fetch(`/api/votes?voter=${encodeURIComponent(VOTER)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      VOTES = d.totals || {};
      MINE = d.mine || {};
      if (view === "table") renderTable(filtered()); else renderCards(filtered());
    } catch (err) {
      console.warn("Votes konnten nicht geladen werden:", err);
    }
  }

  async function handleVote(id, value) {
    const prevMine = MINE[id] || 0;
    const prev = VOTES[id] || { up: 0, down: 0 };
    const next = prevMine === value ? 0 : value;
    const optimistic = { up: prev.up, down: prev.down };
    if (prevMine === 1) optimistic.up--;
    if (prevMine === -1) optimistic.down--;
    if (next === 1) optimistic.up++;
    if (next === -1) optimistic.down++;
    VOTES[id] = optimistic;
    MINE[id] = next;
    syncVotes(id);
    try {
      const r = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couchId: id, voterId: VOTER, value: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      VOTES[id] = { up: d.up, down: d.down };
      MINE[id] = d.mine;
      syncVotes(id);
    } catch (err) {
      VOTES[id] = prev;
      MINE[id] = prevMine;
      syncVotes(id);
      console.warn("Vote fehlgeschlagen:", err);
    }
  }

  function renderStats() {
    const real = DATA.filter((c) => !c.nonproduct);
    const rec = DATA.filter((c) => c.empfehlung).length;
    const budget = real.filter((c) => c.preis !== null && c.preis <= 1500).length;
    const avg = real.reduce((a, c) => a + c.score, 0) / (real.length || 1);
    const best = Math.max(...real.map((c) => c.score));
    $("#stats").innerHTML = `
      <div class="stat"><b>${DATA.length}</b><span>Links geprüft</span></div>
      <div class="stat accent"><b>${rec}</b><span>Empfehlungen (beste Näherung)</span></div>
      <div class="stat"><b>${budget}</b><span>im Budget ≤ 1.500 €</span></div>
      <div class="stat"><b>${avg.toFixed(1).replace(".", ",")}</b><span>Ø Score · bester ${best.toFixed(1).replace(".", ",")}/10</span></div>`;
  }

  function bind() {
    ["#q", "#segment", "#retailer", "#sort", "#maxPrice", "#minScore", "#onlyRec", "#onlySalbei", "#hideNon"].forEach((s) => {
      const el = $(s);
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    $("#maxPrice").addEventListener("input", () => { $("#maxPriceOut").textContent = eur.format(+$("#maxPrice").value); });
    $("#minScore").addEventListener("input", () => { $("#minScoreOut").textContent = (+$("#minScore").value).toFixed(1).replace(".", ","); });
    $("#reset").addEventListener("click", reset);
    $("#viewTable").addEventListener("click", () => setView("table"));
    $("#viewCards").addEventListener("click", () => setView("cards"));
    $("#closeDetail").addEventListener("click", () => $("#detail").close());
    $("#detail").addEventListener("click", (e) => { if (e.target === $("#detail")) $("#detail").close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#detail").open) $("#detail").close(); });
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-vote]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      handleVote(btn.dataset.id, Number(btn.dataset.vote));
    }, true);
  }

  function reset() {
    $("#q").value = "";
    $("#segment").value = "";
    $("#retailer").value = "";
    $("#sort").value = "score";
    $("#maxPrice").value = 1500;
    $("#maxPriceOut").textContent = "1.500 €";
    $("#minScore").value = 0;
    $("#minScoreOut").textContent = "0";
    $("#onlyRec").checked = false;
    $("#onlySalbei").checked = false;
    $("#hideNon").checked = true;
    render();
  }

  function setView(v) {
    view = v;
    $("#viewTable").classList.toggle("active", v === "table");
    $("#viewCards").classList.toggle("active", v === "cards");
    $("#tableView").hidden = v !== "table";
    $("#cardView").hidden = v !== "cards";
    if (DATA.length) render();
  }

  function filtered() {
    const q = $("#q").value.trim().toLowerCase();
    const segment = $("#segment").value;
    const retailer = $("#retailer").value;
    const maxPrice = +$("#maxPrice").value;
    const minScore = +$("#minScore").value;
    const onlyRec = $("#onlyRec").checked;
    const onlySalbei = $("#onlySalbei").checked;
    const hideNon = $("#hideNon").checked;

    let list = DATA.filter((c) => {
      if (hideNon && c.nonproduct) return false;
      if (segment && c.segment !== segment) return false;
      if (retailer && c.haendler !== retailer) return false;
      if (onlyRec && !c.empfehlung) return false;
      if (onlySalbei && !c.salbei) return false;
      if (c.preis !== null && c.preis > maxPrice) return false;
      if (c.score < minScore) return false;
      if (q) {
        const hay = [c.id, c.titel, c.haendler, c.hersteller, c.stoffe, c.note, c.fazit, c.features.join(" "), c.feedback].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sort = $("#sort").value;
    const num = (v) => (v === null || v === undefined ? Infinity : v);
    list.sort((a, b) => {
      if (sort === "price-asc") return num(a.preis) - num(b.preis);
      if (sort === "price-desc") return num(b.preis) - num(a.preis) || b.score - a.score;
      if (sort === "width") return num(a.breite) - num(b.breite);
      if (sort === "id") return a.id.localeCompare(b.id);
      return b.score - a.score || num(a.preis) - num(b.preis);
    });
    return list;
  }

  function render() {
    const list = filtered();
    $("#count").textContent = `${list.length} von ${DATA.length} Couches`;
    $("#hint").textContent = `${list.filter((c) => c.empfehlung).length} Empfehlungen in dieser Auswahl`;
    $("#empty").hidden = list.length > 0;
    if (view === "table") renderTable(list); else renderCards(list);
  }

  function renderTable(list) {
    $("#tbody").innerHTML = list.map((c) => {
      const price = c.preis === null ? "unbekannt" : eur2.format(c.preis);
      const seg = c.segment === "unbekannt" ? "" : c.segment.replace("<", "&lt;");
      const badges = [
        c.duplicate ? `<span class="badge dup">Duplikat von ${esc(c.duplicate)}</span>` : "",
        c.nonproduct ? `<span class="badge warn">kein Sofa</span>` : "",
      ].join(" ");
      return `<tr tabindex="0" data-id="${esc(c.id)}">
        <td><span class="score ${scoreClass(c.score)}">${c.score.toFixed(1).replace(".", ",")}</span></td>
        <td>
          <div class="title">${esc(c.titel)} ${badges}<small>#${esc(c.id)} · ${esc(c.hersteller)}${c.nonproduct ? " · " + esc(c.nonproduct) : ""}</small></div>
        </td>
        <td><div class="price">${price}<small>${seg}</small></div></td>
        <td><div class="dim">${dims(c)}<small>${c.sitzhoehe ? "Sitzhöhe " + cm(c.sitzhoehe) : "Sitzhöhe k. A."}</small></div></td>
        <td>${cm(c.sitzhoehe)}</td>
        <td class="tag">${esc(c.haendler)}</td>
        <td>${colorCell(c)}</td>
        <td class="c-vote">${voteMarkup(c.id, true)}</td>
        <td>${c.empfehlung ? '<span class="badge yes">ja</span>' : '<span class="badge no">nein</span>'}</td>
      </tr>`;
    }).join("");

    $("#tbody").querySelectorAll("tr").forEach((tr) => {
      const open = () => openDetail(tr.dataset.id);
      tr.addEventListener("click", open);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  function renderCards(list) {
    $("#cardView").innerHTML = list.map((c) => `
      <article class="card" tabindex="0" data-id="${esc(c.id)}">
        <div class="card-top">
          <h3>${esc(c.titel)}</h3>
          <span class="score ${scoreClass(c.score)}">${c.score.toFixed(1).replace(".", ",")}</span>
        </div>
        <div class="meta">
          <span>${esc(c.haendler)}</span>
          <span>${c.preis === null ? "Preis unbekannt" : eur2.format(c.preis)}</span>
          ${c.empfehlung ? '<span class="badge yes">Empfehlung</span>' : ""}
          ${c.duplicate ? `<span class="badge dup">Duplikat ${esc(c.duplicate)}</span>` : ""}
          ${c.nonproduct ? '<span class="badge warn">kein Sofa</span>' : ""}
        </div>
        <div class="facts">
          <div><span>Maße</span><b>${dims(c)}</b></div>
          <div><span>Sitzhöhe</span><b>${cm(c.sitzhoehe)}</b></div>
          <div><span>Farbe</span><b>${colorLabel(c)}</b></div>
          <div><span>Récamiere</span><b>${cm(c.recamiere)}</b></div>
        </div>
        <p class="why">${esc(c.fazit || c.komfort)}</p>
        <div class="card-vote">${voteMarkup(c.id)}</div>
      </article>`).join("");

    $("#cardView").querySelectorAll(".card").forEach((el) => {
      const open = () => openDetail(el.dataset.id);
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  function openDetail(id) {
    const c = DATA.find((x) => x.id === id);
    if (!c) return;
    const crit = Object.keys(c.labels).map((k) => {
      const st = c.kriterien[k] || "ungeprüft";
      return `<div><span>${esc(c.labels[k])}</span><span class="st ${esc(st)}">${esc(st)}</span></div>`;
    }).join("");
    const features = c.features.length ? `<ul>${c.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "<p>k. A.</p>";
    const price = c.preis === null ? "unbekannt" : eur2.format(c.preis);
    $("#detailBody").innerHTML = `
      <div class="d-head">
        <div>
          <h2 id="dTitle">${esc(c.titel)}</h2>
          <div class="d-meta">#${esc(c.id)} · ${esc(c.hersteller)} · ${esc(c.haendler)}</div>
        </div>
        <div class="d-price"><b>${price}</b><span>${esc(c.segment)}</span></div>
      </div>
      <div class="d-actions">
        <a class="btn" href="${esc(c.link)}" target="_blank" rel="noopener">Beim Händler ansehen ↗</a>
        <span class="score ${scoreClass(c.score)}">${c.score.toFixed(1).replace(".", ",")} / 10</span>
        ${c.empfehlung ? '<span class="badge yes">Empfehlung</span>' : '<span class="badge no">keine Empfehlung</span>'}
        ${c.salbei ? '<span class="badge sage">Salbei verfügbar</span>' : ""}
        ${c.duplicate ? `<span class="badge dup">Duplikat von ${esc(c.duplicate)}</span>` : ""}
        ${c.nonproduct ? `<span class="badge warn">${esc(c.nonproduct)}</span>` : ""}
      </div>
      <div class="d-vote">${voteMarkup(c.id)}</div>
      <div class="d-grid">
        <div class="d-block">
          <h4>Maße</h4>
          <p>${dims(c)}${c.sitzhoehe ? ` · Sitzhöhe ${cm(c.sitzhoehe)}` : ""}<br>
          Sitzfläche: ${esc(c.sitzflaeche)}<br>
          Récamiere: ${cm(c.recamiere)} · Liegefläche: ${esc(c.liegeflaeche)}</p>
          ${c.masse_begruendung ? `<p class="muted" style="margin-top:6px">${esc(c.masse_begruendung)}</p>` : ""}
        </div>
        <div class="d-block">
          <h4>Stoffe & Farben</h4>
          <p>${esc(c.stoffe)}</p>
        </div>
        <div class="d-block d-full">
          <h4>Features & Besonderheiten</h4>
          ${features}
        </div>
        <div class="d-block d-full">
          <h4>Sitzkomfort (Interpretation)</h4>
          <p>${esc(c.komfort)}</p>
        </div>
        <div class="d-block d-full">
          <h4>Kundenfeedback</h4>
          <p>${esc(c.feedback)}</p>
        </div>
        <div class="d-block d-full">
          <h4>Kriterien-Check</h4>
          <div class="crit">${crit}</div>
        </div>
        <div class="d-block d-full">
          <h4>Fazit</h4>
          <p>${esc(c.fazit || "–")}</p>
        </div>
      </div>`;
    $("#detail").showModal();
  }
})();
