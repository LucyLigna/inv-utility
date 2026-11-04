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
      where.push(`EXISTS (SELECT 1 FROM trip_route_customers t WHERE t.trip_code = ? AND t.company_code = s.company_code
        AND t.ba_code = s.ba_code AND t.cu_code = s.cu_code)`);
    }
    params.push(sheet.trip_code);
    if (ownOnly) where.push("s.transporter_type = 'Own'");
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
