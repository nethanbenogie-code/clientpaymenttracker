// =====================================================
// Client Payment Tracker - Google Apps Script Backend
// =====================================================
// Deploy: Extensions > Apps Script > paste this > Deploy > Web app
//   Execute as: Me
//   Who has access: Anyone with Google account
// Copy the Web App URL into app.js (API_URL).
// =====================================================

const SHEET_ID = ''; // leave blank if script is bound to the sheet
const CLIENTS_TAB = 'Clients';
const USERS_TAB = 'Users';
const LOG_TAB = 'Log';

function getSheet_(name) {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name);
}

function getCurrentUser_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) return null;
  const sheet = getSheet_(USERS_TAB);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === email.toLowerCase() && rows[i][2] === true) {
      return { email: rows[i][0], role: rows[i][1] };
    }
  }
  return null;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const user = getCurrentUser_();
  if (!user) return json_({ ok: false, error: 'unauthorized' });

  const action = (e.parameter.action || 'list').toLowerCase();

  if (action === 'me') return json_({ ok: true, user });

  if (action === 'list') {
    const sheet = getSheet_(CLIENTS_TAB);
    const rows = sheet.getDataRange().getValues();
    const headers = rows.shift();
    const clients = rows.map((r, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, j) => obj[h] = r[j]);
      return obj;
    });
    return json_({ ok: true, headers, clients, user });
  }

  return json_({ ok: false, error: 'unknown action' });
}

function doPost(e) {
  const user = getCurrentUser_();
  if (!user) return json_({ ok: false, error: 'unauthorized' });
  if (user.role !== 'admin') return json_({ ok: false, error: 'forbidden' });

  const body = JSON.parse(e.postData.contents || '{}');
  const action = (body.action || '').toLowerCase();
  const sheet = getSheet_(CLIENTS_TAB);

  if (action === 'add_client') {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map(h => body.client[h] ?? '');
    sheet.appendRow(row);
    log_(user.email, 'add_client', body.client.Client || '');
    return json_({ ok: true });
  }

  if (action === 'mark_payment') {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const colIndex = headers.indexOf(body.month);
    if (colIndex < 0) return json_({ ok: false, error: 'bad month' });
    sheet.getRange(body.row, colIndex + 1).setValue(body.value);
    log_(user.email, 'mark_payment', `row=${body.row} ${body.month}=${body.value}`);
    return json_({ ok: true });
  }

  if (action === 'update_client') {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map(h => body.client[h] ?? '');
    sheet.getRange(body.row, 1, 1, row.length).setValues([row]);
    log_(user.email, 'update_client', `row=${body.row}`);
    return json_({ ok: true });
  }

  if (action === 'delete_client') {
    sheet.deleteRow(body.row);
    log_(user.email, 'delete_client', `row=${body.row}`);
    return json_({ ok: true });
  }

  return json_({ ok: false, error: 'unknown action' });
}

function log_(email, action, detail) {
  const sheet = getSheet_(LOG_TAB);
  if (sheet) sheet.appendRow([new Date(), email, action, detail]);
}

// Run once to create the sheet tabs with headers
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(CLIENTS_TAB)) {
    const s = ss.insertSheet(CLIENTS_TAB);
    const months = [];
    for (let i = 1; i <= 24; i++) months.push('M' + i);
    s.appendRow(['Client','Phone','LoanAmount','Monthly','TermMonths','StartDate',
      ...months, 'Notes']);
  }
  if (!ss.getSheetByName(USERS_TAB)) {
    const s = ss.insertSheet(USERS_TAB);
    s.appendRow(['Email','Role','Active']);
    s.appendRow([Session.getActiveUser().getEmail(), 'admin', true]);
  }
  if (!ss.getSheetByName(LOG_TAB)) {
    const s = ss.insertSheet(LOG_TAB);
    s.appendRow(['Timestamp','User','Action','Detail']);
  }
}
