// Delivery QR codes and the customers ("stops") on a trip sheet.
//
// Each customer box on the customer-wise print has a QR code for that sheet and customer (the main customer its
// bills are grouped under). The QR holds "INVD|<sheet no>|<code>"; the code (8 characters, also printed under the
// QR so it can be typed) is an HMAC of the sheet and customer, so it can't be guessed and needs no table.
const crypto = require('crypto');
const pool = require('../config/db');
const { signingKey } = require('../auth/auth');
const { sheetBills, customerContacts } = require('./sheetBills');

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I: easy to read and type
const CODE_LENGTH = 8;
const QR_PREFIX = 'INVD';

async function deliveryCode(tsCode, groupKey) {
  const mac = crypto.createHmac('sha256', await signingKey()).update(`delivery|${tsCode}|${groupKey}`).digest();
  return [...mac.subarray(0, CODE_LENGTH)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

const qrText = (tscNo, code) => `${QR_PREFIX}|${tscNo}|${code}`;

// What the driver scanned or typed -> { tscNo, code } (tscNo is null for a typed code)
function readScan(text) {
  const value = String(text || '').trim().toUpperCase();
  const parts = value.split('|');
  if (parts.length === 3 && parts[0] === QR_PREFIX) return { tscNo: parts[1], code: parts[2] };
  return { tscNo: null, code: value.replace(/[^0-9A-Z]/g, '') };
}

// Delivery marks of a sheet: { 'BAD|E003|P122': { delivered_at, driver_name, latitude, longitude } }
async function deliveries(tsCode) {
  const [rows] = await pool.query(
    `SELECT v.company_code, v.ba_code, v.cu_code, DATE_FORMAT(v.delivered_at, '%Y-%m-%d %H:%i') AS delivered_at,
       d.name AS driver_name, v.method, v.latitude, v.longitude, v.accuracy_m
     FROM trip_sheet_delivery v LEFT JOIN driver d ON d.code = v.driver_code WHERE v.ts_code = ?`,
    [tsCode]
  );
  return Object.fromEntries(rows.map(({ company_code: c, ba_code: b, cu_code: u, ...rest }) => [`${c}|${b}|${u}`, rest]));
}

// QR text and code for each customer of the given group keys: { key: { code, qr } }
async function codesFor(sheet, groupKeys) {
  const entries = await Promise.all([...new Set(groupKeys)].map(async (key) => {
    const code = await deliveryCode(sheet.code, key);
    return [key, { code, qr: qrText(sheet.tsc_no, code) }];
  }));
  return Object.fromEntries(entries);
}

// The sheet's stops in the saved order:
// [{ key, name, place, mobile, bills: [{ smc_no, bill_date, company_branch, eway_billno, net_amount, pack_qty, cuc_desc }],
//    cases, amount, code, delivered }]
async function sheetStops(sheet) {
  const bills = await sheetBills(sheet);
  const stops = new Map();
  for (const b of bills) {
    if (!stops.has(b.group_key)) {
      stops.set(b.group_key, { key: b.group_key, name: b.group_name, place: b.group_place, branch: b.group_branch, bills: [], cases: 0, amount: 0 });
    }
    const s = stops.get(b.group_key);
    s.bills.push({
      smc_no: b.smc_no, bill_date: b.bill_date, company_branch: b.company_branch, eway_billno: b.eway_billno,
      net_amount: b.net_amount == null ? null : Number(b.net_amount), pack_qty: Number(b.pack_qty) || 0,
      // a sub customer's bill under its main customer: whose bill it is
      cuc_desc: b.cuc_desc !== b.group_name ? b.cuc_desc : null,
    });
    s.cases += Number(b.pack_qty) || 0;
    s.amount += Number(b.net_amount) || 0;
  }
  const keys = [...stops.keys()];
  const [marks, codes, contacts] = await Promise.all([deliveries(sheet.code), codesFor(sheet, keys), customerContacts(keys)]);
  return [...stops.values()].map((s) => ({
    ...s, mobile: contacts[s.key]?.mobile || null, code: codes[s.key].code, delivered: marks[s.key] || null,
  }));
}

module.exports = { readScan, deliveries, codesFor, sheetStops };
