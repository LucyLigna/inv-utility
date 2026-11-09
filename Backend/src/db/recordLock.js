// One page at a time per record (e.g. a trip sheet in Trip Sheet - Bill Details, a trip route in Trip Route Wise
// Customers). Each open page has its own lock id; Process takes the record's lock, the page renews it every 30 s,
// and releases it when it processes another record, moves to another screen or closes. A lock not renewed for
// LOCK_SECONDS is free again (crashed browser). Pages send their id in the X-Record-Lock header with every change.
const pool = require('../config/db');

const LOCK_SECONDS = 150;
const HEADER = 'X-Record-Lock';

// Another page's live lock on the record: { lock_id, username, since } or null
async function otherHolder(type, id, lockId) {
  const [[row]] = await pool.query(
    `SELECT lock_id, username, DATE_FORMAT(locked_at, '%d-%m-%Y %H:%i') AS since FROM record_lock
     WHERE lock_type = ? AND record_id = ? AND lock_id <> ? AND seen_at > NOW() - INTERVAL ${LOCK_SECONDS} SECOND`,
    [type, String(id), String(lockId || '')]
  );
  return row || null;
}

const busyMessage = (label, holder, screen) => `${label} is open${screen ? ` in ${screen}` : ''} by ${holder.username || 'another user'} `
  + `on another page/machine since ${holder.since}. Close it there first (it is freed by itself a few minutes after that page is closed).`;

// Takes or renews the lock for this page; returns the other holder when the record is taken
async function acquire(type, id, lockId, user) {
  const holder = await otherHolder(type, id, lockId);
  if (holder) return holder;
  await pool.query(
    `INSERT INTO record_lock (lock_type, record_id, lock_id, user_code, username, locked_at, seen_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       locked_at = IF(lock_id = VALUES(lock_id), locked_at, NOW()),
       lock_id = VALUES(lock_id), user_code = VALUES(user_code), username = VALUES(username), seen_at = NOW()`,
    [type, String(id), lockId, user.user_code, user.username]
  );
  // Two pages at the same instant: the row holds whichever wrote last; the other one is told it's taken
  const [[row]] = await pool.query('SELECT lock_id FROM record_lock WHERE lock_type = ? AND record_id = ?', [type, String(id)]);
  return row && row.lock_id !== lockId ? otherHolder(type, id, lockId) : null;
}

async function release(type, id, lockId) {
  await pool.query('DELETE FROM record_lock WHERE lock_type = ? AND record_id = ? AND lock_id = ?', [type, String(id), String(lockId || '')]);
}

// Records of a type open on some page right now: { record_id: username }
async function openRecords(type) {
  const [rows] = await pool.query(
    `SELECT record_id, username FROM record_lock WHERE lock_type = ? AND seen_at > NOW() - INTERVAL ${LOCK_SECONDS} SECOND`,
    [type]
  );
  return Object.fromEntries(rows.map((r) => [r.record_id, r.username]));
}

// Adds POST/DELETE /:param/lock to a screen's router and returns a guard for its changes.
//   type: 'trip_sheet' | 'trip_route' ...; param: the route parameter holding the record's code;
//   describe(id): its name for messages, or null when it doesn't exist; screen: shown in the message
function lockRoutes(router, { type, param, describe, screen }) {
  router.post(`/:${param}/lock`, async (req, res, next) => {
    const lockId = String(req.body.lockId || '').slice(0, 40);
    if (!lockId) return res.status(400).json({ message: 'lockId is required' });
    try {
      const label = await describe(req.params[param]);
      if (!label) return res.status(404).json({ message: 'Not found' });
      const holder = await acquire(type, req.params[param], lockId, req.user);
      if (holder) return res.status(409).json({ message: busyMessage(label, holder, screen), open_by: holder.username });
      return res.json({ locked: true });
    } catch (err) {
      return next(err);
    }
  });

  router.delete(`/:${param}/lock`, async (req, res, next) => {
    try {
      await release(type, req.params[param], req.body.lockId || req.get(HEADER));
      res.json({ released: true });
    } catch (err) {
      next(err);
    }
  });

  // Changes only from the page holding the lock (or when no page holds it)
  return async (req, res, next) => {
    try {
      const holder = await otherHolder(type, req.params[param], req.get(HEADER));
      if (!holder) return next();
      const label = (await describe(req.params[param])) || 'This record';
      return res.status(409).json({ message: busyMessage(label, holder, screen) });
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { otherHolder, acquire, release, openRecords, lockRoutes, busyMessage };
