// User activity log (sys_user_log): logins, password changes and every successful change made on a screen.
// Logging never stops a request: if writing the log fails, the error is only printed.
const pool = require('../config/db');

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 45);

async function writeLog(req, { user = req.user, action, programCode = null, module = null, recordRef = null, details = null }) {
  try {
    await pool.query(
      `INSERT INTO sys_user_log (user_code, username, action, program_code, module, record_ref, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user?.user_code ?? null, user?.username ?? null, action, programCode, module,
        recordRef ? String(recordRef).slice(0, 100) : null, details ? String(details).slice(0, 1000) : null, clientIp(req)]
    );
  } catch (err) {
    console.error('Could not write the user log:', err.message);
  }
}

// What was sent, for the log: passwords left out, long lists shortened to their size
function summarize(body) {
  if (!body || typeof body !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (/password/i.test(k)) continue;
    out[k] = Array.isArray(v) ? (v.length > 5 || typeof v[0] === 'object' ? `[${v.length} items]` : v) : v;
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

// Named steps at the end of a path, e.g. POST /api/trip-sheets/3/close
const STEP_ACTIONS = {
  close: 'Close', reopen: 'Reopen', map: 'Map to route', 'expire-password': 'Expire password', run: 'Run sync', 'driver-code': 'Driver code',
  complete: 'Mark complete', 'reopen-bills': 'Reopen bills', save: 'Save bills',
};

// Logs successful changes (anything but GET) on a screen's API: who, which screen, what, which record
const logActivity = (programCode, module) => (req, res, next) => {
  if (req.method === 'GET' || req.path.endsWith('/lock')) return next();
  let response = null;
  const json = res.json.bind(res);
  res.json = (body) => {
    response = body;
    return json(body);
  };
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const parts = req.path.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    const step = STEP_ACTIONS[last];
    const action = step
      || (req.method === 'POST' ? 'Create'
        : req.method === 'PUT' ? (programCode === 'P0203' ? 'Save bills' : 'Update')
          : programCode === 'P0202' ? 'Cancel' : 'Delete'); // deleting a trip sheet marks it Cancelled
    const r = response && typeof response === 'object' ? response : {};
    const b = req.body || {};
    const recordRef = r.tsc_no || b.tsc_no || r.username || b.username || r.number || b.number || r.name || b.name
      || (step === 'Run sync' ? parts[0] : null) || r.code || parts.find((x) => /^\d+$/.test(x)) || null;
    writeLog(req, { action, programCode, module, recordRef, details: summarize(b) });
  });
  next();
};

module.exports = { writeLog, logActivity };
