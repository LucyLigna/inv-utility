// Branch Wise Bill Marking: a branch's bills (salesdetails) for a date range, each marked for a trip sheet.
// A user of type User sees only the branches given to them in Users (sys_user_branches); administrators see all.
// Saving puts the marked bills on their trip sheets (trip_sheet_bills, as Trip Sheet - Bill Details does) and takes
// unmarked ones off; sheets that are closed, cancelled, bills-complete or open in Trip Sheet - Bill Details on
// another page are not changed.
const express = require('express');
const pool = require('../config/db');
const { CUSTOMER_NAME } = require('../db/sheetBills');
const { otherHolder, busyMessage } = require('../db/recordLock');

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// The customer a bill belongs to (a manual bill may be entered for another company - branch than the customer's)
const CU_CO = 'COALESCE(s.cu_company_code, s.company_code)';
const CU_BA = 'COALESCE(s.cu_ba_code, s.ba_code)';

// The branches this user may work on: [{ company_code, ba_code, company_branch, company_branch_code }]
async function userBranches(user) {
  const [rows] = user.isAdmin
    ? await pool.query('SELECT company_code, ba_code, company_branch, company_branch_code FROM view_branch_list ORDER BY company_branch')
    : await pool.query(
      `SELECT b.company_code, b.ba_code, b.company_branch, b.company_branch_code
       FROM sys_user_branches u JOIN view_branch_list b ON b.company_code = u.company_code AND b.ba_code = u.ba_code
       WHERE u.user_code = ? ORDER BY b.company_branch`,
      [user.user_code]
    );
  return rows;
}
const mayUse = (branches, company, branch) => branches.some((b) => b.company_code === company && b.ba_code === branch);

router.get('/branches', async (req, res, next) => {
  try {
    res.json(await userBranches(req.user));
  } catch (err) {
    next(err);
  }
});

// Trip sheets a bill of the branch can go on: Active, bills not complete, and the sheet's route serves the branch
router.get('/sheets', async (req, res, next) => {
  const { company_code: company, ba_code: branch } = req.query;
  try {
    if (!mayUse(await userBranches(req.user), company, branch)) return res.status(403).json({ message: 'This branch is not given to you' });
    const [rows] = await pool.query(
      `SELECT s.ts_code AS code, s.tsc_no, s.trip_code, r.name AS route_name, DATE_FORMAT(s.loading_date, '%Y-%m-%d') AS loading_date
       FROM trip_sheet s JOIN trip_route r ON r.code = s.trip_code
       WHERE s.status = 'Active' AND s.bills_completed_at IS NULL
         AND EXISTS (SELECT 1 FROM trip_route_branches b WHERE b.trip_code = s.trip_code AND b.company_code = ? AND b.ba_code = ? AND b.status = 'Active')
       ORDER BY s.ts_code DESC`,
      [company, branch]
    );
    // Each sheet's customer order (Trip Route Wise Customers of its route): { 'company|branch|customer': position }
    const tripCodes = [...new Set(rows.map((r) => r.trip_code))];
    const [order] = tripCodes.length
      ? await pool.query('SELECT trip_code, company_code, ba_code, cu_code, sort_order FROM trip_route_customers WHERE trip_code IN (?)', [tripCodes])
      : [[]];
    res.json(rows.map((r) => ({
      ...r,
      customer_order: Object.fromEntries(order.filter((o) => o.trip_code === r.trip_code)
        .map((o) => [`${o.company_code}|${o.ba_code}|${o.cu_code}`, o.sort_order])),
    })));
  } catch (err) {
    next(err);
  }
});

// The branch's bills for a bill date range: ?company_code=&ba_code=&from=&to=
// Each with the trip sheet it is on (if any; locked = can't be changed here) and the suggested sheet: the active
// sheet of a route the customer is on in Trip Route Wise Customers
router.get('/bills', async (req, res, next) => {
  const { company_code: company, ba_code: branch } = req.query;
  const from = DATE_RE.test(req.query.from || '') ? req.query.from : null;
  const to = DATE_RE.test(req.query.to || '') ? req.query.to : null;
  if (!from || !to) return res.status(400).json({ message: 'From and to dates are required' });
  try {
    if (!mayUse(await userBranches(req.user), company, branch)) return res.status(403).json({ message: 'This branch is not given to you' });
    const [rows] = await pool.query(
      `SELECT s.company_code, s.ba_code, s.sm_slno, s.smc_no, DATE_FORMAT(COALESCE(s.smd_date, DATE(s.inp_dt_tm)), '%Y-%m-%d') AS bill_date,
         s.cu_code, ${CU_CO} AS cust_company_code, ${CU_BA} AS cust_ba_code, ${CUSTOMER_NAME} AS cuc_desc, c.cuc_place, s.net_amount, s.pack_qty, s.tpc_desc, s.transporter_type, s.is_manual,
         ts.ts_code AS sheet_code, ts.tsc_no AS sheet_no, ts.status AS sheet_status, ts.bills_completed_at IS NOT NULL AS sheet_complete,
         (SELECT GROUP_CONCAT(x.ts_code ORDER BY x.ts_code DESC)
            FROM trip_route_customers t
            JOIN trip_sheet x ON x.trip_code = t.trip_code AND x.status = 'Active' AND x.bills_completed_at IS NULL
           WHERE t.company_code = ${CU_CO} AND t.ba_code = ${CU_BA} AND t.cu_code = s.cu_code) AS suggested
       FROM salesdetails s
       LEFT JOIN customer c ON c.company_code = ${CU_CO} AND c.ba_code = ${CU_BA} AND c.cu_code = s.cu_code
       LEFT JOIN trip_sheet_bills tb ON tb.company_code = s.company_code AND tb.ba_code = s.ba_code AND tb.sm_slno = s.sm_slno
         AND tb.ts_code IN (SELECT ts_code FROM trip_sheet WHERE status <> 'Cancelled')
       LEFT JOIN trip_sheet ts ON ts.ts_code = tb.ts_code
       WHERE s.company_code = ? AND s.ba_code = ? AND s.smd_date BETWEEN ? AND ?
       ORDER BY s.smd_date, s.smc_no
       LIMIT 2000`,
      [company, branch, from, to]
    );
    res.json(rows.map((r) => ({
      ...r,
      is_manual: Boolean(r.is_manual),
      sheet_complete: Boolean(r.sheet_complete),
      // on a sheet that can't be changed here
      locked: Boolean(r.sheet_code) && (r.sheet_status !== 'Active' || Boolean(r.sheet_complete)),
      suggested: r.suggested ? r.suggested.split(',').map(Number) : [],
    })));
  } catch (err) {
    next(err);
  }
});

// Save: { changes: [{ company_code, ba_code, sm_slno, ts_code }] } where ts_code is the sheet the bill should be on,
// or null to take it off its sheet. All or nothing.
router.post('/save', async (req, res, next) => {
  const changes = (Array.isArray(req.body.changes) ? req.body.changes : []).map((c) => ({
    company_code: String(c.company_code || ''), ba_code: String(c.ba_code || ''), sm_slno: String(c.sm_slno || ''),
    ts_code: c.ts_code ? Number(c.ts_code) : null,
  })).filter((c) => c.company_code && c.ba_code && c.sm_slno);
  if (!changes.length) return res.status(400).json({ message: 'Nothing to save' });
  const conn = await pool.getConnection();
  const fail = async (status, message) => { await conn.rollback(); return res.status(status).json({ message }); };
  try {
    const branches = await userBranches(req.user);
    const notMine = changes.find((c) => !mayUse(branches, c.company_code, c.ba_code));
    if (notMine) return res.status(403).json({ message: 'A bill of a branch not given to you cannot be changed' });

    await conn.beginTransaction();
    const keys = changes.map((c) => [c.company_code, c.ba_code, c.sm_slno]);
    const [bills] = await conn.query(
      'SELECT company_code, ba_code, sm_slno, smc_no, pack_qty, net_amount FROM salesdetails WHERE (company_code, ba_code, sm_slno) IN (?)',
      [keys]
    );
    if (bills.length !== changes.length) return fail(400, 'One or more bills no longer exist');
    const billOf = new Map(bills.map((b) => [`${b.company_code}|${b.ba_code}|${b.sm_slno}`, b]));
    const [current] = await conn.query(
      `SELECT tb.company_code, tb.ba_code, tb.sm_slno, tb.ts_code FROM trip_sheet_bills tb
       JOIN trip_sheet ts ON ts.ts_code = tb.ts_code AND ts.status <> 'Cancelled'
       WHERE (tb.company_code, tb.ba_code, tb.sm_slno) IN (?) FOR UPDATE`,
      [keys]
    );
    const onSheet = new Map(current.map((c) => [`${c.company_code}|${c.ba_code}|${c.sm_slno}`, c.ts_code]));

    // Every sheet touched (taken off or put on) must be changeable: lock them, then check
    const touched = new Set();
    changes.forEach((c) => {
      const from = onSheet.get(`${c.company_code}|${c.ba_code}|${c.sm_slno}`) || null;
      if (from !== c.ts_code) {
        if (from) touched.add(from);
        if (c.ts_code) touched.add(c.ts_code);
      }
    });
    const sheetCodes = [...touched];
    const sheets = new Map();
    if (sheetCodes.length) {
      const [rows] = await conn.query(
        `SELECT s.ts_code, s.tsc_no, s.trip_code, s.status, s.bills_completed_at FROM trip_sheet s WHERE s.ts_code IN (?) FOR UPDATE`,
        [sheetCodes]
      );
      rows.forEach((s) => sheets.set(s.ts_code, s));
    }
    for (const code of sheetCodes) {
      const s = sheets.get(code);
      if (!s) return fail(404, 'Trip sheet not found');
      if (s.status !== 'Active') return fail(400, `Trip sheet ${s.tsc_no} is ${s.status.toLowerCase()}; its bills can't be changed`);
      if (s.bills_completed_at) return fail(400, `The bills of ${s.tsc_no} are marked complete; its bills can't be changed`);
      // Open in Trip Sheet - Bill Details on another page: that page saves its whole list, so don't change it here
      const holder = await otherHolder('trip_sheet', code, req.get('X-Record-Lock'));
      if (holder) return fail(409, busyMessage(s.tsc_no, holder, 'Trip Sheet - Bill Details'));
    }
    // A bill only goes on a sheet whose route serves its branch
    const putOn = changes.filter((c) => c.ts_code && (onSheet.get(`${c.company_code}|${c.ba_code}|${c.sm_slno}`) || null) !== c.ts_code);
    for (const c of putOn) {
      const s = sheets.get(c.ts_code);
      const [[served]] = await conn.query(
        "SELECT 1 AS ok FROM trip_route_branches WHERE trip_code = ? AND company_code = ? AND ba_code = ? AND status = 'Active'",
        [s.trip_code, c.company_code, c.ba_code]
      );
      if (!served) return fail(400, `Trip sheet ${s.tsc_no}'s route does not serve the branch of bill ${billOf.get(`${c.company_code}|${c.ba_code}|${c.sm_slno}`).smc_no}`);
    }

    let added = 0;
    let removed = 0;
    for (const c of changes) {
      const key = `${c.company_code}|${c.ba_code}|${c.sm_slno}`;
      const from = onSheet.get(key) || null;
      if (from === c.ts_code) continue;
      if (from) {
        await conn.query('DELETE FROM trip_sheet_bills WHERE ts_code = ? AND company_code = ? AND ba_code = ? AND sm_slno = ?',
          [from, c.company_code, c.ba_code, c.sm_slno]);
        removed += 1;
      }
      if (c.ts_code) {
        const b = billOf.get(key);
        await conn.query(
          `INSERT INTO trip_sheet_bills (ts_code, company_code, ba_code, sm_slno, pack_qty, amount, sort_order, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          [c.ts_code, c.company_code, c.ba_code, c.sm_slno, b.pack_qty, b.net_amount, req.user.user_code, req.user.user_code]
        );
        added += 1;
      }
    }
    // The sheets' totals, as Trip Sheet - Bill Details keeps them
    for (const code of sheetCodes) {
      await conn.query(
        `UPDATE trip_sheet SET
           total_bills = (SELECT COUNT(*) FROM trip_sheet_bills WHERE ts_code = ?),
           total_pack_qty = (SELECT COALESCE(SUM(pack_qty), 0) FROM trip_sheet_bills WHERE ts_code = ?),
           updated_by = ?
         WHERE ts_code = ?`,
        [code, code, req.user.user_code, code]
      );
    }
    await conn.commit();
    res.json({
      added, removed, sheets: sheetCodes.map((c) => sheets.get(c).tsc_no),
      tsc_no: sheetCodes.map((c) => sheets.get(c).tsc_no).join(', ').slice(0, 100) || null,
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A bill was just put on a trip sheet by someone else; reload and try again' });
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
