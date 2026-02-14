(() => {
  const cfg = window.APP_CONFIG || {};
  const ENDPOINT = cfg.ENDPOINT;
  const CLIENT_ID = cfg.CLIENT_ID;

  const $ = (id) => document.getElementById(id);

  // Imposta client_id dentro g_id_onload
  const gload = $('g_id_onload');
  if (gload && CLIENT_ID) gload.setAttribute('data-client_id', CLIENT_ID);

  let idToken = null;

  // Tabella lievito fresco (% su farina)
  const YEAST_TABLE = {
    temps: [18, 20, 22, 24, 26, 28, 30],
    bands: ["4-5", "8-12", "12-18", "18-24"],
    values: [
      [0.60, 0.20, 0.12, 0.08],
      [0.70, 0.25, 0.15, 0.10],
      [0.80, 0.35, 0.20, 0.12],
      [0.90, 0.45, 0.25, 0.15],
      [1.00, 0.55, 0.30, 0.18],
      [1.10, 0.65, 0.35, 0.20],
      [1.20, 0.75, 0.40, 0.22],
    ]
  };

  // ===== Auth callback =====
  window.onGoogleCredential = function (response) {
    idToken = response.credential;

    // UI: mostra blocco "loggedIn"
    if ($('loggedOut')) $('loggedOut').style.display = "none";
    if ($('loggedIn')) $('loggedIn').style.display = "block";

    if ($('saveBtn')) $('saveBtn').disabled = false;
    if ($('openHistoryBtn')) $('openHistoryBtn').disabled = false;

    if ($('who')) $('who').textContent = "Login OK";
  };

  // ===== Utils =====
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function interpLinear(x, x0, y0, x1, y1) {
    if (x1 === x0) return y0;
    const t = (x - x0) / (x1 - x0);
    return y0 + t * (y1 - y0);
  }
  function round(n, d = 0) {
    const p = Math.pow(10, d);
    return Math.round(n * p) / p;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function formatTs(ts) {
    try { return new Date(ts).toLocaleString('it-IT'); }
    catch { return String(ts || ""); }
  }
  function fmtCell(v) {
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }

  // ===== Calcolo =====
  function yeastPercent(tempC, band) {
    const { temps, bands, values } = YEAST_TABLE;
    const j = bands.indexOf(band);
    if (j < 0) throw new Error("Fascia ore non valida: " + band);

    const t = clamp(tempC, temps[0], temps[temps.length - 1]);

    let i = 0;
    while (i < temps.length - 1 && t > temps[i + 1]) i++;

    const t0 = temps[i], t1 = temps[i + 1] ?? temps[i];
    const y0 = values[i][j];
    const y1 = (i < temps.length - 1) ? values[i + 1][j] : values[i][j];

    return interpLinear(t, t0, y0, t1, y1);
  }

  function getInputsFromUI() {
    return {
      panetti: Number($('panetti').value),
      peso_panetto: Number($('peso_panetto').value),
      idratazione: Number($('idratazione').value),
      temp: Number($('temp').value),
      fascia_ore: $('fascia_ore').value,
      sale_pct: Number($('sale_pct').value),
      olio_pct: Number($('olio_pct').value),
    };
  }

  function validateInputs(i) {
    if (!Number.isFinite(i.panetti) || i.panetti <= 0) throw new Error("Panetti non valido");
    if (!Number.isFinite(i.peso_panetto) || i.peso_panetto <= 0) throw new Error("Peso panetto non valido");
    if (i.idratazione < 50 || i.idratazione > 90) throw new Error("Idratazione fuori range (50–90)");
    if (i.temp < 18 || i.temp > 30) throw new Error("Temperatura fuori range (18–30)");
    if (i.sale_pct < 1.6 || i.sale_pct > 2.2) throw new Error("Sale: tienilo 1,6–2,2%");
    if (i.olio_pct < 0 || i.olio_pct > 10) throw new Error("Olio: 0–10%");
    if (!YEAST_TABLE.bands.includes(i.fascia_ore)) throw new Error("Fascia ore non valida");
  }

  function calcRecipe(inputs) {
    const total = inputs.panetti * inputs.peso_panetto;

    const H = inputs.idratazione / 100;
    const S = inputs.sale_pct / 100;
    const O = inputs.olio_pct / 100;

    const yeastPct = yeastPercent(inputs.temp, inputs.fascia_ore); // es 0.35
    const Y = yeastPct / 100; // frazione

    const flour = total / (1 + H + S + O + Y);
    const water = flour * H;
    const salt = flour * S;
    const oil = flour * O;
    const yeastFresh = flour * Y;
    const yeastDry = yeastFresh / 3;

    return {
      totale_impasto_g: round(total, 0),
      lievito_pct: round(yeastPct, 3),
      farina_g: round(flour, 0),
      acqua_g: round(water, 0),
      sale_g: round(salt, 1),
      olio_g: round(oil, 1),
      lievito_fresco_g: round(yeastFresh, 2),
      lievito_secco_g: round(yeastDry, 2),
    };
  }

  function renderRecipe(out) {
    $('out').innerHTML =
      `<p><strong>Totale impasto:</strong> ${out.totale_impasto_g} g<br>
          <strong>Lievito (tabella):</strong> ${out.lievito_pct}%</p>
       <hr>
       <p>
         <strong>Farina:</strong> ${out.farina_g} g<br>
         <strong>Acqua:</strong> ${out.acqua_g} g<br>
         <strong>Sale:</strong> ${out.sale_g} g<br>
         <strong>Olio:</strong> ${out.olio_g} g<br>
         <strong>Lievito fresco:</strong> ${out.lievito_fresco_g} g<br>
         <strong>Lievito secco:</strong> ${out.lievito_secco_g} g
       </p>`;
  }

  function recalc() {
    try {
      const inputs = getInputsFromUI();
      validateInputs(inputs);
      const out = calcRecipe(inputs);
      renderRecipe(out);
      if ($('calcState')) $('calcState').textContent = "";
      return { inputs, out };
    } catch (e) {
      if ($('out')) $('out').innerHTML = "";
      if ($('calcState')) $('calcState').textContent = String(e.message || e);
      return null;
    }
  }

  // ===== Salvataggio =====
  async function saveExperiment() {
    if (!idToken) return alert("Devi fare login prima di salvare.");
    if (!ENDPOINT) return alert("ENDPOINT mancante in APP_CONFIG.");

    const r = recalc();
    if (!r) return;

    const payload = {
      ...r.inputs,
      ...r.out,
      emoji: $('emoji')?.value || "😐",
      commento: $('commento')?.value || ""
    };

    if ($('saveState')) $('saveState').textContent = "Salvataggio...";

    const body = new URLSearchParams();
    body.set("id_token", idToken);
    body.set("payload", JSON.stringify(payload));

    let res, text, data;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: body.toString()
      });
      text = await res.text();
      data = JSON.parse(text);
      
    } catch (e) {
      if ($('saveState')) $('saveState').textContent = "Errore rete/JSON: " + String(e);
      return;
    }

    if (!data.ok) {
      if ($('saveState')) $('saveState').textContent = "Errore: " + data.error;
      return;
    }
    if ($('saveState')) $('saveState').textContent = "Salvato ✅ come " + data.email;
    if ($('who')) $('who').textContent = data.email;
  }

  function setupEmojiToggle() {
    const buttons = document.querySelectorAll('.emojiBtn');
    if (!buttons.length || !$('emoji')) return;

    const setActive = (emoji) => {
      buttons.forEach(b => b.classList.toggle('active', b.dataset.emoji === emoji));
      $('emoji').value = emoji;
    };

    buttons.forEach(btn => btn.addEventListener('click', () => setActive(btn.dataset.emoji)));

    setActive("😐");
  }

  // ===== Storico: view switching =====
  function showHistoryView(show) {
    const hv = $('historyView');
    const allBoxes = document.querySelectorAll('main.container > section.box');

    allBoxes.forEach(sec => sec.style.display = "none");

    if (show) {
      if (hv) hv.style.display = "block";
    } else {
      allBoxes.forEach(sec => {
        if (sec.id !== 'historyView') sec.style.display = "block";
      });
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function loadMyExperiments(limit = 25) {
    if (!idToken) return alert("Devi fare login.");
    if (!ENDPOINT) return alert("ENDPOINT mancante in APP_CONFIG.");

    if ($('historyState')) $('historyState').textContent = "Caricamento...";

    const body = new URLSearchParams();
    body.set("action", "list");
    body.set("id_token", idToken);
    body.set("payload", JSON.stringify({ limit, offset: 0 }));

    let data;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: body.toString()
      });
      const text = await res.text();
      data = JSON.parse(text);
      console.log("HISTORY raw response:", data);
      console.log("HISTORY items length:", (data.items || []).length);

    } catch (e) {
      if ($('historyState')) $('historyState').textContent = "Errore: " + String(e);
      return;
    }

    if (!data.ok) {
      if ($('historyState')) $('historyState').textContent = "Errore: " + data.error;
      return;
    }

    const items = data.items || [];
    if ($('historyState')) $('historyState').textContent = `Trovati ${items.length} salvataggi.`;
    renderHistoryMatrix(items);
  }

  function renderHistoryMatrix(items) {
    const scroller = $('historyScroller');
    if (!scroller) return;

    if (!items.length) {
      scroller.innerHTML = `<p class="muted" style="padding:12px;">Nessun salvataggio.</p>`;
      return;
    }

    const rows = [
      { key: "farina_g", label: "Farina (g)" },
      { key: "acqua_g", label: "Acqua (g)" },
      { key: "sale_g", label: "Sale (g)" },
      { key: "olio_g", label: "Olio (g)" },
      { key: "lievito_fresco_g", label: "Lievito fresco (g)" },
      { key: "lievito_secco_g", label: "Lievito secco (g)" },
      { key: "idratazione", label: "Idratazione (%)" },
      { key: "temp", label: "Temperatura (°C)" },
      { key: "fascia_ore", label: "Ore" },
    ];

    const thCols = items.map((it, idx) => {
      const emoji = it.emoji || "";
      const date = formatTs(it.ts);
      return `
        <th class="historyCol" data-idx="${idx}">
          <div class="historyMeta">${escapeHtml(emoji)} ${escapeHtml(date)}</div>
        </th>`;
    }).join("");

    const bodyRows = rows.map(r => {
      const tds = items.map((it, idx) => `
        <td class="historyCol" data-idx="${idx}">${escapeHtml(fmtCell(it[r.key]))}</td>
      `).join("");
      return `<tr>
        <th class="stickyCol">${escapeHtml(r.label)}</th>
        ${tds}
      </tr>`;
    }).join("");

    const commentRow = `
      <tr>
        <th class="stickyCol">Commento</th>
        ${items.map((it, idx) => `
          <td class="historyCol historyComment" data-idx="${idx}">${escapeHtml(it.commento || "")}</td>
        `).join("")}
      </tr>`;

    scroller.innerHTML = `
      <table class="historyTable">
        <thead>
          <tr>
            <th class="stickyCol">Ingrediente</th>
            ${thCols}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
          ${commentRow}
        </tbody>
      </table>
    `;

    scroller.querySelectorAll('.historyCol').forEach(cell => {
      cell.addEventListener('click', () => {
        const idx = Number(cell.dataset.idx);
        openHistoryDialog(items[idx]);
      });
    });
  }

  function openHistoryDialog(it) {
    const dlg = $('historyDialog');
    const title = $('dlgTitle');
    const body = $('dlgBody');

    if (!dlg || !title || !body) return;

    title.textContent = `${it.emoji || ""} ${formatTs(it.ts)}`;

    body.innerHTML = `
      <p><strong>Impasto</strong></p>
      <ul>
        <li>Panetti: <strong>${escapeHtml(fmtCell(it.panetti))}</strong></li>
        <li>Peso panetto: <strong>${escapeHtml(fmtCell(it.peso_panetto))}</strong> g</li>
        <li>Idratazione: <strong>${escapeHtml(fmtCell(it.idratazione))}</strong>%</li>
        <li>Temp: <strong>${escapeHtml(fmtCell(it.temp))}</strong> °C</li>
        <li>Ore: <strong>${escapeHtml(it.fascia_ore || "")}</strong></li>
        <li>Sale: <strong>${escapeHtml(fmtCell(it.sale_pct))}</strong>%</li>
        <li>Olio: <strong>${escapeHtml(fmtCell(it.olio_pct))}</strong>%</li>
      </ul>
      <p><strong>Ingredienti (totale)</strong></p>
      <ul>
        <li>Farina: <strong>${escapeHtml(fmtCell(it.farina_g))}</strong> g</li>
        <li>Acqua: <strong>${escapeHtml(fmtCell(it.acqua_g))}</strong> g</li>
        <li>Sale: <strong>${escapeHtml(fmtCell(it.sale_g))}</strong> g</li>
        <li>Olio: <strong>${escapeHtml(fmtCell(it.olio_g))}</strong> g</li>
        <li>Lievito fresco: <strong>${escapeHtml(fmtCell(it.lievito_fresco_g))}</strong> g</li>
        <li>Lievito secco: <strong>${escapeHtml(fmtCell(it.lievito_secco_g))}</strong> g</li>
      </ul>
      ${it.commento ? `<p><strong>Commento</strong><br>${escapeHtml(it.commento)}</p>` : ""}
    `;

    if (typeof dlg.showModal === "function") dlg.showModal();
  }

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', () => {
    // Stato auth iniziale
    if ($('loggedOut')) $('loggedOut').style.display = "block";
    if ($('loggedIn')) $('loggedIn').style.display = "none";

    setupEmojiToggle();

    // Ricalcolo live
    ['panetti', 'peso_panetto', 'idratazione', 'temp', 'fascia_ore', 'sale_pct', 'olio_pct']
      .forEach(id => $(id)?.addEventListener('input', recalc));

    // Salvataggio
    $('saveBtn')?.addEventListener('click', saveExperiment);

    // Storico: apri/chiudi
    $('openHistoryBtn')?.addEventListener('click', async () => {
      showHistoryView(true);
      await loadMyExperiments(25);
    });
    $('backToFormBtn')?.addEventListener('click', () => showHistoryView(false));

    // Dialog close
    $('dlgCloseBtn')?.addEventListener('click', () => $('historyDialog')?.close());

    recalc();
  });
})();
