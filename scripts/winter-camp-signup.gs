/**
 * Winter Camp 2026 signup receiver for Google Sheets.
 *
 * Deploy as a web app: Execute as "Me", access "Anyone".
 * Paste the /exec URL into js/signup-config.js on the site.
 *
 * Sheet columns (row 1 headers, created automatically if missing):
 * Timestamp | Id | Name | Email | TransferLast5 | Plan | TeacherNote | Agreed
 *
 * An existing sheet keeps its current columns. Agreed is added at the end
 * when that header cell is still empty.
 */

var TIMEZONE = 'Asia/Taipei';
var SHEET_NAME = 'Signups';
var HEADER_ROW = [
  'Timestamp',
  'Id',
  'Name',
  'Email',
  'TransferLast5',
  'Plan',
  'TeacherNote',
  'Agreed'
];

var EARLY_START = '2026-10-19';
var EARLY_END = '2026-10-26';
var REGULAR_END = '2026-10-31';

function doPost(e) {
  try {
    var payload = parseBody_(e);
    if (payload.website) {
      return json_({ ok: true, ignored: true });
    }

    var id = String(payload.id || '').trim();
    var name = String(payload.name || '').trim();
    var email = String(payload.email || '').trim();
    var transferLast5 = String(payload.transferLast5 || '').trim();

    if (!id) {
      return json_({ ok: false, error: 'missing_id' });
    }
    if (!name) {
      return json_({ ok: false, error: 'missing_name' });
    }
    if (!isValidEmail_(email)) {
      return json_({ ok: false, error: 'invalid_email' });
    }
    if (!/^\d{5}$/.test(transferLast5)) {
      return json_({ ok: false, error: 'invalid_transfer_last5' });
    }
    if (!isAgreed_(payload.agreed)) {
      return json_({ ok: false, error: 'missing_agreement' });
    }

    var plan = resolvePlan_(new Date());
    if (!plan) {
      return json_({ ok: false, error: 'outside_window' });
    }

    var sheet = getOrCreateSheet_();
    if (findRowById_(sheet, id) > 0) {
      return json_({ ok: true, duplicate: true, id: id, plan: plan.label });
    }

    var timestamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([
      timestamp,
      id,
      name,
      email,
      transferLast5,
      plan.label,
      '',
      'Yes'
    ]);

    return json_({ ok: true, id: id, plan: plan.label });
  } catch (err) {
    return json_({ ok: false, error: 'server_error' });
  }
}

function doGet(e) {
  try {
    var id = e && e.parameter ? String(e.parameter.id || '').trim() : '';
    if (!id) {
      return maybeJsonp_(e, { ok: false, error: 'missing_id' });
    }

    var sheet = getOrCreateSheet_();
    var found = findRowById_(sheet, id) > 0;
    return maybeJsonp_(e, { ok: true, found: found, id: id });
  } catch (err) {
    return maybeJsonp_(e, { ok: false, error: 'server_error' });
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }
  return JSON.parse(e.postData.contents);
}

function resolvePlan_(now) {
  var today = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  if (today < EARLY_START) {
    return null;
  }
  if (today <= EARLY_END) {
    return { label: 'Early bird 2800' };
  }
  if (today <= REGULAR_END) {
    return { label: 'Regular 3150' };
  }
  return null;
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isAgreed_(value) {
  return value === true || value === 'true' || value === 'Yes' || value === 'yes';
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  ensureHeader_(sheet);
  return sheet;
}

function ensureHeader_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), HEADER_ROW.length);
  var values = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var empty = values.every(function (cell) {
    return cell === '' || cell === null;
  });
  if (empty) {
    sheet.getRange(1, 1, 1, HEADER_ROW.length).setValues([HEADER_ROW]);
    sheet.setFrozenRows(1);
    return;
  }
  for (var i = 0; i < HEADER_ROW.length; i++) {
    if (values[i] === '' || values[i] === null) {
      sheet.getRange(1, i + 1).setValue(HEADER_ROW[i]);
    }
  }
}

function findRowById_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  var ids = sheet.getRange(2, 2, lastRow, 2).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      return i + 2;
    }
  }
  return 0;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function maybeJsonp_(e, obj) {
  var callback = e && e.parameter ? String(e.parameter.callback || '') : '';
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(obj) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(obj);
}
