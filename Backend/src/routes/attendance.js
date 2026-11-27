// Sample: employee attendance by face scan on a shared phone / tablet.
// The device works out a face descriptor (128 numbers, face-api.js) from the camera; the server compares it with
// the samples taken in Employee > Enrol Face and records the punch. No photos are sent or stored.
//   employees: Employee master + face samples (P0401)
//   punch:     the kiosk (P0402)
//   report:    attendance by day (P0403)
const express = require('express');
const pool = require('../config/db');

const STATUSES = ['Active', 'Inactive'];
const DESCRIPTOR_LENGTH = 128;
// Euclidean distance between descriptors. Tested on the face-api demo photos: the same person 0.06-0.14 apart,
// 18 different people never closer than 0.51, but a face looking down matched a stranger at 0.47, so the limit is
// kept well under 0.5. Tune it with real employees: raise it if known people are "not recognised", lower it if
// anyone is ever taken for someone else.
const MATCH_DISTANCE = 0.45;
// Another employee this close to the best match: too close to tell apart, so nobody is marked
const MIN_GAP = 0.06;
// A second scan of the same employee within this time is ignored (they stood in front of the camera too long)
const REPEAT_SECONDS = 120;
const MAX_SAMPLES = 10;

const isDescriptor = (d) => Array.isArray(d) && d.length === DESCRIPTOR_LENGTH && d.every((x) => typeof x === 'number' && Number.isFinite(x));
const distance = (a, b) => Math.sqrt(a.reduce((sum, x, i) => sum + (x - b[i]) ** 2, 0));

// --- Employee master ------------------------------------------------------------------------------
const employees = express.Router();

function validate(body) {
  const empNo = String(body.emp_no || '').trim().toUpperCase();
  const name = String(body.name || '').trim().toUpperCase();
  const department = String(body.department || '').trim() || null;
  const mobile = String(body.mobile ?? '').trim() || null;
  const status = body.status || 'Active';
  if (!empNo) return { error: 'Employee number is required' };
  if (empNo.length > 20) return { error: 'Employee number can be at most 20 characters' };
  if (!name) return { error: 'Name is required' };
  if (mobile && !/^\d{10}$/.test(mobile)) return { error: 'Mobile number must be exactly 10 digits' };
  if (!STATUSES.includes(status)) return { error: 'Status must be Active or Inactive' };
  return { emp_no: empNo, name, department, mobile, status };
}

const LIST_SQL = `SELECT e.code, e.emp_no, e.name, e.department, e.mobile, e.status,
    (SELECT COUNT(*) FROM att_employee_face f WHERE f.emp_code = e.code) AS faces
  FROM att_employee e`;

employees.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${LIST_SQL} ORDER BY e.name`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

employees.get('/check-duplicate', async (req, res, next) => {
  if (req.query.field !== 'emp_no') return res.status(400).json({ message: 'field must be emp_no' });
  const value = String(req.query.value || '').trim().toUpperCase();
  if (!value) return res.json({ exists: false });
  try {
    const [rows] = await pool.query('SELECT code FROM att_employee WHERE emp_no = ? AND code <> ?', [value, Number(req.query.excludeCode) || 0]);
    res.json({ exists: rows.length > 0, message: rows.length ? 'Employee number already exists' : null });
  } catch (err) {
    next(err);
  }
});

employees.get('/:code', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(`${LIST_SQL} WHERE e.code = ?`, [req.params.code]);
    if (!row) return res.status(404).json({ message: 'Employee not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

const duplicate = (err, res, next) => (err.code === 'ER_DUP_ENTRY'
  ? res.status(409).json({ message: 'Employee number already exists' })
  : next(err));

employees.post('/', async (req, res, next) => {
  const v = validate(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  try {
    const [r] = await pool.query(
      'INSERT INTO att_employee (emp_no, name, department, mobile, status, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [v.emp_no, v.name, v.department, v.mobile, v.status, req.user.user_code, req.user.user_code]
    );
    res.status(201).json({ code: r.insertId, ...v });
  } catch (err) {
    duplicate(err, res, next);
  }
});

employees.put('/:code', async (req, res, next) => {
  const v = validate(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  try {
    const [r] = await pool.query(
      'UPDATE att_employee SET emp_no = ?, name = ?, department = ?, mobile = ?, status = ?, updated_by = ? WHERE code = ?',
      [v.emp_no, v.name, v.department, v.mobile, v.status, req.user.user_code, req.params.code]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Employee not found' });
    res.json({ code: Number(req.params.code), ...v });
  } catch (err) {
    duplicate(err, res, next);
  }
});

// Face samples: POST { descriptors: [[128 numbers], ...], replace: true to drop the earlier ones }
employees.post('/:code/faces', async (req, res, next) => {
  const descriptors = Array.isArray(req.body.descriptors) ? req.body.descriptors : [];
  if (!descriptors.length || !descriptors.every(isDescriptor)) {
    return res.status(400).json({ message: 'No usable face sample was sent' });
  }
  try {
    const [[emp]] = await pool.query('SELECT code, emp_no, name FROM att_employee WHERE code = ?', [req.params.code]);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    // The face must not already belong to someone else (e.g. the wrong employee chosen)
    const others = await faceSamples(emp.code);
    for (const d of descriptors) {
      const hit = others.find((o) => distance(o.descriptor, d) < MATCH_DISTANCE);
      if (hit) return res.status(409).json({ message: `This face is already enrolled for ${hit.name} (${hit.emp_no})` });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (req.body.replace) await conn.query('DELETE FROM att_employee_face WHERE emp_code = ?', [emp.code]);
      const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM att_employee_face WHERE emp_code = ?', [emp.code]);
      if (n + descriptors.length > MAX_SAMPLES) {
        await conn.rollback();
        return res.status(400).json({ message: `At most ${MAX_SAMPLES} face samples per employee; choose "Replace" to start again` });
      }
      await conn.query('INSERT INTO att_employee_face (emp_code, descriptor, created_by) VALUES ?', [
        descriptors.map((d) => [emp.code, JSON.stringify(d.map((x) => Math.round(x * 1e6) / 1e6)), req.user.user_code]),
      ]);
      await conn.commit();
      res.json({ name: emp.name, faces: n + descriptors.length });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

// Face samples of active employees (except one), for matching: [{ emp_code, emp_no, name, descriptor }]
async function faceSamples(exceptCode = 0) {
  const [rows] = await pool.query(
    `SELECT f.emp_code, e.emp_no, e.name, f.descriptor FROM att_employee_face f
     JOIN att_employee e ON e.code = f.emp_code AND e.status = 'Active' WHERE f.emp_code <> ?`,
    [exceptCode]
  );
  return rows.map((r) => ({ ...r, descriptor: typeof r.descriptor === 'string' ? JSON.parse(r.descriptor) : r.descriptor }));
}

// --- Kiosk ------------------------------------------------------------------------------------------
const punch = express.Router();

// POST { descriptor: [128 numbers], device } -> { matched: false } | { matched: true, name, emp_no, type, time, repeat }
punch.post('/', async (req, res, next) => {
  const { descriptor } = req.body;
  if (!isDescriptor(descriptor)) return res.status(400).json({ message: 'No usable face was sent' });
  try {
    // Nearest sample per employee
    const best = new Map();
    for (const s of await faceSamples()) {
      const d = distance(s.descriptor, descriptor);
      const cur = best.get(s.emp_code);
      if (!cur || d < cur.d) best.set(s.emp_code, { ...s, d });
    }
    const [first, second] = [...best.values()].sort((a, b) => a.d - b.d);
    // closest / limit: how near the nearest enrolled face was (no name), shown small on the kiosk for tuning
    const miss = first ? { closest: Number(first.d.toFixed(3)), limit: MATCH_DISTANCE } : {};
    if (!first || first.d >= MATCH_DISTANCE) return res.json({ matched: false, ...miss });
    if (second && second.d - first.d < MIN_GAP) return res.json({ matched: false, unsure: true, ...miss });

    const [[last]] = await pool.query(
      `SELECT punch_type, DATE_FORMAT(punch_at, '%H:%i') AS time, TIMESTAMPDIFF(SECOND, punch_at, NOW()) AS ago
       FROM att_punch WHERE emp_code = ? AND punch_at >= CURDATE() ORDER BY punch_at DESC, id DESC LIMIT 1`,
      [first.emp_code]
    );
    const who = { matched: true, name: first.name, emp_no: first.emp_no, distance: Number(first.d.toFixed(3)) };
    if (last && last.ago < REPEAT_SECONDS) return res.json({ ...who, type: last.punch_type, time: last.time, repeat: true });

    const type = !last || last.punch_type === 'Out' ? 'In' : 'Out';
    await pool.query(
      'INSERT INTO att_punch (emp_code, punch_at, punch_type, distance, user_code, device) VALUES (?, NOW(), ?, ?, ?, ?)',
      [first.emp_code, type, who.distance, req.user.user_code, String(req.body.device || '').slice(0, 100) || null]
    );
    const [[now]] = await pool.query("SELECT DATE_FORMAT(NOW(), '%H:%i') AS time");
    res.json({ ...who, type, time: now.time, repeat: false });
  } catch (err) {
    next(err);
  }
});

// --- Report -----------------------------------------------------------------------------------------
const report = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Attendance is personal: unlike other screens' lists, reading it needs the right to the report too
report.use((req, res, next) => (req.user.isAdmin || req.user.programs.has('P0403')
  ? next()
  : res.status(403).json({ message: 'You do not have the right to the attendance report' })));

// ?from=&to= -> one row per employee per day: first In, last Out, worked time (In-Out pairs), number of scans
report.get('/', async (req, res, next) => {
  const from = DATE_RE.test(req.query.from || '') ? req.query.from : null;
  const to = DATE_RE.test(req.query.to || '') ? req.query.to : null;
  if (!from || !to) return res.status(400).json({ message: 'From and to dates are required' });
  try {
    const [punches] = await pool.query(
      `SELECT p.emp_code, e.emp_no, e.name, e.department, DATE_FORMAT(p.punch_at, '%Y-%m-%d') AS day,
         DATE_FORMAT(p.punch_at, '%H:%i') AS time, UNIX_TIMESTAMP(p.punch_at) AS ts, p.punch_type
       FROM att_punch p JOIN att_employee e ON e.code = p.emp_code
       WHERE p.punch_at >= ? AND p.punch_at < ? + INTERVAL 1 DAY
       ORDER BY e.name, p.punch_at, p.id`,
      [from, to]
    );
    const days = new Map();
    punches.forEach((p) => {
      const key = `${p.emp_code}|${p.day}`;
      if (!days.has(key)) {
        days.set(key, {
          emp_code: p.emp_code, emp_no: p.emp_no, name: p.name, department: p.department, day: p.day,
          first_in: null, last_out: null, minutes: 0, scans: 0, open_in: null, punches: [],
        });
      }
      const d = days.get(key);
      d.scans += 1;
      d.punches.push(`${p.punch_type} ${p.time}`);
      if (p.punch_type === 'In') {
        if (!d.first_in) d.first_in = p.time;
        d.open_in = p.ts;
      } else {
        d.last_out = p.time;
        if (d.open_in) d.minutes += Math.round((p.ts - d.open_in) / 60);
        d.open_in = null;
      }
    });
    res.json([...days.values()].map(({ open_in: open, ...d }) => ({ ...d, still_in: Boolean(open) })));
  } catch (err) {
    next(err);
  }
});

module.exports = { employees, punch, report };
