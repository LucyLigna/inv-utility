// Only one page at a time may work on a trip sheet in Trip Sheet - Bill Details. Each open page has its own
// lock id; Process takes the sheet's lock, the page renews it every 30 s, and it is released when the page
// processes another sheet or is closed. A lock not renewed for LOCK_SECONDS is free again (crashed browser).
const pool = require('../config/db');

const LOCK_SECONDS = 150;

// Another page's live lock on the sheet: { lock_id, username, since } or null
async function otherHolder(tsCode, lockId) {
  const [[row]] = await pool.query(
    `SELECT lock_id, username, DATE_FORMAT(locked_at, '%d-%m-%Y %H:%i') AS since FROM trip_sheet_lock
     WHERE ts_code = ? AND lock_id <> ? AND seen_at > NOW() - INTERVAL ${LOCK_SECONDS} SECOND`,
    [tsCode, String(lockId || '')]
  );
  return row || null;
}

const busyMessage = (tscNo, holder) => `${tscNo} is open by ${holder.username || 'another user'} on another page/machine since ${holder.since}. `
  + 'Close it there first (it is freed by itself a few minutes after that page is closed).';

// Takes or renews the lock for this page; returns the other holder when the sheet is taken
async function acquire(tsCode, lockId, user) {
  const holder = await otherHolder(tsCode, lockId);
  if (holder) return holder;
  await pool.query(
    `INSERT INTO trip_sheet_lock (ts_code, lock_id, user_code, username, locked_at, seen_at) VALUES (?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       locked_at = IF(lock_id = VALUES(lock_id), locked_at, NOW()),
       lock_id = VALUES(lock_id), user_code = VALUES(user_code), username = VALUES(username), seen_at = NOW()`,
    [tsCode, lockId, user.user_code, user.username]
  );
  // Two pages at the same instant: the row holds whichever wrote last; the other one is told it's taken
  const [[row]] = await pool.query('SELECT lock_id FROM trip_sheet_lock WHERE ts_code = ?', [tsCode]);
  return row && row.lock_id !== lockId ? await otherHolder(tsCode, lockId) : null;
}

async function release(tsCode, lockId) {
  await pool.query('DELETE FROM trip_sheet_lock WHERE ts_code = ? AND lock_id = ?', [tsCode, String(lockId || '')]);
}

// The sheets that are open on some page right now: { ts_code: username }
async function openSheets() {
  const [rows] = await pool.query(`SELECT ts_code, username FROM trip_sheet_lock WHERE seen_at > NOW() - INTERVAL ${LOCK_SECONDS} SECOND`);
  return Object.fromEntries(rows.map((r) => [r.ts_code, r.username]));
}

module.exports = { otherHolder, busyMessage, acquire, release, openSheets };
