const express = require('express');
const pool = require('../config/db');

const router = express.Router();
const STATUSES = ['Active', 'Inactive'];

function validate(body) {
  const number = String(body.number || '').trim().toUpperCase();
  const make = String(body.make || '').trim();
  const status = body.status || 'Active';
  if (!number) return { error: 'Vehicle number is required' };
  if (!make) return { error: 'Make is required' };
  if (!STATUSES.includes(status)) return { error: 'Status must be Active or Inactive' };
  return { number, make, status };
}

function handleDbError(err, res, next) {
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Vehicle number already exists' });
  next(err);
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT code, number, make, status FROM vehiclenumber ORDER BY code DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Duplicate check while typing: /api/vehicles/check-number?number=KA01AB1234&excludeCode=5
// excludeCode skips the vehicle being edited so it doesn't match itself
router.get('/check-number', async (req, res, next) => {
  const number = String(req.query.number || '').trim().toUpperCase();
  if (!number) return res.json({ exists: false });
  try {
    const [rows] = await pool.query('SELECT code FROM vehiclenumber WHERE number = ? AND code <> ?', [
      number, Number(req.query.excludeCode) || 0,
    ]);
    res.json({ exists: rows.length > 0, code: rows[0]?.code ?? null });
  } catch (err) {
    next(err);
  }
});

// Same check in the shape the other masters use: /api/vehicles/check-duplicate?field=number&value=KA01AB1234
router.get('/check-duplicate', async (req, res, next) => {
  if (req.query.field !== 'number') return res.status(400).json({ message: 'field must be number' });
  const number = String(req.query.value || '').trim().toUpperCase();
  if (!number) return res.json({ exists: false });
  try {
    const [rows] = await pool.query('SELECT code FROM vehiclenumber WHERE number = ? AND code <> ?', [
      number, Number(req.query.excludeCode) || 0,
    ]);
    res.json({ exists: rows.length > 0, message: rows.length ? 'Vehicle number already exists' : null });
  } catch (err) {
    next(err);
  }
});

router.get('/:code',async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT code, number, make, status FROM vehiclenumber WHERE code = ?', [req.params.code]);
    if (!rows.length) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const v = validate(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  try {
    const [result] = await pool.query('INSERT INTO vehiclenumber (number, make, status) VALUES (?, ?, ?)', [v.number, v.make, v.status]);
    res.status(201).json({ code: result.insertId, ...v });
  } catch (err) {
    handleDbError(err, res, next);
  }
});

router.put('/:code', async (req, res, next) => {
  const v = validate(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  try {
    const [result] = await pool.query('UPDATE vehiclenumber SET number = ?, make = ?, status = ? WHERE code = ?', [
      v.number, v.make, v.status, req.params.code,
    ]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Vehicle not found' });
    res.json({ code: Number(req.params.code), ...v });
  } catch (err) {
    handleDbError(err, res, next);
  }
});

module.exports = router;
