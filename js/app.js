(() => {
  const cfg = window.APP_CONFIG || {};
  const ENDPOINT = cfg.ENDPOINT;
  const CLIENT_ID = cfg.CLIENT_ID;

  if (!ENDPOINT || !CLIENT_ID) {
    console.warn("APP_CONFIG mancante: ENDPOINT o CLIENT_ID");
  }

  // Set client_id dentro il div g_id_onload (così non lo scrivi due volte)
  const gload = document.getElementById('g_id_onload');
  if (gload && CLIENT_ID) gload.setAttribute('data-client_id', CLIENT_ID);

  let idToken = null;

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

  const $ = (id) => document.getElementById(id);

  window.onGoogleCredential = function (response) {
    idToken = response.credential;
    $('saveBtn').disabled = false;
    $('authState').textContent = "Login OK (token ricevuto)";
  };

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function interpLinear(x, x0, y0, x1, y1) {
    if (x1 === x0) return y0;
    const t = (x - x0) / (x1 - x0);
    return y0 + t * (y1 - y0);
  }
  function round(n, d=0) {
    const p = Math.pow(10, d);
    return Math.round(n * p) / p;
  }

  function yeastPercent(tempC, band) {
    const { temps, bands, values } = YEAST_TABLE;
    const j = bands.indexOf(band);
    if (j < 0) throw new Error("Fascia ore non valida: " + band);

    const t = clamp(tempC, temps[0], temps[temps.length - 1]);

    let i = 0;
    while (i < temps.length - 1 && t > temps[i+1]) i++;

    const t0 = temps[i], t1 = temps[i+1] ?? temps[i];
    const y0 = values[i][j];
    const y1 = (i < temps.length - 1) ? values[i+1][j] : values[i][j];

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

    const yeastPct = yeastPercent(inputs.temp, inputs.fascia_ore);
    const Y = yeastPct / 100;

    const flour = total / (1 + H + S + O + Y);
    const water = flour * H;
    const salt  = flour * S;
    const oil   = flour * O;
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
      `<div><b>Totale impasto</b>: ${out.totale_impasto_g} g</div>
       <div><b>Lievito (tabella)</b>: ${out.lievito_pct}%</div>
       <hr>
       <div><b>Farina</b>: ${out.farina_g} g</div>
       <div><b>Acqua</b>: ${out.acqua_g} g</div>
       <div><b>Sale</b>: ${out.sale_g} g</div>
       <div><b>Olio</b>: ${out.olio_g} g</div>
       <div><b>Lievito fresco</b>: ${out.lievito_fresco_g} g</div>
       <div><b>Lievito secco</b>: ${out.lievito_secco_g} g</div>`;
  }

  function recalc() {
    try {
      const inputs = getInputsFromUI();
      validateInputs(inputs);
      const out = calcRecipe(inputs);
      renderRecipe(out);
      $('calcState').textContent = "";
      return { inputs, out };
    } catch (e) {
      $('out').innerHTML = "";
      $('calcState').textContent = String(e.message || e);
      return null;
    }
  }

  async function saveExperiment() {
    if (!idToken) return alert("Devi fare login prima di salvare.");
    if (!ENDPOINT) return alert("ENDPOINT mancante in APP_CONFIG.");

    const r = recalc();
    if (!r) return;

    const payload = {
      ...r.inputs,
      ...r.out,
      emoji: $('emoji').value || "",
      voto: Number($('voto').value || 3),
      commento: $('commento').value || ""
    };

    $('saveState').textContent = "Salvataggio...";

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
      $('saveState').textContent = "Errore rete/JSON: " + String(e);
      return;
    }

    if (!data.ok) {
      $('saveState').textContent = "Errore: " + data.error;
      return;
    }
    $('saveState').textContent = "Salvato ✅ come " + data.email;
  }

  document.addEventListener('DOMContentLoaded', () => {
    ['panetti','peso_panetto','idratazione','temp','fascia_ore','sale_pct','olio_pct']
      .forEach(id => $(id).addEventListener('input', recalc));

    $('saveBtn').addEventListener('click', saveExperiment);
    recalc();
  });
})();
