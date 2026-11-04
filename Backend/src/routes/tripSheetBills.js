const express = require('express');
const pool = require('../config/db');

const router = express.Router();

// Customer name: most bills from the INV API come without cuc_desc, so fall back to the customer table, then the code
const CUSTOMER_NAME = "COALESCE(NULLIF(s.cuc_desc, ''), c.cuc_desc, CONCAT('Customer ', s.cu_code))";

// Bill fields the screen shows, from salesdetails (s) with the customer's place and the branch name.
// route_order: where the customer sits on the sheet's route (NULL when it isn't on it).
// group_*: the main customer the bill belongs under: for a sub customer on the route, its main customer
// (the nearest 'Main' row above it in Trip Route Wise Customers); otherwise the customer itself.
const BILL_FIELDS = `s.company_code, s.ba_code, s.sm_slno, s.smc_no, s.cu_code, ${CUSTOMER_NAME} AS cuc_desc, s.net_amount, s.pack_qty,
  s.tpc_desc, s.transporter_type, DATE_FORMAT(s.inp_dt_tm, '%Y-%m-%d %H:%i') AS bill_date, c.cuc_place,
  COALESCE(b.company_branch_code, b.company_branch, CONCAT(s.company_code, ' - ', COALESCE(b.brc_desc, s.ba_code))) AS company_branch,
  rc.route_order, rc.main_sub, rc.group_order,
  CONCAT_WS('|', COALESCE(gm.company_code, s.company_code), COALESCE(gm.ba_code, s.ba_code), COALESCE(gm.cu_code, s.cu_code)) AS group_key,
  COALESCE(gc.cuc_desc, ${CUSTOMER_NAME}) AS group_name,
  COALESCE(gb.company_branch_code, gb.company_branch, b.company_branch_code, b.company_branch,
    CONCAT(s.company_code, ' - ', s.ba_code)) AS group_branch,
  COALESCE(gc.cuc_place, c.cuc_place) AS group_place`;
// Two placeholders, both the sheet's trip_code
const BILL_JOINS = `LEFT JOIN customer c ON c.company_code = s.company_code AND c.ba_code = s.ba_code AND c.cu_code = s.cu_code
  LEFT JOIN view_branch_list b ON b.company_code = s.company_code AND b.ba_code = s.ba_code
  LEFT JOIN (
    SELECT t.company_code, t.ba_code, t.cu_code, t.main_sub, t.sort_order AS route_order,
      (SELECT MAX(m.sort_order) FROM trip_route_customers m
       WHERE m.trip_code = t.trip_code AND m.main_sub = 'Main' AND m.sort_order <= t.sort_order) AS group_order
    FROM trip_route_customers t WHERE t.trip_code = ?
  ) rc ON rc.company_code = s.company_code AND rc.ba_code = s.ba_code AND rc.cu_code = s.cu_code
  LEFT JOIN trip_route_customers gm ON gm.trip_code = ? AND gm.sort_order = rc.group_order
  LEFT JOIN customer gc ON gc.company_code = gm.company_code AND gc.ba_code = gm.ba_code AND gc.cu_code = gm.cu_code
  LEFT JOIN view_branch_list gb ON gb.company_code = gm.company_code AND gb.ba_code = gm.ba_code`;

async function findSheet(tsCode) {
  const [[sheet]] = await pool.query(
    `SELECT s.ts_code AS code, s.tsc_no, s.trip_code, r.name AS route_name, d.name AS driver_name,
       DATE_FORMAT(s.loading_date, '%Y-%m-%d') AS loading_date, DAYNAME(s.loading_date) AS loading_day,
       s.status, s.total_bills, s.total_pack_qty
     FROM trip_sheet s JOIN trip_route r ON r.code = s.trip_code JOIN driver d ON d.code = s.driver_code
     WHERE s.ts_code = ?`,
    [tsCode]
  );
  return sheet;
}

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

// Mobile number and sales executive of the given customers ('company|branch|customer' keys), for printing:
// { 'BAD|E003|P122': { mobile, sales_executive } }
async function customerContacts(keys) {
  const unique = [...new Set(keys)].map((k) => k.split('|'));
  if (!unique.length) return {};
  const [rows] = await pool.query(
    `SELECT c.company_code, c.ba_code, c.cu_code, c.cuc_mobile AS mobile, v.salesexecutive_name AS sales_executive
     FROM customer c
     LEFT JOIN view_customer_list v ON v.company_code = c.company_code AND v.ba_code = c.ba_code AND v.cu_code = c.cu_code
     WHERE (c.company_code, c.ba_code, c.cu_code) IN (?)`,
    [unique]
  );
  return Object.fromEntries(rows.map((r) => [
    `${r.company_code}|${r.ba_code}|${r.cu_code}`, { mobile: r.mobile, sales_executive: r.sales_executive },
  ]));
}

// The sheet, its bills and the contact details of their customers
router.get('/:tsCode', async (req, res, next) => {
  try {
    const sheet = await findSheet(req.params.tsCode);
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    const [bills] = await pool.query(
      `SELECT ${BILL_FIELDS}, tb.sort_order AS sheet_order
       FROM trip_sheet_bills tb
       JOIN salesdetails s ON s.company_code = tb.company_code AND s.ba_code = tb.ba_code AND s.sm_slno = tb.sm_slno
       ${BILL_JOINS}
       WHERE tb.ts_code = ?
       ORDER BY tb.sort_order IS NULL, tb.sort_order`,
      [sheet.trip_code, sheet.trip_code, sheet.code]
    );
    res.json({ sheet, bills, customers: await customerContacts(bills.map((b) => b.group_key)) });
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
      where.push('s.inp_dt_tm >= ?');
      params.push(from);
    }
    if (to) {
      where.push('s.inp_dt_tm < ? + INTERVAL 1 DAY');
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
    const [[sheet]] = await conn.query('SELECT ts_code, status FROM trip_sheet WHERE ts_code = ? FOR UPDATE', [req.params.tsCode]);
    if (!sheet) {
      await conn.rollback();
      return res.status(404).json({ message: 'Trip sheet not found' });
    }
    if (sheet.status !== 'Active') {
      await conn.rollback();
      return res.status(400).json({ message: `This trip sheet is ${sheet.status.toLowerCase()}; its bills can no longer be changed` });
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
    await conn.query('DELETE FROM trip_sheet_bills WHERE ts_code = ?', [sheet.ts_code]);
    if (bills.length) {
      const position = new Map(keys.map((k, i) => [k.join('|'), i + 1]));
      await conn.query(
        'INSERT INTO trip_sheet_bills (ts_code, company_code, ba_code, sm_slno, pack_qty, amount, sort_order) VALUES ?',
        [bills.map((b) => [sheet.ts_code, b.company_code, b.ba_code, b.sm_slno, b.pack_qty, b.net_amount,
          position.get(`${b.company_code}|${b.ba_code}|${b.sm_slno}`)])]
      );
    }
    const totalPack = bills.reduce((sum, b) => sum + (Number(b.pack_qty) || 0), 0);
    await conn.query('UPDATE trip_sheet SET total_bills = ?, total_pack_qty = ? WHERE ts_code = ?', [
      bills.length, totalPack, sheet.ts_code,
    ]);
    await conn.commit();
    res.json({ total_bills: bills.length, total_pack_qty: totalPack });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
