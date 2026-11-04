const express = require('express');
const pool = require('../config/db');
const {
  hashPassword, checkPassword, passwordProblem, createToken, loadUser, publicUser, requireAuth,
} = require('../auth/auth');

const router = express.Router();

const findUser = async (username) => {
  const [[user]] = await pool.query(
    'SELECT user_code, username, password_hash, status FROM sys_users WHERE username = ?',
    [String(username || '').trim()]
  );
  return user;
};

// Sign in and hand back a token with the user's rights
async function signIn(res, userCode) {
  await pool.query('UPDATE sys_users SET last_login_at = NOW() WHERE user_code = ?', [userCode]);
  const user = await loadUser(userCode);
  res.json({ token: await createToken(userCode), user: publicUser(user) });
}

// POST { username, password }. A user without a password (new, or expired by an administrator) gets
// { needsPassword: true } and creates one with /set-password.
router.post('/login', async (req, res, next) => {
  try {
    const user = await findUser(req.body.username);
    if (!user || user.status !== 'Active') return res.status(401).json({ message: 'Unknown or inactive user name' });
    if (!user.password_hash) return res.json({ needsPassword: true, username: user.username });
    if (!checkPassword(String(req.body.password || ''), user.password_hash)) {
      return res.status(401).json({ message: 'Wrong password' });
    }
    await signIn(res, user.user_code);
  } catch (err) {
    next(err);
  }
});

// First login (or after the password was expired): POST { username, password } sets the password and signs in.
// Only works while the user has no password.
router.post('/set-password', async (req, res, next) => {
  try {
    const problem = passwordProblem(req.body.password);
    if (problem) return res.status(400).json({ message: problem });
    const user = await findUser(req.body.username);
    if (!user || user.status !== 'Active') return res.status(401).json({ message: 'Unknown or inactive user name' });
    const [result] = await pool.query(
      'UPDATE sys_users SET password_hash = ?, password_set_at = NOW() WHERE user_code = ? AND password_hash IS NULL',
      [hashPassword(req.body.password), user.user_code]
    );
    if (!result.affectedRows) return res.status(400).json({ message: 'This user already has a password; log in with it' });
    await signIn(res, user.user_code);
  } catch (err) {
    next(err);
  }
});

// The logged-in user and their rights
router.get('/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

// POST { current, password }: change your own password
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const problem = passwordProblem(req.body.password);
    if (problem) return res.status(400).json({ message: problem });
    const [[row]] = await pool.query('SELECT password_hash FROM sys_users WHERE user_code = ?', [req.user.user_code]);
    if (!checkPassword(String(req.body.current || ''), row.password_hash)) {
      return res.status(400).json({ message: 'Current password is wrong' });
    }
    await pool.query('UPDATE sys_users SET password_hash = ?, password_set_at = NOW() WHERE user_code = ?', [
      hashPassword(req.body.password), req.user.user_code,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
