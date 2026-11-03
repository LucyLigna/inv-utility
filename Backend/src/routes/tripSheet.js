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
  s.status, DATE_FORMAT(s.cancelled_at, '%Y-%m-%d %H:%i') AS cancelled_at, s.total_bills, s.total_pack_qty
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
    const [[last]] = await conn.query(
      `SELECT MAX(CAST(SUBSTRING(tsc_no, ${NO_PREFIX.length + 1}) AS UNSIGNED)) n FROM trip_sheet
       WHERE tsc_no LIKE ? FOR UPDATE`,
      [`${NO_PREFIX}%`]
    );
    const tscNo = NO_PREFIX + String((last.n || 0) + 1).padStart(NO_DIGITS, '0');
    const [result] = await conn.query(
      `INSERT INTO trip_sheet (tsc_no, entry_date, trip_code, driver_code, loading_date, start_date, end_date, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tscNo, r.entry_date, r.trip_code, r.driver_code, r.loading_date, r.start_date, r.end_date, r.remarks]
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
    const linkError = await checkLinks(r, Number(req.params.code));
    if (linkError) return res.status(400).json({ message: linkError });
    const [result] = await pool.query(
      `UPDATE trip_sheet SET entry_date = ?, trip_code = ?, driver_code = ?, loading_date = ?, start_date = ?,
         end_date = ?, remarks = ? WHERE ts_code = ? AND status = 'Active'`,
      [r.entry_date, r.trip_code, r.driver_code, r.loading_date, r.start_date, r.end_date, r.remarks, req.params.code]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Trip sheet not found or already cancelled' });
    res.json({ code: Number(req.params.code), ...r });
  } catch (err) {
    next(err);
  }
});

// Delete = mark the sheet Cancelled; the row and its number stay
router.delete('/:code', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      "UPDATE trip_sheet SET status = 'Cancelled', cancelled_at = NOW() WHERE ts_code = ? AND status = 'Active'",
      [req.params.code]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Trip sheet not found or already cancelled' });
    res.json({ code: Number(req.params.code), status: 'Cancelled' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
