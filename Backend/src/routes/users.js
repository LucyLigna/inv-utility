// User administration (administrators only): users, their type, status and screen rights
const express = require('express');
const pool = require('../config/db');

const router = express.Router();
const TYPES = ['Administrator', 'User'];
const STATUSES = ['Active', 'Inactive'];

// Screens that can be given to a user, grouped by module (Administration screens are for administrators only)
router.get('/programs', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.menu_code, m.name AS menu_name, p.program_code, p.name
       FROM sys_programfile p JOIN sys_menufile m ON m.menu_code = p.menu_code
       WHERE p.status = 'Active' AND m.status = 'Active' AND m.menu_code <> 'M03'
       ORDER BY m.sort_order, p.sort_order`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const [users] = await pool.query(
      `SELECT user_code AS code, username, user_type, status, password_hash IS NOT NULL AS has_password,
         DATE_FORMAT(password_set_at, '%Y-%m-%d %H:%i') AS password_set_at,
         DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i') AS last_login_at
       FROM sys_users ORDER BY username`
    );
    const [rights] = await pool.query('SELECT user_code, program_code FROM sys_user_rights');
    res.json(users.map((u) => ({
      ...u,
      has_password: Boolean(u.has_password),
      rights: rights.filter((r) => r.user_code === u.code).map((r) => r.program_code),
    })));
  } catch (err) {
    next(err);
  }
});

// Duplicate check while typing: /api/users/check-duplicate?field=username&value=ravi&excludeCode=3
router.get('/check-duplicate', async (req, res, next) => {
  if (req.query.field !== 'username') return res.status(400).json({ message: 'field must be username' });
  try {
    const [rows] = await pool.query('SELECT user_code FROM sys_users WHERE username = ? AND user_code <> ?', [
      String(req.query.value || '').trim(), Number(req.query.excludeCode) || 0,
    ]);
    res.json({ exists: rows.length > 0, message: rows.length ? 'User name already exists' : null });
  } catch (err) {
    next(err);
  }
});

function validate(body) {
  const username = String(body.username || '').trim();
  const userType = body.user_type || 'User';
  const status = body.status || 'Active';
  if (!username) return { error: 'User name is required' };
  if (username.length > 50) return { error: 'User name can be at most 50 characters' };
  if (/\s/.test(username)) return { error: 'User name cannot contain spaces' };
  if (!TYPES.includes(userType)) return { error: 'User type must be Administrator or User' };
  if (!STATUSES.includes(status)) return { error: 'Status must be Active or Inactive' };
  // Administrators have every right, so their list is not kept
  const rights = userType === 'Administrator' ? [] : [...new Set((Array.isArray(body.rights) ? body.rights : []).map(String))];
  // An active user of type User must be able to open at least one screen
  if (userType === 'User' && status === 'Active' && !rights.length) {
    return { error: 'Give an active user the right to at least one screen' };
  }
  return { username, user_type: userType, status, rights };
}

// Screens kept from before keep who gave them; new ones are recorded against the administrator saving now
async function saveRights(conn, userCode, rights, by) {
  const [before] = await conn.query('SELECT program_code, created_by FROM sys_user_rights WHERE user_code = ?', [userCode]);
  const givenBy = new Map(before.map((b) => [b.program_code, b.created_by]));
  await conn.query('DELETE FROM sys_user_rights WHERE user_code = ?', [userCode]);
  if (rights.length) {
    const [valid] = await conn.query(
      "SELECT program_code FROM sys_programfile WHERE program_code IN (?) AND menu_code <> 'M03'",
      [rights]
    );
    if (valid.length) {
      await conn.query('INSERT INTO sys_user_rights (user_code, program_code, created_by, updated_by) VALUES ?', [
        valid.map((v) => [userCode, v.program_code, givenBy.has(v.program_code) ? givenBy.get(v.program_code) : by, by]),
      ]);
    }
  }
}

// New user: no password yet; they create it at their first login
router.post('/', async (req, res, next) => {
  const u = validate(req.body);
  if (u.error) return res.status(400).json({ message: u.error });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO sys_users (username, user_type, status, created_by, updated_by) VALUES (?, ?, ?, ?, ?)',
      [u.username, u.user_type, u.status, req.user.user_code, req.user.user_code]
    );
    await saveRights(conn, result.insertId, u.rights, req.user.user_code);
    await conn.commit();
    res.status(201).json({ code: result.insertId, ...u });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'User name already exists' });
    next(err);
  } finally {
    conn.release();
  }
});

router.put('/:code', async (req, res, next) => {
  const u = validate(req.body);
  if (u.error) return res.status(400).json({ message: u.error });
  const code = Number(req.params.code);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[current]] = await conn.query('SELECT user_type, status FROM sys_users WHERE user_code = ? FOR UPDATE', [code]);
    if (!current) {
      await conn.rollback();
      return res.status(404).json({ message: 'User not found' });
    }
    // You can't take away your own administrator rights or switch yourself off
    if (code === req.user.user_code && (u.user_type !== current.user_type || u.status !== 'Active')) {
      await conn.rollback();
      return res.status(400).json({ message: 'You cannot change your own user type or make yourself inactive' });
    }
    // There must always be at least one active administrator
    const stillAdmin = u.user_type === 'Administrator' && u.status === 'Active';
    if (current.user_type === 'Administrator' && current.status === 'Active' && !stillAdmin) {
      const [[others]] = await conn.query(
        "SELECT COUNT(*) n FROM sys_users WHERE user_type = 'Administrator' AND status = 'Active' AND user_code <> ?",
        [code]
      );
      if (!others.n) {
        await conn.rollback();
        return res.status(400).json({ message: 'This is the only active administrator; there must always be one' });
      }
    }
    await conn.query('UPDATE sys_users SET username = ?, user_type = ?, status = ?, updated_by = ? WHERE user_code = ?', [
      u.username, u.user_type, u.status, req.user.user_code, code,
    ]);
    await saveRights(conn, code, u.rights, req.user.user_code);
    await conn.commit();
    res.json({ code, ...u });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'User name already exists' });
    next(err);
  } finally {
    conn.release();
  }
});

// Expire a user's password: it is cleared, and the user creates a new one at the next login
router.post('/:code/expire-password', async (req, res, next) => {
  const code = Number(req.params.code);
  if (code === req.user.user_code) {
    return res.status(400).json({ message: 'Use Change password for your own password' });
  }
  try {
    const [result] = await pool.query(
      'UPDATE sys_users SET password_hash = NULL, password_set_at = NULL, updated_by = ? WHERE user_code = ?',
      [req.user.user_code, code]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'User not found' });
    const [[row]] = await pool.query('SELECT username FROM sys_users WHERE user_code = ?', [code]);
    res.json({ code, username: row.username, has_password: false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
