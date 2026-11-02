const express = require('express');
const pool = require('../config/db');
const jobs = require('../sync/jobs');
const { runJob } = require('../sync/runner');

const router = express.Router();

// Last 50 scheduler runs, newest first
router.get('/log', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sync_log ORDER BY id DESC LIMIT 50');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Run a job now instead of waiting for its schedule: POST /api/sync/customer/run
router.post('/:job/run', async (req, res, next) => {
  if (!jobs[req.params.job]) return res.status(404).json({ message: `Unknown job. Use one of: ${Object.keys(jobs).join(', ')}` });
  try {
    res.json(await runJob(req.params.job));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
