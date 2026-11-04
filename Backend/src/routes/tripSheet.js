const express = require('express');
const pool = require('../config/db');

const router = express.Router();
const NO_PREFIX = 'TS-';
const NO_DIGITS = 6;
 
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = (col) => `DATE_FORMAT(s.${col}, '%Y-%m-%d') AS ${col}`;

// Dates go out as 'YYYY-MM-DD' strings so they don't shift with the time zone
const SELECT = `SELECT s.ts_code AS code, s.tsc_no, ${day('entry_date')}, s.trip_code, r.name AS route_name,
  s.driver_code, d.name AS driver_name, ${day('loading_date')}, ${day('start_date')}, ${day('end_date')}, s.remarks,
  s.status, DATE_FORMAT(s.cancelled_at, '%Y-%m-%d %H:%i') AS cancelled_at,
  DATE_FORMAT(s.closed_at, '%Y-%m-%d %H:%i') AS closed_at, s.total_bills, s.total_pack_qty, d.mobile AS driver_mobile,
  s.driver_pin, DATE_FORMAT(s.driver_pin_from, '%Y-%m-%d %H:%i') AS driver_pin_from,
  DATE_FORMAT(s.driver_pin_till, '%Y-%m-%d %H:%i') AS driver_pin_till,
  (SELECT COUNT(*) FROM trip_sheet_delivery v WHERE v.ts_code = s.ts_code) AS delivered_customers
  FROM trip_sheet s
  JOIN trip_route r ON r.code = s.trip_code
  JOIN driver d ON d.code = s.driver_code`;

function validate(body) {
  const date = (v) => (v ? String(v).slice(0, 10) : null);
  const r = {
    entry_date: date(body.entry_date),
    trip_code: Number(body.trip_code) || null,
    driver_code: Number(body.driver_code) || null,
    loading_date: date(body.loading_date),
    start_date: date(body.start_date),
    end_date: date(body.end_date),
    remarks: String(body.remarks || '').trim().slice(0, 500) || null,
  };
  if (!r.entry_date) return { error: 'Entry date is required' };
  if (!r.trip_code) return { error: 'Trip route is required' };
  if (!r.driver_code) return { error: 'Driver is required' };
  if (!r.loading_date) return { error: 'Loading date is required' };
  if (!r.start_date) return { error: 'Start date is required' };
  for (const f of ['entry_date', 'loading_date', 'start_date', 'end_date']) {
    if (r[f] && !DATE_RE.test(r[f])) return { error: `${f.replace('_', ' ')} must be a date` };
  }
  if (r.start_date < r.loading_date) return { error: 'Start date cannot be before the loading date' };
  if (r.end_date && r.end_date < r.start_date) return { error: 'End date cannot be before the start date' };
  return r;
}

// The sheet's document number, for answers (and so the user log names the sheet)
async function sheetNo(code) {
  const [[row]] = await pool.query('SELECT tsc_no FROM trip_sheet WHERE ts_code = ?', [code]);
  return row ? row.tsc_no : null;
}

// A route can have only one Active trip sheet at a time. Returns that sheet (other than exceptCode), if any.
async function activeSheetFor(db, tripCode, exceptCode = 0) {
  const [[sheet]] = await db.query(
    `SELECT s.tsc_no, r.name AS route_name FROM trip_sheet s JOIN trip_route r ON r.code = s.trip_code
     WHERE s.trip_code = ? AND s.status = 'Active' AND s.ts_code <> ? LIMIT 1`,
    [tripCode, exceptCode]
  );
  return sheet;
}
const busyMessage = (s) => `Trip sheet ${s.tsc_no} is already active for ${s.route_name}. Close it before starting another trip sheet for this route.`;

// The route and driver must exist; inactive ones are allowed only if the sheet already uses them
async function checkLinks(r, code) {
  const [[current]] = code
    ? await pool.query('SELECT trip_code, driver_code FROM trip_sheet WHERE ts_code = ?', [code])
    : [[null]];
  const [[route]] = await pool.query('SELECT status FROM trip_route WHERE code = ?', [r.trip_code]);
  if (!route) return 'Trip route not found';
  if (route.status !== 'Active' && current?.trip_code !== r.trip_code) return 'Trip route is inactive';
  const [[driver]] = await pool.query('SELECT status FROM driver WHERE code = ?', [r.driver_code]);
  if (!driver) return 'Driver not found';
  if (driver.status !== 'Active' && current?.driver_code !== r.driver_code) return 'Driver is inactive';
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${SELECT} ORDER BY s.ts_code DESC`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:code', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${SELECT} WHERE s.ts_code = ?`, [req.params.code]);
    if (!rows.length) return res.status(404).json({ message: 'Trip sheet not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// New sheet: the next document number is taken inside the transaction, so two saves can't get the same number
router.post('/', async (req, res, next) => {
  const r = validate(req.body);
  if (r.error) return res.status(400).json({ message: r.error });
  const conn = await pool.getConnection();
  try {
    const linkError = await checkLinks(r, null);
    if (linkError) return res.status(400).json({ message: linkError });
    await conn.beginTransaction();
    // Lock the route so two saves at once can't both open a sheet for it
    await conn.query('SELECT code FROM trip_route WHERE code = ? FOR UPDATE', [r.trip_code]);
    const busy = await activeSheetFor(conn, r.trip_code);
    if (busy) {
      await conn.rollback();
      return res.status(409).json({ message: busyMessage(busy) });
    }
    const [[last]] = await conn.query(
      `SELECT MAX(CAST(SUBSTRING(tsc_no, ${NO_PREFIX.length + 1}) AS UNSIGNED)) n FROM trip_sheet
       WHERE tsc_no LIKE ? FOR UPDATE`,
      [`${NO_PREFIX}%`]
    );
    const tscNo = NO_PREFIX + String((last.n || 0) + 1).padStart(NO_DIGITS, '0');
    const [result] = await conn.query(
      `INSERT INTO trip_sheet (tsc_no, entry_date, trip_code, driver_code, loading_date, start_date, end_date, remarks,
         created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tscNo, r.entry_date, r.trip_code, r.driver_code, r.loading_date, r.start_date, r.end_date, r.remarks,
        req.user.user_code, req.user.user_code]
    );
    await conn.commit();
    res.status(201).json({ code: result.insertId, tsc_no: tscNo, ...r });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// The document number never changes once given
router.put('/:code', async (req, res, next) => {
  const r = validate(req.body);
  if (r.error) return res.status(400).json({ message: r.error });
  try {
    // The trip route is fixed once the sheet is saved (its bills are picked from that route's customers)
    const [[current]] = await pool.query('SELECT trip_code FROM trip_sheet WHERE ts_code = ?', [req.params.code]);
    if (current && current.trip_code !== r.trip_code) {
      return res.status(400).json({ message: 'The trip route of a saved trip sheet cannot be changed' });
    }
    const linkError = await checkLinks(r, Number(req.params.code));
    if (linkError) return res.status(400).json({ message: linkError });
    const [result] = await pool.query(
      `UPDATE trip_sheet SET entry_date = ?, driver_code = ?, loading_date = ?, start_date = ?,
         end_date = ?, remarks = ?, updated_by = ? WHERE ts_code = ? AND status = 'Active'`,
      [r.entry_date, r.driver_code, r.loading_date, r.start_date, r.end_date, r.remarks, req.user.user_code, req.params.code]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Trip sheet not found, or it is closed or cancelled' });
    res.json({ code: Number(req.params.code), tsc_no: await sheetNo(req.params.code), ...r });
  } catch (err) {
    next(err);
  }
});

// Delete = mark the sheet Cancelled; the row and its number stay
// Close the trip: the sheet and its bills are then fixed, and it no longer shows in Trip Sheet - Bill Details
router.post('/:code/close', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      "UPDATE trip_sheet SET status = 'Closed', closed_at = NOW(), updated_by = ? WHERE ts_code = ? AND status = 'Active'",
      [req.user.user_code, req.params.code]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Trip sheet not found, or already closed or cancelled' });
    res.json({ code: Number(req.params.code), tsc_no: await sheetNo(req.params.code), status: 'Closed' });
  } catch (err) {
    next(err);
  }
});

// Reopen a closed sheet; only on the day it was closed (server date)
router.post('/:code/reopen', async (req, res, next) => {
  try {
    const [[sheet]] = await pool.query(
      `SELECT trip_code, status, DATE_FORMAT(closed_at, '%d-%m-%Y') AS closed_on, DATE(closed_at) = CURDATE() AS closed_today
       FROM trip_sheet WHERE ts_code = ?`,
      [req.params.code]
    );
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    if (sheet.status !== 'Closed') return res.status(400).json({ message: 'Only a closed trip sheet can be reopened' });
    if (!sheet.closed_today) {
      return res.status(400).json({ message: `This trip sheet was closed on ${sheet.closed_on}; only a sheet closed today can be reopened` });
    }
    // Same rule as adding: the route may have only one Active trip sheet
    const busy = await activeSheetFor(pool, sheet.trip_code, Number(req.params.code));
    if (busy) {
      return res.status(409).json({
        message: `Trip sheet ${busy.tsc_no} is already active for ${busy.route_name}. Close it before reopening this one.`,
      });
    }
    await pool.query(
      "UPDATE trip_sheet SET status = 'Active', closed_at = NULL, updated_by = ? WHERE ts_code = ? AND status = 'Closed'",
      [req.user.user_code, req.params.code]
    );
    res.json({ code: Number(req.params.code), tsc_no: await sheetNo(req.params.code), status: 'Active' });
  } catch (err) {
    next(err);
  }
});

// Driver code: { from, till } ('YYYY-MM-DD HH:mm') -> a new random 4-digit code, valid only in that window.
// The driver logs in to the delivery page (/driver) with the mobile number from Driver Master and this code.
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/;
router.post('/:code/driver-code', async (req, res, next) => {
  const from = String(req.body.from || '').trim();
  const till = String(req.body.till || '').trim();
  if (!DATETIME_RE.test(from) || !DATETIME_RE.test(till)) return res.status(400).json({ message: 'Active from and till must be a date and time' });
  if (till <= from) return res.status(400).json({ message: 'Active till must be after active from' });
  try {
    const [[sheet]] = await pool.query(
      'SELECT s.status, d.name AS driver_name, d.mobile FROM trip_sheet s JOIN driver d ON d.code = s.driver_code WHERE s.ts_code = ?',
      [req.params.code]
    );
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    if (sheet.status !== 'Active') return res.status(400).json({ message: 'A driver code can be given only for an active trip sheet' });
    if (!sheet.mobile) {
      return res.status(400).json({ message: `Driver ${sheet.driver_name} has no mobile number. Add it in Driver Master first; the driver logs in with it.` });
    }
    const pin = String(require('crypto').randomInt(0, 10000)).padStart(4, '0');
    await pool.query(
      'UPDATE trip_sheet SET driver_pin = ?, driver_pin_from = ?, driver_pin_till = ?, updated_by = ? WHERE ts_code = ?',
      [pin, from.replace('T', ' '), till.replace('T', ' '), req.user.user_code, req.params.code]
    );
    res.json({ code: Number(req.params.code), tsc_no: await sheetNo(req.params.code), driver_pin: pin, from, till });
  } catch (err) {
    next(err);
  }
});

// A sheet that still has bills (Trip Sheet - Bill Details) can't be cancelled
router.delete('/:code', async (req, res, next) => {
  try {
    const [[bills]] = await pool.query('SELECT COUNT(*) AS n FROM trip_sheet_bills WHERE ts_code = ?', [req.params.code]);
    if (bills.n) {
      return res.status(400).json({
        message: `This trip sheet has ${bills.n} bill${bills.n > 1 ? 's' : ''}. Remove them in Trip Sheet - Bill Details before deleting it.`,
      });
    }
    const [result] = await pool.query(
      "UPDATE trip_sheet SET status = 'Cancelled', cancelled_at = NOW(), updated_by = ? WHERE ts_code = ? AND status = 'Active'",
      [req.user.user_code, req.params.code]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Trip sheet not found or already cancelled' });
    res.json({ code: Number(req.params.code), tsc_no: await sheetNo(req.params.code), status: 'Cancelled' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
