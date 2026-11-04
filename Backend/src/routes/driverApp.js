// Driver delivery page (/driver on the phone): the driver logs in with the mobile number from Driver Master and
// the trip sheet's 4-digit driver code, sees the trip's customers, and marks each one delivered by scanning the
// QR code on its box of the customer-wise print.
const express = require('express');
const pool = require('../config/db');
const { createDriverToken, readToken } = require('../auth/auth');
const { writeLog } = require('../auth/activity');
const { findSheet } = require('../db/sheetBills');
const { readScan, sheetStops } = require('../db/delivery');

const router = express.Router();

// Wrong codes: after MAX_FAILS for a mobile number, its logins wait LOCK_MINUTES. (Not per address: behind IIS
// every request comes from the proxy, so that would lock out all drivers.)
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const fails = new Map(); // key -> { count, until }

const lockedFor = (key) => {
  const f = fails.get(key);
  if (!f) return 0;
  if (f.until && f.until > Date.now()) return Math.ceil((f.until - Date.now()) / 60000);
  if (f.until) fails.delete(key);
  return 0;
};
const failed = (key) => {
  const f = fails.get(key) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) f.until = Date.now() + LOCK_MINUTES * 60000;
  fails.set(key, f);
};

const normalizeMobile = (v) => {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};
const driverUser = (name) => ({ user_code: null, username: `Driver ${name}`.slice(0, 50) });

// { mobile, pin } -> { token, driver, sheet }
router.post('/login', async (req, res, next) => {
  const mobile = normalizeMobile(req.body.mobile);
  const pin = String(req.body.pin || '').trim();
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ message: 'Enter your 10-digit mobile number' });
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ message: 'Enter the 4-digit driver code' });
  const keys = [`m:${mobile}`];
  const wait = Math.max(...keys.map(lockedFor));
  if (wait) return res.status(429).json({ message: `Too many wrong codes. Try again in ${wait} minute${wait > 1 ? 's' : ''}.` });
  try {
    const [sheets] = await pool.query(
      `SELECT s.ts_code, s.tsc_no, d.code AS driver_code, d.name AS driver_name,
         s.driver_pin_from <= NOW() AS started, s.driver_pin_till >= NOW() AS not_ended,
         DATE_FORMAT(s.driver_pin_from, '%d-%m-%Y %H:%i') AS pin_from, DATE_FORMAT(s.driver_pin_till, '%d-%m-%Y %H:%i') AS pin_till,
         UNIX_TIMESTAMP(s.driver_pin_till) * 1000 AS till_ms
       FROM trip_sheet s JOIN driver d ON d.code = s.driver_code
       WHERE d.mobile = ? AND d.status = 'Active' AND s.status = 'Active' AND s.driver_pin = ?`,
      [mobile, pin]
    );
    if (!sheets.length) {
      keys.forEach(failed);
      return res.status(401).json({ message: 'Mobile number or driver code is wrong' });
    }
    const sheet = sheets.find((s) => s.started && s.not_ended);
    if (!sheet) {
      const s = sheets[0];
      return res.status(403).json({
        message: s.started ? `This driver code expired at ${s.pin_till}` : `This driver code is active from ${s.pin_from}`,
      });
    }
    keys.forEach((k) => fails.delete(k));
    const token = await createDriverToken({ d: sheet.driver_code, ts: sheet.ts_code, pin }, Number(sheet.till_ms));
    writeLog(req, { user: driverUser(sheet.driver_name), action: 'Driver login', programCode: 'P0202', module: 'Trip Sheet', recordRef: sheet.tsc_no });
    res.json({ token, driver: sheet.driver_name, tsc_no: sheet.tsc_no, till: sheet.pin_till });
  } catch (err) {
    next(err);
  }
});

// Every other call needs the driver token, and the sheet must still be Active with the same, unexpired code
router.use(async (req, res, next) => {
  try {
    const data = await readToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!data || !data.d || !data.ts) return res.status(401).json({ message: 'Please log in again' });
    const [[row]] = await pool.query(
      `SELECT s.tsc_no, d.name AS driver_name FROM trip_sheet s JOIN driver d ON d.code = s.driver_code
       WHERE s.ts_code = ? AND s.driver_code = ? AND s.status = 'Active' AND s.driver_pin = ?
         AND NOW() BETWEEN s.driver_pin_from AND s.driver_pin_till`,
      [data.ts, data.d, data.pin]
    );
    if (!row) return res.status(401).json({ message: 'The driver code has expired or the trip sheet is closed. Please log in again.' });
    req.driver = { code: data.d, name: row.driver_name, tsCode: data.ts, tscNo: row.tsc_no };
    next();
  } catch (err) {
    next(err);
  }
});

// The trip and its customers in delivery order (the QR codes themselves are not sent, so a delivery can only be
// marked by scanning or typing the code from the print)
router.get('/trip', async (req, res, next) => {
  try {
    const sheet = await findSheet(req.driver.tsCode);
    const [[pin]] = await pool.query("SELECT DATE_FORMAT(driver_pin_till, '%d-%m-%Y %H:%i') AS till FROM trip_sheet WHERE ts_code = ?", [sheet.code]);
    const stops = (await sheetStops(sheet)).map(({ code, ...s }) => s);
    res.json({ sheet: { ...sheet, driver_name: req.driver.name, code_till: pin.till }, stops });
  } catch (err) {
    next(err);
  }
});

// Scan: { text: QR text or typed code, latitude, longitude, accuracy } -> marks that customer delivered
router.post('/deliver', async (req, res, next) => {
  const { tscNo, code } = readScan(req.body.text);
  if (!code) return res.status(400).json({ message: 'Scan the QR code or type the code under it' });
  if (tscNo && tscNo !== req.driver.tscNo) {
    return res.status(400).json({ message: `This QR code is for trip sheet ${tscNo}, not your trip ${req.driver.tscNo}` });
  }
  const num = (v, min, max) => (Number.isFinite(Number(v)) && v !== null && v !== '' && Number(v) >= min && Number(v) <= max ? Number(v) : null);
  const lat = num(req.body.latitude, -90, 90);
  const lng = num(req.body.longitude, -180, 180);
  const accuracy = num(req.body.accuracy, 0, 1e6);
  try {
    const sheet = await findSheet(req.driver.tsCode);
    const stop = (await sheetStops(sheet)).find((s) => s.code === code);
    if (!stop) return res.status(404).json({ message: 'This code is not for any customer on your trip' });
    if (stop.delivered) return res.json({ name: stop.name, delivered_at: stop.delivered.delivered_at, already: true });
    const [company, branch, customer] = stop.key.split('|');
    await pool.query(
      `INSERT IGNORE INTO trip_sheet_delivery (ts_code, company_code, ba_code, cu_code, delivered_at, driver_code, latitude, longitude, accuracy_m)
       VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
      [sheet.code, company, branch, customer, req.driver.code, lat, lng, accuracy === null ? null : Math.round(accuracy)]
    );
    const [[mark]] = await pool.query(
      `SELECT DATE_FORMAT(delivered_at, '%Y-%m-%d %H:%i') AS delivered_at FROM trip_sheet_delivery
       WHERE ts_code = ? AND company_code = ? AND ba_code = ? AND cu_code = ?`,
      [sheet.code, company, branch, customer]
    );
    writeLog(req, {
      user: driverUser(req.driver.name), action: 'Delivered', programCode: 'P0202', module: 'Trip Sheet',
      recordRef: sheet.tsc_no, details: `${stop.name}${lat !== null ? ` at ${lat},${lng}` : ''}`,
    });
    res.json({ name: stop.name, delivered_at: mark.delivered_at, already: false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
