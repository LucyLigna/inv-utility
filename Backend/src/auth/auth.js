// Passwords, login tokens and the checks that protect the API.
//
// Passwords are stored as salted scrypt hashes ("scrypt$<salt>$<hash>").
// A login token is "<payload>.<signature>": base64url JSON { u: user_code, exp } signed with HMAC-SHA256.
// The signing key is created once and kept in sys_settings, so tokens survive restarts and no .env change is needed.
const crypto = require('crypto');
const pool = require('../config/db');

const TOKEN_HOURS = 12;
const MIN_PASSWORD = 6;

// --- Passwords -------------------------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const given = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const passwordProblem = (password) => (String(password || '').length < MIN_PASSWORD
  ? `Password must be at least ${MIN_PASSWORD} characters`
  : null);

// --- Tokens ----------------------------------------------------------------------------------
let secret = null;
async function signingKey() {
  if (secret) return secret;
  await pool.query('INSERT IGNORE INTO sys_settings (setting_key, setting_value) VALUES (?, ?)', [
    'auth_secret', crypto.randomBytes(48).toString('hex'),
  ]);
  const [[row]] = await pool.query("SELECT setting_value FROM sys_settings WHERE setting_key = 'auth_secret'");
  secret = row.setting_value;
  return secret;
}

const sign = (data, key) => crypto.createHmac('sha256', key).update(data).digest('base64url');

async function createToken(userCode) {
  const payload = Buffer.from(JSON.stringify({ u: userCode, exp: Date.now() + TOKEN_HOURS * 3600 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload, await signingKey())}`;
}

async function readToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload, await signingKey());
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
}

// --- The logged-in user ----------------------------------------------------------------------
// { user_code, username, user_type, isAdmin, programs: Set of program codes, routes: [screen routes] }
async function loadUser(userCode) {
  const [[user]] = await pool.query(
    "SELECT user_code, username, user_type FROM sys_users WHERE user_code = ? AND status = 'Active' AND password_hash IS NOT NULL",
    [userCode]
  );
  if (!user) return null;
  const isAdmin = user.user_type === 'Administrator';
  const [programs] = isAdmin
    ? await pool.query("SELECT program_code, route FROM sys_programfile WHERE status = 'Active'")
    : await pool.query(
      `SELECT p.program_code, p.route FROM sys_user_rights r JOIN sys_programfile p ON p.program_code = r.program_code
       WHERE r.user_code = ? AND p.status = 'Active' AND p.menu_code <> 'M03'`,
      [userCode]
    );
  return {
    ...user,
    isAdmin,
    programs: new Set(programs.map((p) => p.program_code)),
    routes: programs.map((p) => p.route),
  };
}

const publicUser = (u) => ({
  user_code: u.user_code, username: u.username, user_type: u.user_type, isAdmin: u.isAdmin,
  programs: [...u.programs], routes: u.routes,
});

// Every API call (except login) needs a valid token from an active user: "Authorization: Bearer <token>"
async function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const data = await readToken(token);
    const user = data && await loadUser(data.u);
    if (!user) return res.status(401).json({ message: 'Please log in again' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Changes (anything but GET) on a screen's API need the right to that screen; reading is open to any
// logged-in user, because other screens read the same lists (e.g. Trip Sheet lists drivers and routes)
const requireRight = (programCode) => (req, res, next) => {
  if (req.method === 'GET' || req.user.isAdmin || req.user.programs.has(programCode)) return next();
  return res.status(403).json({ message: 'You do not have the right to change data on this screen' });
};

const requireAdmin = (req, res, next) => (req.user.isAdmin
  ? next()
  : res.status(403).json({ message: 'Only an administrator can do this' }));

module.exports = {
  hashPassword, checkPassword, passwordProblem, createToken, loadUser, publicUser,
  requireAuth, requireRight, requireAdmin,
};
