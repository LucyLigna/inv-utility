// Starts the timed sync jobs. Only runs when SCHEDULER_ENABLED=true, so a developer's
// copy of the backend doesn't pull data at the same time as the server.
const cron = require('node-cron');
const pool = require('../config/db');
const jobs = require('./jobs');
const { runJob } = require('./runner');

const TIMEZONE = 'Asia/Kolkata';

async function run(name) {
  const result = await runJob(name);
  console.log(`[sync] ${new Date().toISOString()} ${name}:`, JSON.stringify(result));
}

// After a restart, run any job whose last successful run is older than its interval
// (e.g. the server was off at 06:00), so a missed daily run isn't skipped for a whole day.
async function catchUp() {
  await pool.query("UPDATE sync_log SET status = 'Failed', finished_at = NOW(), message = 'Interrupted by restart' WHERE status = 'Running'");
  for (const [name, job] of Object.entries(jobs)) {
    const [rows] = await pool.query(
      "SELECT 1 FROM sync_log WHERE job = ? AND status = 'Success' AND started_at > NOW() - INTERVAL ? MINUTE LIMIT 1",
      [name, job.intervalMinutes]
    );
    if (!rows.length) await run(name);
  }
}

function startScheduler() {
  if (process.env.SCHEDULER_ENABLED !== 'true') {
    console.log('[sync] Scheduler is off (set SCHEDULER_ENABLED=true to turn it on)');
    return;
  }
  for (const [name, job] of Object.entries(jobs)) {
    cron.schedule(job.schedule, () => run(name), { timezone: TIMEZONE, name });
    console.log(`[sync] ${name} scheduled: ${job.schedule}`);
  }
  setTimeout(() => catchUp().catch((err) => console.error('[sync] catch-up failed:', err)), 10 * 1000);
}

module.exports = { startScheduler };
