const express = require('express');
const pool = require('../config/db');

const router = express.Router();
const STATUSES = ['Active', 'Inactive'];
// Fields that must be unique, with the message shown when they are not
const UNIQUE_FIELDS = {
  name: 'Driver name already exists',
  short_code: 'Short code already exists',
  mobile: 'Another driver has this mobile number',
};

// '+91 98470 12345' -> '9847012345'; the driver logs in to the delivery page with this number
const normalizeMobile = (v) => {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

function validate(body) {
  const name = String(body.name || '').trim().toUpperCase();
  const shortCode = String(body.short_code || '').trim().toUpperCase();
  const mobile = normalizeMobile(body.mobile);
  const status = body.status || 'Active';
  if (!name) return { error: 'Driver name is required' };
  if (!shortCode) return { error: 'Short code is required' };
  if (shortCode.length > 10) return { error: 'Short code can be at most 10 characters' };
  if (mobile && !/^\d{10}$/.test(mobile)) return { error: 'Mobile number must be 10 digits' };
  if (!STATUSES.includes(status)) return { error: 'Status must be Active or Inactive' };
  return { name, short_code: shortCode, mobile: mobile || null, status };
}

function handleDbError(err, res, next) {
  if (err.code === 'ER_DUP_ENTRY') {
    const field = ['short_code', 'mobile'].find((f) => err.message.includes(`uq_driver_${f}`)) || 'name';
    const message = UNIQUE_FIELDS[field];
    return res.status(409).json({ message });
  }
  next(err);
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT code, name, short_code, mobile, status FROM driver ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Duplicate check while typing: /api/drivers/check-duplicate?field=short_code&value=SK&excludeCode=3
// excludeCode skips the driver being edited so it doesn't match itself
router.get('/check-duplicate', async (req, res, next) => {
  const { field } = req.query;
  if (!UNIQUE_FIELDS[field]) return res.status(400).json({ message: 'field must be name, short_code or mobile' });
  const value = field === 'mobile' ? normalizeMobile(req.query.value) : String(req.query.value || '').trim().toUpperCase();
  if (!value) return res.json({ exists: false });
  try {
    const [rows] = await pool.query(`SELECT code FROM driver WHERE ${field} = ? AND code <> ?`, [
      value, Number(req.query.excludeCode) || 0,
    ]);
    res.json({ exists: rows.length > 0, message: rows.length ? UNIQUE_FIELDS[field] : null });
  } catch (err) {
    next(err);
  }
});

router.get('/:code', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT code, name, short_code, mobile, status FROM driver WHERE code = ?', [req.params.code]);
    if (!rows.length) return res.status(404).json({ message: 'Driver not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const d = validate(req.body);
  if (d.error) return res.status(400).json({ message: d.error });
  try {
    const [result] = await pool.query(
      'INSERT INTO driver (name, short_code, mobile, status, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
      [d.name, d.short_code, d.mobile, d.status, req.user.user_code, req.user.user_code]
    );
    res.status(201).json({ code: result.insertId, ...d });
  } catch (err) {
    handleDbError(err, res, next);
  }
});

router.put('/:code', async (req, res, next) => {
  const d = validate(req.body);
  if (d.error) return res.status(400).json({ message: d.error });
  try {
    const [result] = await pool.query('UPDATE driver SET name = ?, short_code = ?, mobile = ?, status = ?, updated_by = ? WHERE code = ?', [
      d.name, d.short_code, d.mobile, d.status, req.user.user_code, req.params.code,
    ]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Driver not found' });
    res.json({ code: Number(req.params.code), ...d });
  } catch (err) {
    handleDbError(err, res, next);
  }
});

module.exports = router;
