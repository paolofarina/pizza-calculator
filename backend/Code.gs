const SHEET_NAME = 'LOG_ESPERIMENTI';
const CLIENT_ID = '13329073477-55053i7d2okr1cb10d7h3qfl3fq67059.apps.googleusercontent.com';
const PREFS_SHEET_NAME = 'PREFERENZE';

function doGet(e) {
  const nonce = (e && e.parameter && e.parameter.nonce) ? String(e.parameter.nonce) : '';
  return HtmlService
    .createHtmlOutput(bridgeHtml_(nonce))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function bridgeHtml_(nonce) {
  const nonceJson = JSON.stringify(String(nonce || ''));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pizza Calculator Bridge</title>
</head>
<body>
<script>
(function () {
  var PARENT_ORIGIN = 'https://paolofarina.github.io';
  var BRIDGE_NONCE = ${nonceJson};

  function send(message) {
    message.nonce = BRIDGE_NONCE;
    window.top.postMessage(message, PARENT_ORIGIN);
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== PARENT_ORIGIN) return;

    var msg = event.data || {};
    if (msg.source !== 'pizza-parent' || msg.type !== 'request' || !msg.id) return;
    if (!BRIDGE_NONCE || msg.nonce !== BRIDGE_NONCE) return;

    var request = JSON.stringify({
      action: msg.action || '',
      id_token: msg.id_token || '',
      payload: msg.payload || {}
    });

    google.script.run
      .withSuccessHandler(function (raw) {
        try {
          send({
            source: 'pizza-bridge',
            type: 'response',
            id: msg.id,
            data: JSON.parse(raw)
          });
        } catch (err) {
          send({
            source: 'pizza-bridge',
            type: 'response',
            id: msg.id,
            error: 'Invalid bridge response'
          });
        }
      })
      .withFailureHandler(function (err) {
        send({
          source: 'pizza-bridge',
          type: 'response',
          id: msg.id,
          error: (err && err.message) ? err.message : String(err || 'Bridge call failed')
        });
      })
      .bridgeCall(request);
  });

  send({
    source: 'pizza-bridge',
    type: 'ready'
  });
})();
<\/script>
</body>
</html>`;
}

function bridgeCall(requestJson) {
  try {
    const req = JSON.parse(requestJson || '{}');
    const action = String(req.action || 'save');
    const idToken = String(req.id_token || '');
    const payload = req.payload || {};
    return JSON.stringify(handleAction_(action, idToken, payload));
  } catch (err) {
    return JSON.stringify({ ok:false, error:String(err) });
  }
}

function doPost(e) {
  try {
    const action = (e.parameter && e.parameter.action) ? e.parameter.action : 'save';
    const idToken = (e.parameter && e.parameter.id_token) ? e.parameter.id_token : '';
    const payloadStr = (e.parameter && e.parameter.payload) ? e.parameter.payload : '{}';
    const payload = JSON.parse(payloadStr);
    return json_(handleAction_(action, idToken, payload));
  } catch (err) {
    return json_({ ok:false, error:String(err) });
  }
}

function handleAction_(action, idToken, p) {
  if (!idToken) throw new Error('Missing id_token');

  const info = verifyIdToken_(idToken);
  const email = info.email || '';
  if (!email) throw new Error('No email in token');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  ensureHeader_(sh);

  if (action === 'bootstrap') {
    ensureIds_(sh);
    const prefSh = getPrefsSheet_(ss);
    const latestItems = listForEmail_(sh, email, 1, 0);
    return {
      ok: true,
      email,
      default: getDefaultForEmail_(prefSh, email),
      latest: latestItems.length ? latestItems[0] : null
    };
  }

  if (action === 'list') {
    ensureIds_(sh);
    const limit = clampInt_(p.limit ?? 25, 1, 200);
    const offset = clampInt_(p.offset ?? 0, 0, 100000);
    const items = listForEmail_(sh, email, limit, offset);
    return { ok:true, email, items };
  }

  if (action === 'update') {
    const result = updateExperiment_(sh, email, p);
    return { ok:true, email, id:result.id };
  }

  if (action === 'get_default') {
    const prefSh = getPrefsSheet_(ss);
    return { ok:true, email, default:getDefaultForEmail_(prefSh, email) };
  }

  if (action === 'save_default') {
    const prefSh = getPrefsSheet_(ss);
    saveDefaultForEmail_(prefSh, email, p);
    return { ok:true, email };
  }

  const id = Utilities.getUuid();
  sh.appendRow([
    new Date(), email,
    p.panetti ?? '', p.peso_panetto ?? '', p.idratazione ?? '', p.temp ?? '', p.fascia_ore ?? '',
    p.sale_pct ?? '', p.olio_pct ?? '',
    p.farina_g ?? '', p.acqua_g ?? '', p.sale_g ?? '', p.olio_g ?? '', p.lievito_fresco_g ?? '', p.lievito_secco_g ?? '',
    p.emoji ?? '⏳', p.voto ?? '', p.commento ?? '', id
  ]);

  return { ok:true, email, id };
}

function ensureHeader_(sh) {
  const expected = [
    'ts','email',
    'panetti','peso_panetto','idratazione','temp','fascia_ore',
    'sale_pct','olio_pct',
    'farina_g','acqua_g','sale_g','olio_g','lievito_fresco_g','lievito_secco_g',
    'emoji','voto','commento','id'
  ];

  if (sh.getLastRow() === 0) {
    sh.appendRow(expected);
    return;
  }

  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());

  if (headers.indexOf('id') < 0) {
    sh.getRange(1, lastCol + 1).setValue('id');
  }
}

function ensureIds_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const idxId = headers.indexOf('id');
  if (idxId < 0) throw new Error('Colonna id non trovata');

  const range = sh.getRange(2, idxId + 1, lastRow - 1, 1);
  const values = range.getValues();
  let changed = false;

  for (let i = 0; i < values.length; i++) {
    if (!String(values[i][0] || '').trim()) {
      values[i][0] = Utilities.getUuid();
      changed = true;
    }
  }
  if (changed) range.setValues(values);
}

function updateExperiment_(sh, email, p) {
  const id = String(p.id || '').trim();
  if (!id) throw new Error('Missing experiment id');

  ensureIds_(sh);

  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const idxId = headers.indexOf('id');
  const idxEmail = headers.indexOf('email');
  const idxEmoji = headers.indexOf('emoji');
  const idxCommento = headers.indexOf('commento');

  if (idxId < 0 || idxEmail < 0 || idxEmoji < 0 || idxCommento < 0) {
    throw new Error('Header sheet incompleto');
  }

  const wantedEmail = email.trim().toLowerCase();

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idxId] || '').trim() !== id) continue;

    const rowEmail = String(data[r][idxEmail] || '').trim().toLowerCase();
    if (rowEmail !== wantedEmail) throw new Error('Experiment does not belong to user');

    sh.getRange(r + 1, idxEmoji + 1).setValue(p.emoji ?? '⏳');
    sh.getRange(r + 1, idxCommento + 1).setValue(p.commento ?? '');
    return { id };
  }

  throw new Error('Experiment not found');
}

function getPrefsSheet_(ss) {
  let sh = ss.getSheetByName(PREFS_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(PREFS_SHEET_NAME);

  const headers = ['email','updated_at','panetti','peso_panetto','idratazione','temp','fascia_ore','sale_pct','olio_pct'];
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function getDefaultForEmail_(sh, email) {
  // Preserva "9-12" come testo: getValues() può restituirlo come oggetto Date.
  const data = sh.getDataRange().getDisplayValues();
  if (data.length < 2) return null;

  const headers = data[0].map(h => String(h || '').trim());
  const idxEmail = headers.indexOf('email');
  const wanted = email.trim().toLowerCase();

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idxEmail] || '').trim().toLowerCase() !== wanted) continue;
    const o = {};
    for (let c = 0; c < headers.length; c++) o[headers[c]] = data[r][c];
    delete o.email;
    delete o.updated_at;
    return o;
  }
  return null;
}

function saveDefaultForEmail_(sh, email, p) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const idxEmail = headers.indexOf('email');
  const wanted = email.trim().toLowerCase();
  let targetRow = -1;

  if (sh.getLastRow() >= 2) {
    const emails = sh.getRange(2, idxEmail + 1, sh.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < emails.length; i++) {
      if (String(emails[i][0] || '').trim().toLowerCase() === wanted) {
        targetRow = i + 2;
        break;
      }
    }
  }

  const band = String(p.fascia_ore ?? '').trim();
  const row = [
    email, new Date(),
    p.panetti ?? '', p.peso_panetto ?? '', p.idratazione ?? '', p.temp ?? '',
    band, p.sale_pct ?? '', p.olio_pct ?? ''
  ];

  // Impedisce a Sheets di trasformare fasce come "9-12" in date.
  const idxBand = headers.indexOf('fascia_ore');
  const writeRow = targetRow > 0 ? targetRow : sh.getLastRow() + 1;
  if (idxBand >= 0) sh.getRange(writeRow, idxBand + 1).setNumberFormat('@');

  if (targetRow > 0) sh.getRange(targetRow, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function verifyIdToken_(idToken) {
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('Invalid token: ' + res.getContentText());
  }
  const info = JSON.parse(res.getContentText());

  if (info.aud !== CLIENT_ID) throw new Error('Token aud mismatch');
  if (info.email_verified !== 'true' && info.email_verified !== true) throw new Error('Email not verified');
  return info;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function listForEmail_(sh, email, limit, offset) {
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h || '').trim());
  const rows = data.slice(1);
  const idxEmail = headers.indexOf('email');
  const idxTs = headers.indexOf('ts');
  if (idxEmail < 0) return [];

  const filtered = [];
  for (const r of rows) {
    const rowEmail = String(r[idxEmail] || '').trim().toLowerCase();
    if (rowEmail !== email.trim().toLowerCase()) continue;

    const o = {};
    for (let i = 0; i < headers.length; i++) o[headers[i]] = r[i];
    filtered.push(o);
  }

  if (idxTs >= 0) {
    filtered.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }
  return filtered.slice(offset, offset + limit);
}

function clampInt_(v, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
