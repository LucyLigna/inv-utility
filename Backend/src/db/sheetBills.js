// Bill queries shared by Trip Sheet - Bill Details and the driver delivery page
const pool = require('../config/db');

// Bill date shown: smd_date from the INV API; bills synced before smd_date existed fall back to the entry date.
// The date filter uses smd_date only.
const BILL_DATE = 'COALESCE(s.smd_date, DATE(s.inp_dt_tm))';

// Customer name: most bills from the INV API come without cuc_desc, so fall back to the customer table, then the code
const CUSTOMER_NAME = "COALESCE(NULLIF(s.cuc_desc, ''), c.cuc_desc, CONCAT('Customer ', s.cu_code))";

// Bill fields the screen shows, from salesdetails (s) with the customer's place and the branch name.
// route_order: where the customer sits on the sheet's route (NULL when it isn't on it).
// group_*: the main customer the bill belongs under: for a sub customer on the route, its main customer
// (the nearest 'Main' row above it in Trip Route Wise Customers); otherwise the customer itself.
const BILL_FIELDS = `s.company_code, s.ba_code, s.sm_slno, s.smc_no, s.cu_code, ${CUSTOMER_NAME} AS cuc_desc, s.net_amount, s.pack_qty, s.eway_billno,
  s.tpc_desc, s.transporter_type, DATE_FORMAT(${BILL_DATE}, '%Y-%m-%d') AS bill_date, c.cuc_place,
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

// The sheet's bills with their grouping, in the order saved on the sheet
async function sheetBills(sheet) {
  const [bills] = await pool.query(
    `SELECT ${BILL_FIELDS}, tb.sort_order AS sheet_order
     FROM trip_sheet_bills tb
     JOIN salesdetails s ON s.company_code = tb.company_code AND s.ba_code = tb.ba_code AND s.sm_slno = tb.sm_slno
     ${BILL_JOINS}
     WHERE tb.ts_code = ?
     ORDER BY tb.sort_order IS NULL, tb.sort_order`,
    [sheet.trip_code, sheet.trip_code, sheet.code]
  );
  return bills;
}

module.exports = {
  BILL_DATE, CUSTOMER_NAME, BILL_FIELDS, BILL_JOINS, findSheet, customerContacts, sheetBills,
};
