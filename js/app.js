(() => {
  const cfg = window.APP_CONFIG || {};
  const ENDPOINT = cfg.ENDPOINT;
  const CLIENT_ID = cfg.CLIENT_ID;

  const $ = (id) => document.getElementById(id);

  let idToken = null;

  // Tabella lievito fresco (% su farina)
const YEAST_TABLE = {
  temps: [18, 20, 22, 24, 26, 28, 30],

  bands: ["4-5", "6-8", "9-12", "12-16", "17-24"],

  values: {
    18: [1.20, 0.75, 0.45, 0.30, 0.18],
    20: [1.00, 0.60, 0.36, 0.24, 0.14],
    22: [0.80, 0.48, 0.29, 0.19, 0.11],
    24: [0.65, 0.39, 0.23, 0.15, 0.09],
    26: [0.52, 0.31, 0.19, 0.12, 0.07],
    28: [0.42, 0.25, 0.15, 0.10, 0.06],
    30: [0.34, 0.20, 0.12, 0.08, 0.05]
  }
};
  // ===== Auth callback =====
  window.onGoogleCredential = async function (response) {
    idToken = response.credential;

    if ($('loggedOut')) $('loggedOut').style.display = "none";
    if ($('loggedIn')) $('loggedIn').style.display = "block";
    if ($('saveBtn')) $('saveBtn').disabled = false;
    if ($('openHistoryBtn')) $('openHistoryBtn').disabled = false;
    if ($('who')) $('who').textContent = "Sessione Google recuperata";

    await loadMyDefault();
  };

  window.onGooglePromptMoment = function (notification) {
    // Se Google/FedCM non effettua l'accesso automatico, rendiamo esplicito lo stato.
    // Alcuni browser non espongono tutti i motivi del mancato prompt.
    setTimeout(() => {
      if (!idToken && $('authState')) {
        $('authState').textContent = "Sessione Google non recuperata — accedi per usare default, salvataggi e storico.";
      }
    }, 800);
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

  const t0 = temps[i];
  const t1 = temps[i + 1] ?? temps[i];

  const y0 = values[t0][j];
  const y1 = values[t1][j];

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

  function applyInputsToUI(i) {
    if (!i) return;

    ['panetti', 'peso_panetto', 'idratazione', 'temp', 'sale_pct', 'olio_pct']
      .forEach(key => {
        if ($(key) && i[key] !== undefined && i[key] !== null && i[key] !== "") {
          $(key).value = i[key];
        }
      });

    if ($('fascia_ore')) {
      const band = String(i.fascia_ore ?? "").trim();
      if (YEAST_TABLE.bands.includes(band)) {
        $('fascia_ore').value = band;
      } else if (!YEAST_TABLE.bands.includes($('fascia_ore').value)) {
        $('fascia_ore').value = "6-8";
      }
    }

    recalc();
  }

  async function apiAction(action, payload = {}) {
    if (!idToken) throw new Error("Login Google necessario");

    const body = new URLSearchParams();
    body.set("action", action);
    body.set("id_token", idToken);
    body.set("payload", JSON.stringify(payload));

    const res = await fetch(ENDPOINT, {
      method: "POST",
      body: body
    });
    const data = JSON.parse(await res.text());
    if (!data.ok) throw new Error(data.error || "Operazione fallita");
    return data;
  }

  async function saveDefault() {
    const r = recalc();
    if (!r) return;
    if (!idToken) return alert("Accedi con Google per salvare il tuo default.");

    try {
      if ($('defaultState')) $('defaultState').textContent = "Salvataggio default...";
      await apiAction("save_default", r.inputs);
      const check = await apiAction("get_default");
      if (check.default) applyInputsToUI(check.default);
      if ($('defaultState')) $('defaultState').textContent = "Mio default salvato ✓";
    } catch (e) {
      if ($('defaultState')) $('defaultState').textContent = "Errore default: " + String(e.message || e);
    }
  }

  async function loadMyDefault() {
    if (!idToken) return;
    try {
      if ($('defaultState')) $('defaultState').textContent = "Caricamento default...";
      const data = await apiAction("get_default");
      if (data.default) {
        applyInputsToUI(data.default);
        if ($('defaultState')) $('defaultState').textContent = "Mio default caricato";
      } else {
        if ($('defaultState')) $('defaultState').textContent = "Nessun default personale salvato";
      }
      if ($('who') && data.email) $('who').textContent = data.email;
    } catch (e) {
      if ($('defaultState')) $('defaultState').textContent = "Default non recuperato: " + String(e.message || e);
    }
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
  function markRecipeDirty() {
    if (!idToken || !$('saveBtn')) return;
    $('saveBtn').disabled = false;
    $('saveBtn').textContent = "💾 Salva";
    if ($('saveState')) $('saveState').textContent = "";
  }

  async function saveExperiment() {
    if (!idToken) return alert("Devi fare login prima di salvare.");
    if (!ENDPOINT) return alert("ENDPOINT mancante in APP_CONFIG.");

    const r = recalc();
    if (!r) return;

    const payload = {
      ...r.inputs,
      ...r.out,
      emoji: $('emoji')?.value || "⏳",
      commento: $('commento')?.value || ""
    };

    const btn = $('saveBtn');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Salvataggio…";
      }
      if ($('saveState')) $('saveState').textContent = "Sto salvando questo impasto...";
      const data = await apiAction("save", payload);
      if (btn) btn.textContent = "✓ Salvato";
      if ($('saveState')) $('saveState').textContent = "Impasto salvato correttamente.";
      if ($('who')) $('who').textContent = data.email;
    } catch (e) {
      const message = String(e.message || e);
      console.error("SAVE error:", e);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "💾 Salva";
      }
      if ($('saveState')) $('saveState').textContent = "Errore salvataggio: " + message;
    }
  }

  function setupEmojiToggle() {
    const buttons = document.querySelectorAll('.emojiBtn');
    if (!buttons.length || !$('emoji')) return;

    const setActive = (emoji) => {
      buttons.forEach(b => b.classList.toggle('active', b.dataset.emoji === emoji));
      $('emoji').value = emoji;
    };

    buttons.forEach(btn => btn.addEventListener('click', () => {
      setActive(btn.dataset.emoji);
      markRecipeDirty();
    }));

    setActive("⏳");
  }

  // ===== Storico: view switching =====
  function showHistoryView(show) {
    if ($('calculatorView')) $('calculatorView').style.display = show ? "none" : "block";
    if ($('historyView')) $('historyView').style.display = show ? "block" : "none";
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
        body: body
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
    ];

    const thCols = items.map((it, idx) => {
      const emoji = it.emoji || "";
      const date = formatTs(it.ts);
      return `
        <th class="historyCol" data-idx="${idx}">
          <div class="historyMeta">
            <div class="historyReaction">${escapeHtml(emoji)}</div>
            <div class="historyDate">${escapeHtml(date)}</div>
          </div>
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

  async function updateExperimentRating(it, emoji, commento) {
    if (!idToken || !it.id) throw new Error("Salvataggio non identificabile.");

    const body = new URLSearchParams();
    body.set("action", "update");
    body.set("id_token", idToken);
    body.set("payload", JSON.stringify({ id: it.id, emoji, commento }));

    const res = await fetch(ENDPOINT, {
      method: "POST",
      body: body
    });
    const data = JSON.parse(await res.text());
    if (!data.ok) throw new Error(data.error || "Aggiornamento fallito");
    return data;
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
      <hr>
      <p><strong>Valutazione</strong></p>
      <div class="emojiRow dialogEmojiRow" aria-label="Valutazione impasto">
        <button type="button" class="emojiBtn dlgEmojiBtn" data-emoji="⏳" title="Da valutare">⏳</button>
        <button type="button" class="emojiBtn dlgEmojiBtn" data-emoji="😍" title="Fantastico">😍</button>
        <button type="button" class="emojiBtn dlgEmojiBtn" data-emoji="😐" title="Ok">😐</button>
        <button type="button" class="emojiBtn dlgEmojiBtn" data-emoji="🤬" title="Male">🤬</button>
      </div>
      <label>
        Commento
        <textarea id="dlgCommento" rows="3" placeholder="Note...">${escapeHtml(it.commento || "")}</textarea>
      </label>
      <small id="dlgUpdateState" class="muted"></small>
      <div class="dialogActions">
        <button type="button" id="updateRatingBtn" class="contrast">Salva valutazione</button>
        <button type="button" id="useRecipeBtn" class="secondary">↩ Usa questa ricetta</button>
      </div>
    `;

    let selectedEmoji = it.emoji || "⏳";
    const dlgEmojiButtons = body.querySelectorAll('.dlgEmojiBtn');
    const setDlgEmoji = (emoji) => {
      selectedEmoji = emoji;
      dlgEmojiButtons.forEach(b => b.classList.toggle('active', b.dataset.emoji === emoji));
    };
    dlgEmojiButtons.forEach(btn => btn.addEventListener('click', () => setDlgEmoji(btn.dataset.emoji)));
    setDlgEmoji(selectedEmoji);

    $('updateRatingBtn')?.addEventListener('click', async () => {
      const state = $('dlgUpdateState');
      try {
        if (state) state.textContent = "Aggiornamento...";
        await updateExperimentRating(it, selectedEmoji, $('dlgCommento')?.value || "");
        it.emoji = selectedEmoji;
        it.commento = $('dlgCommento')?.value || "";
        if (state) state.textContent = "Valutazione aggiornata ✓";
        title.textContent = `${it.emoji || ""} ${formatTs(it.ts)}`;
        await loadMyExperiments(25);
      } catch (e) {
        if (state) state.textContent = "Errore: " + String(e.message || e);
      }
    });

    $('useRecipeBtn')?.addEventListener('click', () => {
      applyInputsToUI(it);
      dlg.close();
      showHistoryView(false);
      if ($('calcState')) $('calcState').textContent = "Ricetta caricata dallo storico: puoi modificarla liberamente.";
    });

    if (typeof dlg.showModal === "function") dlg.showModal();
  }

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', () => {
    // Stato auth iniziale
    if ($('loggedOut')) $('loggedOut').style.display = "block";
    if ($('loggedIn')) $('loggedIn').style.display = "none";

    setupEmojiToggle();

    if ($('fascia_ore') && !YEAST_TABLE.bands.includes($('fascia_ore').value)) {
      $('fascia_ore').value = "6-8";
    }

    // Ricalcolo live
    ['panetti', 'peso_panetto', 'idratazione', 'temp', 'fascia_ore', 'sale_pct', 'olio_pct']
      .forEach(id => $(id)?.addEventListener('input', () => {
        recalc();
        markRecipeDirty();
      }));

    $('commento')?.addEventListener('input', markRecipeDirty);

    // Default personale
    $('setDefaultBtn')?.addEventListener('click', saveDefault);

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

    // Se GIS non restituisce automaticamente una credenziale, il calculator
    // resta utilizzabile e il pulsante Google rimane disponibile.
    setTimeout(() => {
      if (!idToken && $('authState')) {
        $('authState').textContent = "Sessione Google non recuperata — accedi per usare default, salvataggi e storico.";
      }
    }, 2500);
  });
})();
