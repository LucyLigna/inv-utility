const express = require('express');
const pool = require('../config/db');

const router = express.Router();
const STATUSES = ['Active', 'Inactive'];
// Fields that must be unique, with the message shown when they are not
const UNIQUE_FIELDS = {
  name: 'Driver name already exists',
  short_code: 'Short code already exists',
};  

function validate(body) {
  const name = String(body.name || '').trim().toUpperCase();
  const shortCode = String(body.short_code || '').trim().toUpperCase();
  const status = body.status || 'Active';
  if (!name) return { error: 'Driver name is required' };
  if (!shortCode) return { error: 'Short code is required' };
  if (shortCode.length > 10) return { error: 'Short code can be at most 10 characters' };
  if (!STATUSES.includes(status)) return { error: 'Status must be Active or Inactive' };
  return { name, short_code: shortCode, status };
}

function handleDbError(err, res, next) {
  if (err.code === 'ER_DUP_ENTRY') {
    const message = err.message.includes('uq_driver_short_code') ? UNIQUE_FIELDS.short_code : UNIQUE_FIELDS.name;
    return res.status(409).json({ message });
  }
  next(err);
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT code, name, short_code, status FROM driver ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Duplicate check while typing: /api/drivers/check-duplicate?field=short_code&value=SK&excludeCode=3
// excludeCode skips the driver being edited so it doesn't match itself
router.get('/check-duplicate', async (req, res, next) => {
  const { field } = req.query;
  if (!UNIQUE_FIELDS[field]) return res.status(400).json({ message: 'field must be name or short_code' });
  const value = String(req.query.value || '').trim().toUpperCase();
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
    const [rows] = await pool.query('SELECT code, name, short_code, status FROM driver WHERE code = ?', [req.params.code]);
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
      'INSERT INTO driver (name, short_code, status, created_by, updated_by) VALUES (?, ?, ?, ?, ?)',
      [d.name, d.short_code, d.status, req.user.user_code, req.user.user_code]
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
    const [result] = await pool.query('UPDATE driver SET name = ?, short_code = ?, status = ?, updated_by = ? WHERE code = ?', [
      d.name, d.short_code, d.status, req.user.user_code, req.params.code,
    ]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Driver not found' });
    res.json({ code: Number(req.params.code), ...d });
  } catch (err) {
    handleDbError(err, res, next);
  }
});

module.exports = router;
