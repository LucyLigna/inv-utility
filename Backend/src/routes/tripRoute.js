const express = require('express');
const pool = require('../config/db');

const router = express.Router();
const STATUSES = ['Active', 'Inactive'];
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
// Fields that must be unique, with the message shown when they are not
const UNIQUE_FIELDS = {
  name: 'Route name already exists',
  short_code: 'Short code already exists',
};
  
function validate(body) {
  const name = String(body.name || '').trim().toUpperCase();
  const shortCode = String(body.short_code || '').trim().toUpperCase();
  const status = body.status || 'Active';
  // Accepts ['MON', 'THU'] or 'MON,THU'; stored as 'MON,THU' in Monday-first order
  const days = Array.isArray(body.weekdays) ? body.weekdays : String(body.weekdays || '').split(',');
  const picked = days.map((d) => String(d).trim().toUpperCase()).filter(Boolean);
  if (picked.some((d) => !WEEKDAYS.includes(d))) return { error: 'Weekdays must be MON to SAT' };
  const weekdays = WEEKDAYS.filter((d) => picked.includes(d)).join(',');
  if (!name) return { error: 'Route name is required' };
  if (!shortCode) return { error: 'Short code is required' };
  if (shortCode.length > 10) return { error: 'Short code can be at most 10 characters' };
  if (!weekdays) return { error: 'Select at least one weekday' };
  if (!STATUSES.includes(status)) return { error: 'Status must be Active or Inactive' };
  return { name, short_code: shortCode, weekdays, status };
}

function handleDbError(err, res, next) {
  if (err.code === 'ER_DUP_ENTRY') {
    const message = err.message.includes('uq_trip_route_short_code') ? UNIQUE_FIELDS.short_code : UNIQUE_FIELDS.name;
    return res.status(409).json({ message });
  }
  next(err);
}

// Branch name as the picker shows it; falls back to the company code if the company has no short code yet
const BRANCH_NAME = "COALESCE(v.company_branch, CONCAT(v.company_code, ' - ', v.brc_desc))";

// Active branches per route: { 3: [{ company_code, ba_code, company_branch }], ... }
async function loadBranches(codes) {
  if (!codes.length) return {};
  const [rows] = await pool.query(
    `SELECT b.trip_code, b.company_code, b.ba_code, ${BRANCH_NAME} AS company_branch
     FROM trip_route_branches b
     JOIN view_branch_list v ON v.company_code = b.company_code AND v.ba_code = b.ba_code
     WHERE b.status = 'Active' AND b.trip_code IN (?)
     ORDER BY company_branch`,
    [codes]
  );
  const byRoute = {};
  for (const { trip_code: code, ...branch } of rows) (byRoute[code] ||= []).push(branch);
  return byRoute;
}

// Keeps the ticked branches Active (adding new ones) and marks the rest of this route's branches Inactive
async function saveBranches(conn, tripCode, branches, userCode) {
  await conn.query("UPDATE trip_route_branches SET status = 'Inactive', updated_by = ? WHERE trip_code = ? AND status = 'Active'", [
    userCode, tripCode,
  ]);
  if (!branches.length) return;
  await conn.query(
    `INSERT INTO trip_route_branches (trip_code, company_code, ba_code, status, created_by, updated_by) VALUES ?
     AS new ON DUPLICATE KEY UPDATE status = new.status, updated_by = new.updated_by`,
    [branches.map((b) => [tripCode, b.company_code, b.ba_code, 'Active', userCode, userCode])]
  );
}

// Branches sent by the screen, checked against view_branch_list
async function validBranches(list) {
  const picked = (Array.isArray(list) ? list : [])
    .map((b) => ({ company_code: String(b.company_code || '').trim(), ba_code: String(b.ba_code || '').trim() }))
    .filter((b) => b.company_code && b.ba_code);
  if (!picked.length) return { error: 'Select at least one branch' };
  const [rows] = await pool.query(
    'SELECT company_code, ba_code FROM view_branch_list WHERE (company_code, ba_code) IN (?)',
    [picked.map((b) => [b.company_code, b.ba_code])]
  );
  if (rows.length !== new Set(picked.map((b) => `${b.company_code}:${b.ba_code}`)).size) {
    return { error: 'One or more selected branches no longer exist' };
  }
  return { branches: rows };
}

// Saves the route and its branches together, so a failure leaves neither half-saved
async function saveRoute(req, res, next, code) {
  const r = validate(req.body);
  if (r.error) return res.status(400).json({ message: r.error });
  const conn = await pool.getConnection();
  try {
    const b = await validBranches(req.body.branches);
    if (b.error) return res.status(400).json({ message: b.error });
    await conn.beginTransaction();
    let tripCode = code;
    if (code) {
      const [result] = await conn.query(
        'UPDATE trip_route SET name = ?, short_code = ?, weekdays = ?, status = ?, updated_by = ? WHERE code = ?',
        [r.name, r.short_code, r.weekdays, r.status, req.user.user_code, code]
      );
      if (!result.affectedRows) {
        await conn.rollback();
        return res.status(404).json({ message: 'Route not found' });
      }
    } else {
      const [result] = await conn.query(
        'INSERT INTO trip_route (name, short_code, weekdays, status, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
        [r.name, r.short_code, r.weekdays, r.status, req.user.user_code, req.user.user_code]
      );
      tripCode = result.insertId;
    }
    await saveBranches(conn, tripCode, b.branches, req.user.user_code);
    await conn.commit();
    res.status(code ? 200 : 201).json({ code: tripCode, ...r, branches: b.branches });
  } catch (err) {
    await conn.rollback();
    handleDbError(err, res, next);
  } finally {
    conn.release();
  }
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT code, name, short_code, weekdays, status FROM trip_route ORDER BY name');
    const branches = await loadBranches(rows.map((r) => r.code));
    res.json(rows.map((r) => ({ ...r, branches: branches[r.code] || [] })));
  } catch (err) {
    next(err);
  }
});

// Every branch that can be picked, from view_branch_list
router.get('/branch-list', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.company_code, v.ba_code, ${BRANCH_NAME} AS company_branch FROM view_branch_list v ORDER BY company_branch`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Duplicate check while typing: /api/trip-routes/check-duplicate?field=short_code&value=KCH&excludeCode=3
// excludeCode skips the route being edited so it doesn't match itself
router.get('/check-duplicate', async (req, res, next) => {
  const { field } = req.query;
  if (!UNIQUE_FIELDS[field]) return res.status(400).json({ message: 'field must be name or short_code' });
  const value = String(req.query.value || '').trim().toUpperCase();
  if (!value) return res.json({ exists: false });
  try {
    const [rows] = await pool.query(`SELECT code FROM trip_route WHERE ${field} = ? AND code <> ?`, [
      value, Number(req.query.excludeCode) || 0,
    ]);
    res.json({ exists: rows.length > 0, message: rows.length ? UNIQUE_FIELDS[field] : null });
  } catch (err) {
    next(err);
  }
});

router.get('/:code', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT code, name, short_code, weekdays, status FROM trip_route WHERE code = ?', [
      req.params.code,
    ]);
    if (!rows.length) return res.status(404).json({ message: 'Route not found' });
    const branches = await loadBranches([rows[0].code]);
    res.json({ ...rows[0], branches: branches[rows[0].code] || [] });
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => saveRoute(req, res, next, null));
router.put('/:code', (req, res, next) => saveRoute(req, res, next, Number(req.params.code)));

module.exports = router;
