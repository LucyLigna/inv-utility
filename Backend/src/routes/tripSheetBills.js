const express = require('express');
const pool = require('../config/db');
const {
  CUSTOMER_NAME, BILL_FIELDS, BILL_JOINS, findSheet, customerContacts, sheetBills,
} = require('../db/sheetBills');
const { codesFor, deliveries } = require('../db/delivery');

const router = express.Router();

// Active trip sheets for the picker, newest first
router.get('/sheets', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.ts_code AS code, s.tsc_no, r.name AS route_name, DATE_FORMAT(s.loading_date, '%Y-%m-%d') AS loading_date,
         DAYNAME(s.loading_date) AS loading_day, s.total_bills, s.total_pack_qty
       FROM trip_sheet s JOIN trip_route r ON r.code = s.trip_code
       WHERE s.status = 'Active' ORDER BY s.ts_code DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// The sheet, its bills, the contact details of their customers, each customer's delivery QR code (for the
// customer-wise print) and the deliveries the driver has marked
router.get('/:tsCode', async (req, res, next) => {
  try {
    const sheet = await findSheet(req.params.tsCode);
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    const bills = await sheetBills(sheet);
    const keys = bills.map((b) => b.group_key);
    res.json({
      sheet, bills, customers: await customerContacts(keys), codes: await codesFor(sheet, keys), deliveries: await deliveries(sheet.code),
    });
  } catch (err) {
    next(err);
  }
});

// Fresh details (route position and grouping) of the given bills: ?keys=company|branch|sm_slno,company|branch|sm_slno
// Used after a customer is mapped to the route, so the screen can regroup its ticked bills without reloading them.
router.get('/:tsCode/describe', async (req, res, next) => {
  const keys = String(req.query.keys || '').split(',').map((k) => k.split('|')).filter((k) => k.length === 3 && k.every(Boolean));
  try {
    const sheet = await findSheet(req.params.tsCode);
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    if (!keys.length) return res.json([]);
    const [rows] = await pool.query(
      `SELECT ${BILL_FIELDS} FROM salesdetails s ${BILL_JOINS} WHERE (s.company_code, s.ba_code, s.sm_slno) IN (?)`,
      [sheet.trip_code, sheet.trip_code, keys]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Bills that can go on the sheet: not on another trip sheet (Active or Closed; a Cancelled sheet frees its bills).
//   ?customers=route (default: customers on the sheet's route) | all (every bill in the route's branches)
//   &transport=own (default: transporter_type Own) | all   &search=bill no or customer name
//   &from=YYYY-MM-DD&to=YYYY-MM-DD   bill date range (either may be left out)
router.get('/:tsCode/available', async (req, res, next) => {
  const allCustomers = req.query.customers === 'all';
  const ownOnly = req.query.transport !== 'all';
  const search = String(req.query.search || '').trim();
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  const from = isDate(req.query.from) ? req.query.from : null;
  const to = isDate(req.query.to) ? req.query.to : null;
  try {
    const sheet = await findSheet(req.params.tsCode);
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    const where = [
      `NOT EXISTS (SELECT 1 FROM trip_sheet_bills tb JOIN trip_sheet ts ON ts.ts_code = tb.ts_code
         WHERE ts.status <> 'Cancelled' AND tb.ts_code <> ? AND tb.company_code = s.company_code
           AND tb.ba_code = s.ba_code AND tb.sm_slno = s.sm_slno)`,
    ];
    const params = [sheet.trip_code, sheet.trip_code, sheet.code];
    if (allCustomers) {
      where.push(`(s.company_code, s.ba_code) IN (SELECT company_code, ba_code FROM trip_route_branches
        WHERE trip_code = ? AND status = 'Active')`);
    } else {
      where.push(`EXISTS (SELECT 1 FROM trip_route_customers t WHERE t.trip_code = ? AND t.company_code = COALESCE(s.cu_company_code, s.company_code)
        AND t.ba_code = COALESCE(s.cu_ba_code, s.ba_code) AND t.cu_code = s.cu_code)`);
    }
    params.push(sheet.trip_code);
    // Manual bills count as own transport
    if (ownOnly) where.push("(s.transporter_type = 'Own' OR s.is_manual = 1)");
    if (from) {
      where.push('s.smd_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('s.smd_date <= ?');
      params.push(to);
    }
    if (search) {
      where.push(`(s.smc_no LIKE ? OR ${CUSTOMER_NAME} LIKE ?)`);
      const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like);
    }
    const [rows] = await pool.query(
      `SELECT ${BILL_FIELDS} FROM salesdetails s ${BILL_JOINS}
       WHERE ${where.join(' AND ')}
       ORDER BY rc.route_order IS NULL, rc.route_order, cuc_desc, s.smc_no LIMIT 1000`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Replaces the sheet's bills and updates its totals. Body: { bills: [{ company_code, ba_code, sm_slno }] },
// in delivery order; each bill's position is kept as its sort_order
router.put('/:tsCode', async (req, res, next) => {
  const keys = (Array.isArray(req.body.bills) ? req.body.bills : [])
    .map((b) => [String(b.company_code || '').trim(), String(b.ba_code || '').trim(), String(b.sm_slno || '').trim()])
    .filter((k) => k.every(Boolean));
  if (new Set(keys.map((k) => k.join('|'))).size !== keys.length) {
    return res.status(400).json({ message: 'A bill is listed twice' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[sheet]] = await conn.query('SELECT ts_code, tsc_no, status, bills_completed_at FROM trip_sheet WHERE ts_code = ? FOR UPDATE', [req.params.tsCode]);
    if (!sheet) {
      await conn.rollback();
      return res.status(404).json({ message: 'Trip sheet not found' });
    }
    if (sheet.status !== 'Active') {
      await conn.rollback();
      return res.status(400).json({ message: `This trip sheet is ${sheet.status.toLowerCase()}; its bills can no longer be changed` });
    }
    if (sheet.bills_completed_at) {
      await conn.rollback();
      return res.status(400).json({ message: `The bills of ${sheet.tsc_no} are marked complete; no bill can be added or removed` });
    }
    let bills = [];
    if (keys.length) {
      [bills] = await conn.query(
        'SELECT company_code, ba_code, sm_slno, smc_no, pack_qty, net_amount FROM salesdetails WHERE (company_code, ba_code, sm_slno) IN (?)',
        [keys]
      );
      if (bills.length !== keys.length) {
        await conn.rollback();
        return res.status(400).json({ message: 'One or more bills no longer exist' });
      }
      const [taken] = await conn.query(
        `SELECT s.smc_no, ts.tsc_no FROM trip_sheet_bills tb
         JOIN trip_sheet ts ON ts.ts_code = tb.ts_code
         JOIN salesdetails s ON s.company_code = tb.company_code AND s.ba_code = tb.ba_code AND s.sm_slno = tb.sm_slno
         WHERE ts.status <> 'Cancelled' AND tb.ts_code <> ? AND (tb.company_code, tb.ba_code, tb.sm_slno) IN (?)
         FOR UPDATE`,
        [sheet.ts_code, keys]
      );
      if (taken.length) {
        await conn.rollback();
        const list = taken.slice(0, 5).map((t) => `${t.smc_no} (${t.tsc_no})`).join(', ');
        return res.status(409).json({ message: `Already on another trip sheet: ${list}` });
      }
    }
    // Bills already on the sheet keep who added them (and when); the saver becomes updated_by for all
    const [before] = await conn.query(
      'SELECT company_code, ba_code, sm_slno, created_by, created_at FROM trip_sheet_bills WHERE ts_code = ?',
      [sheet.ts_code]
    );
    const added = new Map(before.map((b) => [`${b.company_code}|${b.ba_code}|${b.sm_slno}`, b]));
    await conn.query('DELETE FROM trip_sheet_bills WHERE ts_code = ?', [sheet.ts_code]);
    const me = req.user.user_code;
    if (bills.length) {
      const position = new Map(keys.map((k, i) => [k.join('|'), i + 1]));
      await conn.query(
        `INSERT INTO trip_sheet_bills
           (ts_code, company_code, ba_code, sm_slno, pack_qty, amount, sort_order, created_by, created_at, updated_by) VALUES ?`,
        [bills.map((b) => {
          const k = `${b.company_code}|${b.ba_code}|${b.sm_slno}`;
          const old = added.get(k);
          return [sheet.ts_code, b.company_code, b.ba_code, b.sm_slno, b.pack_qty, b.net_amount, position.get(k),
            old ? old.created_by : me, old ? old.created_at : new Date(), me];
        })]
      );
    }
    const totalPack = bills.reduce((sum, b) => sum + (Number(b.pack_qty) || 0), 0);
    await conn.query('UPDATE trip_sheet SET total_bills = ?, total_pack_qty = ?, updated_by = ? WHERE ts_code = ?', [
      bills.length, totalPack, me, sheet.ts_code,
    ]);
    await conn.commit();
    res.json({ tsc_no: sheet.tsc_no, total_bills: bills.length, total_pack_qty: totalPack });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// --- Manual bills ---------------------------------------------------------------------------
// A bill that is not in INV (yet), entered by hand for a main customer of the sheet's route. It is stored in
// salesdetails (is_manual = 1, sm_slno 'M000000001'...) so it works like any other bill: on the sheet, in the
// prints, the QR and the driver page. The screen adds it to the sheet; Save keeps it there.
// { customer: { company_code, ba_code, cu_code }, company_code, ba_code, smc_no, bill_date, net_amount?, pack_qty }
const MANUAL_PREFIX = 'M';

// Choices for a manual bill: the route's main customers (in route order) and its active branches.
// Read from the customer table itself, so every main customer is listed even if view_customer_list misses it.
router.get('/:tsCode/manual-options', async (req, res, next) => {
  try {
    const sheet = await findSheet(req.params.tsCode);
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    const [customers] = await pool.query(
      `SELECT t.company_code, t.ba_code, t.cu_code, COALESCE(c.cuc_desc, CONCAT('Customer ', t.cu_code)) AS cuc_desc, c.cuc_place,
         COALESCE(b.company_branch_code, b.company_branch, CONCAT(t.company_code, ' - ', t.ba_code)) AS company_branch
       FROM trip_route_customers t
       LEFT JOIN customer c ON c.company_code = t.company_code AND c.ba_code = t.ba_code AND c.cu_code = t.cu_code
       LEFT JOIN view_branch_list b ON b.company_code = t.company_code AND b.ba_code = t.ba_code
       WHERE t.trip_code = ? AND t.main_sub = 'Main' ORDER BY t.sort_order`,
      [sheet.trip_code]
    );
    const [branches] = await pool.query(
      `SELECT r.company_code, r.ba_code, COALESCE(b.company_branch_code, b.company_branch, CONCAT(r.company_code, ' - ', r.ba_code)) AS company_branch
       FROM trip_route_branches r LEFT JOIN view_branch_list b ON b.company_code = r.company_code AND b.ba_code = r.ba_code
       WHERE r.trip_code = ? AND r.status = 'Active' ORDER BY company_branch`,
      [sheet.trip_code]
    );
    res.json({ customers, branches });
  } catch (err) {
    next(err);
  }
});

// The manual bill fields from the request, checked: { error } or { cust, company_code, ba_code, smcNo, billDate, amount, packs }
function readManualBill(body) {
  const b = body || {};
  const cust = b.customer || {};
  const smcNo = String(b.smc_no || '').trim().toUpperCase();
  const billDate = String(b.bill_date || '').slice(0, 10);
  const amountGiven = b.net_amount !== undefined && b.net_amount !== null && String(b.net_amount).trim() !== '';
  const amount = amountGiven ? Number(b.net_amount) : null;
  const packs = Number(b.pack_qty);
  if (!cust.company_code || !cust.ba_code || !cust.cu_code) return { error: 'Select the customer' };
  if (!b.company_code || !b.ba_code) return { error: 'Select the company - branch' };
  if (!smcNo) return { error: 'Bill # is required' };
  if (smcNo.length > 20) return { error: 'Bill # can be at most 20 characters' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) return { error: 'Date is required' };
  if (amountGiven && (!Number.isFinite(amount) || amount < 0 || amount > 9999999999)) return { error: 'Amount must be a number of 0 or more' };
  if (!Number.isInteger(packs) || packs < 1 || packs > 99999) return { error: 'Number of cases must be a whole number of 1 or more' };
  return { cust, company_code: b.company_code, ba_code: b.ba_code, smcNo, billDate, amount, packs };
}

// Checks shared by adding and editing a manual bill, inside the transaction: the sheet can take bills, the customer
// is a main customer of its route, the branch is one of the route's, and the bill # is new for that branch.
// except: the bill being edited, so it doesn't clash with itself. Returns { sheet } or { status, message }.
async function checkManualBill(conn, tsCode, m, except = null) {
  const [[sheet]] = await conn.query('SELECT ts_code, tsc_no, trip_code, status, bills_completed_at FROM trip_sheet WHERE ts_code = ? FOR UPDATE', [tsCode]);
  if (!sheet) return { status: 404, message: 'Trip sheet not found' };
  if (sheet.status !== 'Active') return { status: 400, message: `This trip sheet is ${sheet.status.toLowerCase()}` };
  if (sheet.bills_completed_at) return { status: 400, message: `The bills of ${sheet.tsc_no} are marked complete; its bills can't be changed` };
  const [[main]] = await conn.query(
    "SELECT 1 AS ok FROM trip_route_customers WHERE trip_code = ? AND company_code = ? AND ba_code = ? AND cu_code = ? AND main_sub = 'Main'",
    [sheet.trip_code, m.cust.company_code, m.cust.ba_code, m.cust.cu_code]
  );
  if (!main) return { status: 400, message: 'The customer must be a main customer of this route in Trip Route Wise Customers' };
  const [[branch]] = await conn.query(
    "SELECT 1 AS ok FROM trip_route_branches WHERE trip_code = ? AND company_code = ? AND ba_code = ? AND status = 'Active'",
    [sheet.trip_code, m.company_code, m.ba_code]
  );
  if (!branch) return { status: 400, message: "The company - branch must be one of the route's branches" };
  const [[dup]] = await conn.query(
    'SELECT is_manual FROM salesdetails WHERE company_code = ? AND ba_code = ? AND smc_no = ? AND sm_slno <> ? LIMIT 1',
    [m.company_code, m.ba_code, m.smcNo, except ? except.slno : '']
  );
  if (dup) return { status: 409, message: `Bill # ${m.smcNo} already exists for this company - branch${dup.is_manual ? ' (a manual bill)' : ''}` };
  return { sheet };
}

const billByKey = async (sheet, companyCode, baCode, slno) => {
  const [[bill]] = await pool.query(
    `SELECT ${BILL_FIELDS} FROM salesdetails s ${BILL_JOINS} WHERE s.company_code = ? AND s.ba_code = ? AND s.sm_slno = ?`,
    [sheet.trip_code, sheet.trip_code, companyCode, baCode, slno]
  );
  return bill;
};

router.post('/:tsCode/manual-bills', async (req, res, next) => {
  const m = readManualBill(req.body);
  if (m.error) return res.status(400).json({ message: m.error });
  const { cust, smcNo, billDate, amount, packs } = m;
  const b = { company_code: m.company_code, ba_code: m.ba_code };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const fail = async (status, message) => { await conn.rollback(); return res.status(status).json({ message }); };
    const check = await checkManualBill(conn, req.params.tsCode, m);
    if (!check.sheet) return fail(check.status, check.message);
    const { sheet } = check;
    // Next manual number; the lock keeps two saves at once from taking the same one
    const [[last]] = await conn.query(
      `SELECT MAX(CAST(SUBSTRING(sm_slno, 2) AS UNSIGNED)) n FROM salesdetails WHERE is_manual = 1 AND sm_slno LIKE '${MANUAL_PREFIX}%' FOR UPDATE`
    );
    const slno = MANUAL_PREFIX + String((last.n || 0) + 1).padStart(9, '0');
    const sameBranch = cust.company_code === b.company_code && cust.ba_code === b.ba_code;
    await conn.query(
      `INSERT INTO salesdetails (company_code, ba_code, sm_slno, cu_code, smc_no, smd_date, tpc_desc, transporter_type, net_amount, pack_qty,
         inp_dt_tm, is_manual, cu_company_code, cu_ba_code, manual_by)
       VALUES (?, ?, ?, ?, ?, ?, 'MANUAL BILL', 'Manual', ?, ?, NOW(), 1, ?, ?, ?)`,
      [b.company_code, b.ba_code, slno, cust.cu_code, smcNo, billDate, amount, packs,
        sameBranch ? null : cust.company_code, sameBranch ? null : cust.ba_code, req.user.user_code]
    );
    await conn.commit();
    res.status(201).json({ tsc_no: sheet.tsc_no, smc_no: smcNo, bill: await billByKey(sheet, b.company_code, b.ba_code, slno) });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Edit a manual bill (same fields as adding), from the sheet it is on, or, when it is on no trip sheet, from any
// sheet of a route it fits. A change of company - branch moves the bill (its key) on the trip sheets too.
router.put('/:tsCode/manual-bills/:companyCode/:baCode/:slno', async (req, res, next) => {
  const m = readManualBill(req.body);
  if (m.error) return res.status(400).json({ message: m.error });
  const old = { company_code: req.params.companyCode, ba_code: req.params.baCode, slno: req.params.slno };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const fail = async (status, message) => { await conn.rollback(); return res.status(status).json({ message }); };
    const [[bill]] = await conn.query(
      'SELECT smc_no, is_manual FROM salesdetails WHERE company_code = ? AND ba_code = ? AND sm_slno = ? FOR UPDATE',
      [old.company_code, old.ba_code, old.slno]
    );
    if (!bill) return fail(404, 'Bill not found');
    if (!bill.is_manual) return fail(400, 'Only a manual bill can be edited');
    const [onSheets] = await conn.query(
      `SELECT ts.ts_code, ts.tsc_no FROM trip_sheet_bills tb JOIN trip_sheet ts ON ts.ts_code = tb.ts_code AND ts.status <> 'Cancelled'
       WHERE tb.company_code = ? AND tb.ba_code = ? AND tb.sm_slno = ?`,
      [old.company_code, old.ba_code, old.slno]
    );
    const elsewhere = onSheets.find((s) => String(s.ts_code) !== String(req.params.tsCode));
    if (elsewhere) return fail(400, `Manual bill ${bill.smc_no} is on trip sheet ${elsewhere.tsc_no}; edit it there`);
    const check = await checkManualBill(conn, req.params.tsCode, m, old);
    if (!check.sheet) return fail(check.status, check.message);
    const { sheet } = check;
    const sameBranch = m.cust.company_code === m.company_code && m.cust.ba_code === m.ba_code;
    await conn.query(
      `UPDATE salesdetails SET company_code = ?, ba_code = ?, cu_code = ?, smc_no = ?, smd_date = ?, net_amount = ?, pack_qty = ?,
         cu_company_code = ?, cu_ba_code = ?
       WHERE company_code = ? AND ba_code = ? AND sm_slno = ? AND is_manual = 1`,
      [m.company_code, m.ba_code, m.cust.cu_code, m.smcNo, m.billDate, m.amount, m.packs,
        sameBranch ? null : m.cust.company_code, sameBranch ? null : m.cust.ba_code, old.company_code, old.ba_code, old.slno]
    );
    // The copies on trip sheets (including cancelled ones, so the key stays consistent) and this sheet's totals
    await conn.query(
      'UPDATE trip_sheet_bills SET company_code = ?, ba_code = ?, pack_qty = ?, amount = ?, updated_by = ? WHERE company_code = ? AND ba_code = ? AND sm_slno = ?',
      [m.company_code, m.ba_code, m.packs, m.amount, req.user.user_code, old.company_code, old.ba_code, old.slno]
    );
    const onSheet = onSheets.length > 0;
    if (onSheet) {
      await conn.query(
        `UPDATE trip_sheet SET total_pack_qty = (SELECT COALESCE(SUM(pack_qty), 0) FROM trip_sheet_bills WHERE ts_code = ?), updated_by = ?
         WHERE ts_code = ?`,
        [sheet.ts_code, req.user.user_code, sheet.ts_code]
      );
    }
    await conn.commit();
    res.json({
      tsc_no: sheet.tsc_no, smc_no: m.smcNo, onSheet, oldKey: `${old.company_code}|${old.ba_code}|${old.slno}`,
      bill: await billByKey(sheet, m.company_code, m.ba_code, old.slno), sheet: await findSheet(sheet.ts_code),
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Delete a manual bill that is not on any trip sheet (a Cancelled sheet doesn't count)
router.delete('/manual-bills/:companyCode/:baCode/:slno', async (req, res, next) => {
  const { companyCode, baCode, slno } = req.params;
  try {
    const [[bill]] = await pool.query(
      'SELECT smc_no, is_manual FROM salesdetails WHERE company_code = ? AND ba_code = ? AND sm_slno = ?', [companyCode, baCode, slno]
    );
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (!bill.is_manual) return res.status(400).json({ message: 'Only a manual bill can be deleted' });
    const [[used]] = await pool.query(
      `SELECT ts.tsc_no FROM trip_sheet_bills tb JOIN trip_sheet ts ON ts.ts_code = tb.ts_code AND ts.status <> 'Cancelled'
       WHERE tb.company_code = ? AND tb.ba_code = ? AND tb.sm_slno = ? LIMIT 1`,
      [companyCode, baCode, slno]
    );
    if (used) return res.status(400).json({ message: `Manual bill ${bill.smc_no} is on trip sheet ${used.tsc_no}; remove it there first` });
    await pool.query('DELETE FROM trip_sheet_bills WHERE company_code = ? AND ba_code = ? AND sm_slno = ?', [companyCode, baCode, slno]);
    await pool.query('DELETE FROM salesdetails WHERE company_code = ? AND ba_code = ? AND sm_slno = ? AND is_manual = 1', [companyCode, baCode, slno]);
    res.json({ smc_no: bill.smc_no, deleted: true });
  } catch (err) {
    next(err);
  }
});

// Mark the sheet's bills complete: from then on no bill can be added or removed (Save refuses)
router.post('/:tsCode/complete', async (req, res, next) => {
  try {
    const [[sheet]] = await pool.query('SELECT tsc_no, status, bills_completed_at, total_bills FROM trip_sheet WHERE ts_code = ?', [req.params.tsCode]);
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    if (sheet.status !== 'Active') return res.status(400).json({ message: `This trip sheet is ${sheet.status.toLowerCase()}` });
    if (sheet.bills_completed_at) return res.status(400).json({ message: `The bills of ${sheet.tsc_no} are already marked complete` });
    if (!sheet.total_bills) return res.status(400).json({ message: 'Add and save bills before marking the trip sheet complete' });
    await pool.query(
      'UPDATE trip_sheet SET bills_completed_at = NOW(), bills_completed_by = ?, updated_by = ? WHERE ts_code = ? AND bills_completed_at IS NULL',
      [req.user.user_code, req.user.user_code, req.params.tsCode]
    );
    res.json({ code: Number(req.params.tsCode), tsc_no: sheet.tsc_no, sheet: await findSheet(req.params.tsCode) });
  } catch (err) {
    next(err);
  }
});

// Undo "complete" so bills can be changed again; administrators only
router.post('/:tsCode/reopen-bills', async (req, res, next) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: 'Only an administrator can reopen the bills of a completed trip sheet' });
  try {
    const [[sheet]] = await pool.query('SELECT tsc_no, status FROM trip_sheet WHERE ts_code = ?', [req.params.tsCode]);
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    if (sheet.status !== 'Active') return res.status(400).json({ message: `This trip sheet is ${sheet.status.toLowerCase()}` });
    await pool.query(
      'UPDATE trip_sheet SET bills_completed_at = NULL, bills_completed_by = NULL, updated_by = ? WHERE ts_code = ?',
      [req.user.user_code, req.params.tsCode]
    );
    res.json({ code: Number(req.params.tsCode), tsc_no: sheet.tsc_no, sheet: await findSheet(req.params.tsCode) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
