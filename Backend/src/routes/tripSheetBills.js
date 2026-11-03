const express = require('express');
const pool = require('../config/db');

const router = express.Router();

// Customer name: most bills from the INV API come without cuc_desc, so fall back to the customer table, then the code
const CUSTOMER_NAME = "COALESCE(NULLIF(s.cuc_desc, ''), c.cuc_desc, CONCAT('Customer ', s.cu_code))";

// Bill fields the screen shows, from salesdetails (s) with the customer's place and the branch name
const BILL_FIELDS = `s.company_code, s.ba_code, s.sm_slno, s.smc_no, s.cu_code, ${CUSTOMER_NAME} AS cuc_desc, s.net_amount, s.pack_qty,
  s.tpc_desc, s.transporter_type, DATE_FORMAT(s.inp_dt_tm, '%Y-%m-%d %H:%i') AS bill_date, c.cuc_place,
  COALESCE(b.company_branch, CONCAT(s.company_code, ' - ', COALESCE(b.brc_desc, s.ba_code))) AS company_branch`;
const BILL_JOINS = `LEFT JOIN customer c ON c.company_code = s.company_code AND c.ba_code = s.ba_code AND c.cu_code = s.cu_code
  LEFT JOIN view_branch_list b ON b.company_code = s.company_code AND b.ba_code = s.ba_code`;
// Where the bill's customer sits on the sheet's route (NULL when the customer isn't on it), for ordering
const ROUTE_ORDER = `(SELECT t.sort_order FROM trip_route_customers t WHERE t.trip_code = ? AND t.company_code = s.company_code
  AND t.ba_code = s.ba_code AND t.cu_code = s.cu_code) AS route_order`;

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

// The sheet, its route's branches and the bills already saved on it
router.get('/:tsCode', async (req, res, next) => {
  try {
    const sheet = await findSheet(req.params.tsCode);
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    const [bills] = await pool.query(
      `SELECT ${BILL_FIELDS}, ${ROUTE_ORDER}
       FROM trip_sheet_bills tb
       JOIN salesdetails s ON s.company_code = tb.company_code AND s.ba_code = tb.ba_code AND s.sm_slno = tb.sm_slno
       ${BILL_JOINS}
       WHERE tb.ts_code = ?`,
      [sheet.trip_code, sheet.code]
    );
    res.json({ sheet, bills });
  } catch (err) {
    next(err);
  }
});

// Bills that can go on the sheet: not on another Active trip sheet.
//   ?customers=route (default: customers on the sheet's route) | all (every bill in the route's branches)
//   &transport=own (default: transporter_type Own) | all   &search=bill no or customer name
router.get('/:tsCode/available', async (req, res, next) => {
  const allCustomers = req.query.customers === 'all';
  const ownOnly = req.query.transport !== 'all';
  const search = String(req.query.search || '').trim();
  try {
    const sheet = await findSheet(req.params.tsCode);
    if (!sheet) return res.status(404).json({ message: 'Trip sheet not found' });
    const where = [
      `NOT EXISTS (SELECT 1 FROM trip_sheet_bills tb JOIN trip_sheet ts ON ts.ts_code = tb.ts_code
         WHERE ts.status = 'Active' AND tb.ts_code <> ? AND tb.company_code = s.company_code
           AND tb.ba_code = s.ba_code AND tb.sm_slno = s.sm_slno)`,
    ];
    const params = [sheet.trip_code, sheet.code];
    if (allCustomers) {
      where.push(`(s.company_code, s.ba_code) IN (SELECT company_code, ba_code FROM trip_route_branches
        WHERE trip_code = ? AND status = 'Active')`);
    } else {
      where.push(`EXISTS (SELECT 1 FROM trip_route_customers t WHERE t.trip_code = ? AND t.company_code = s.company_code
        AND t.ba_code = s.ba_code AND t.cu_code = s.cu_code)`);
    }
    params.push(sheet.trip_code);
    if (ownOnly) where.push("s.transporter_type = 'Own'");
    if (search) {
      where.push(`(s.smc_no LIKE ? OR ${CUSTOMER_NAME} LIKE ?)`);
      const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like);
    }
    const [rows] = await pool.query(
      `SELECT ${BILL_FIELDS}, ${ROUTE_ORDER} FROM salesdetails s ${BILL_JOINS}
       WHERE ${where.join(' AND ')}
       ORDER BY route_order IS NULL, route_order, cuc_desc, s.smc_no LIMIT 1000`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Replaces the sheet's bills and updates its totals. Body: { bills: [{ company_code, ba_code, sm_slno }] }
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
      return res.status(400).json({ message: 'This trip sheet is cancelled' });
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
         WHERE ts.status = 'Active' AND tb.ts_code <> ? AND (tb.company_code, tb.ba_code, tb.sm_slno) IN (?)
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
      await conn.query(
        'INSERT INTO trip_sheet_bills (ts_code, company_code, ba_code, sm_slno, pack_qty, amount) VALUES ?',
        [bills.map((b) => [sheet.ts_code, b.company_code, b.ba_code, b.sm_slno, b.pack_qty, b.net_amount])]
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
