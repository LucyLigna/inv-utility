// Runs one sync job: fetch from the API, insert or update the table, record the run in sync_log.
const pool = require('../config/db');
const jobs = require('./jobs');
const { fetchRows } = require('./invApi');

// Safety stop for loopUntilEmpty jobs (500 batches = 50,000 customers at 100 per call)
const MAX_BATCHES = 500;
const ANALYZE_AFTER_ROWS = 1000;
const running = new Set();

// API row { COMPANY_CODE: 'BAD', LAST_UPDATE: '2026-11-02T00:20:41' } -> values in column order
function toValues(job, row) {
  return job.columns.map((col) => {
    const value = row[col.toUpperCase()];
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.replace('T', ' ').slice(0, 19);
    return value;
  });
}

function upsertSql(job) {
  const cols = job.columns.map((c) => `\`${c}\``).join(', ');
  const updates = job.columns
    .filter((c) => !job.keys.includes(c))
    .map((c) => `\`${c}\` = new.\`${c}\``)
    .join(', ');
  return `INSERT INTO \`${job.table}\` (${cols}) VALUES ? AS new ON DUPLICATE KEY UPDATE ${updates}`;
}

// Saves a whole batch in one statement. If that fails, saves row by row so one bad row
// doesn't lose the others; rows that still fail go to sync_failed_row with the error.
async function saveBatch(name, job, rows) {
  const sql = upsertSql(job);
  try {
    await pool.query(sql, [rows.map((r) => toValues(job, r))]);
    return { saved: rows.length, failed: 0 };
  } catch (batchErr) {
    let saved = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await pool.query(sql, [[toValues(job, row)]]);
        saved += 1;
      } catch (rowErr) {
        failed += 1;
        await pool.query('INSERT INTO sync_failed_row (job, payload, error) VALUES (?, ?, ?)', [
          name, JSON.stringify(row), rowErr.message.slice(0, 1000),
        ]);
      }
    }
    return { saved, failed };
  }
}

async function runJob(name) {
  const job = jobs[name];
  if (!job) throw new Error(`Unknown sync job: ${name}`);
  if (running.has(name)) return { skipped: true, message: `${name} sync is already running` };

  running.add(name);
  const [log] = await pool.query("INSERT INTO sync_log (job, started_at, status) VALUES (?, NOW(), 'Running')", [name]);
  const stats = { batches: 0, saved: 0, failed: 0 };
  const seen = new Set();

  try {
    for (;;) {
      const rows = await fetchRows(job.url);
      if (!rows.length) break;
      stats.batches += 1;

      const result = await saveBatch(name, job, rows);
      stats.saved += result.saved;
      stats.failed += result.failed;
      await pool.query('UPDATE sync_log SET batches = ?, row_count = ? WHERE id = ?', [stats.batches, stats.saved, log.insertId]);

      if (!job.loopUntilEmpty) break;

      // Stop if the API keeps sending rows we already got in this run, so it can't loop forever
      const keys = rows.map((r) => job.keys.map((k) => r[k.toUpperCase()]).join('|'));
      if (keys.every((k) => seen.has(k))) throw new Error('API is returning the same rows again; stopped to avoid an endless loop');
      keys.forEach((k) => seen.add(k));
      if (stats.batches >= MAX_BATCHES) throw new Error(`Stopped after ${MAX_BATCHES} batches; the rest will load on the next run`);
    }

    // After a big load, refresh MySQL's row statistics so view_customer_list searches keep a fast join order
    if (stats.saved >= ANALYZE_AFTER_ROWS) await pool.query(`ANALYZE TABLE \`${job.table}\``);

    const message = stats.failed ? `${stats.failed} rows failed; see sync_failed_row` : null;
    await pool.query("UPDATE sync_log SET status = 'Success', finished_at = NOW(), message = ? WHERE id = ?", [message, log.insertId]);
    return { job: name, status: 'Success', ...stats };
  } catch (err) {
    await pool.query("UPDATE sync_log SET status = 'Failed', finished_at = NOW(), message = ? WHERE id = ?", [
      err.message.slice(0, 1000), log.insertId,
    ]);
    return { job: name, status: 'Failed', message: err.message, ...stats };
  } finally {
    running.delete(name);
  }
}

module.exports = { runJob, saveBatch };
