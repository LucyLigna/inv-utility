// Reading the user activity log (administrators only)
const express = require('express');
const pool = require('../config/db');

const router = express.Router();
const LIMIT = 2000;
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

// ?from=YYYY-MM-DD&to=YYYY-MM-DD&user=<user_code>&action=<action>&search=<text in screen, record or details>
router.get('/', async (req, res, next) => {
  const where = [];
  const params = [];
  if (isDate(req.query.from)) { where.push('l.log_time >= ?'); params.push(req.query.from); }
  if (isDate(req.query.to)) { where.push('l.log_time < ? + INTERVAL 1 DAY'); params.push(req.query.to); }
  if (req.query.user) { where.push('l.user_code = ?'); params.push(Number(req.query.user)); }
  if (req.query.action) { where.push('l.action = ?'); params.push(String(req.query.action)); }
  const search = String(req.query.search || '').trim();
  if (search) {
    const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(l.module LIKE ? OR l.record_ref LIKE ? OR l.details LIKE ? OR l.username LIKE ?)');
    params.push(like, like, like, like);
  }
  try {
    const [rows] = await pool.query(
      `SELECT l.log_id, DATE_FORMAT(l.log_time, '%Y-%m-%d %H:%i:%s') AS log_time, l.user_code, l.username, l.action,
         l.module, l.record_ref, l.details, l.ip_address
       FROM sys_user_log l ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY l.log_id DESC LIMIT ${LIMIT}`,
      params
    );
    res.json({ rows, limited: rows.length === LIMIT });
  } catch (err) {
    next(err);
  }
});

// Users and actions that appear in the log, for the filter lists
router.get('/filters', async (req, res, next) => {
  try {
    const [users] = await pool.query('SELECT user_code, username FROM sys_users ORDER BY username');
    const [actions] = await pool.query('SELECT DISTINCT action FROM sys_user_log ORDER BY action');
    res.json({ users, actions: actions.map((a) => a.action) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
