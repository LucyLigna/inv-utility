const express = require('express');
const pool = require('../config/db');

const router = express.Router();
const SEARCH_LIMIT = 200;

// Fields the screen shows for a customer, from view_customer_list (alias v)
const CUSTOMER_FIELDS = `v.company_code, v.ba_code, v.cu_code, v.cuc_desc, v.cuc_place, v.route_name,
  v.company_name, v.branch_name, COALESCE(v.company_branch, CONCAT(v.company_code, ' - ', v.branch_name)) AS company_branch,  v.gst_number, v.cuc_mobile`;

// Limits view_customer_list (alias v) to the active branches of trip route ?
const IN_ROUTE_BRANCHES = `(v.company_code, v.ba_code) IN (
  SELECT company_code, ba_code FROM trip_route_branches WHERE trip_code = ? AND status = 'Active')`;

const like = (s) => `%${String(s || '').trim().replace(/[\\%_]/g, '\\$&')}%`;

async function findRoute(code) {
  const [rows] = await pool.query('SELECT code, name, short_code FROM trip_route WHERE code = ?', [code]);
  return rows[0];
}

// One customer's details for the pop-up: ?company_code=&ba_code=&cu_code=
router.get('/customer-details', async (req, res, next) => {
  const { company_code: companyCode, ba_code: baCode, cu_code: cuCode } = req.query;
  try {
    const [[row]] = await pool.query(
      `SELECT ${CUSTOMER_FIELDS}, v.cuc_add1, v.cuc_add2, v.cuc_add3, v.cuc_add4, v.cuc_pincode,
         v.salesexecutive_name, v.terriotry_name AS territory_name
       FROM view_customer_list v WHERE v.company_code = ? AND v.ba_code = ? AND v.cu_code = ?`,
      [companyCode, baCode, cuCode]
    );
    if (!row) return res.status(404).json({ message: 'Customer not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// The route, its branches and its saved customers in order
router.get('/:tripCode',async (req, res, next) => {
  try {
    const route = await findRoute(req.params.tripCode);
    if (!route) return res.status(404).json({ message: 'Route not found' });
    const [branches] = await pool.query(
      `SELECT b.company_code, b.ba_code, COALESCE(v.company_branch, CONCAT(b.company_code, ' - ', COALESCE(v.brc_desc, b.ba_code))) AS company_branch
       FROM trip_route_branches b
       LEFT JOIN view_branch_list v ON v.company_code = b.company_code AND v.ba_code = b.ba_code
       WHERE b.trip_code = ? AND b.status = 'Active' ORDER BY company_branch`,
      [route.code]
    );
    const [customers] = await pool.query(
      `SELECT t.main_sub, t.remarks, ${CUSTOMER_FIELDS}
       FROM trip_route_customers t
       JOIN view_customer_list v ON v.company_code = t.company_code AND v.ba_code = t.ba_code AND v.cu_code = t.cu_code
       WHERE t.trip_code = ? ORDER BY t.sort_order`,
      [route.code]
    );
    res.json({ route, branches, customers });
  } catch (err) {
    next(err);
  }
});

// Customer search within the route's branches: ?name=&place=
router.get('/:tripCode/search', async (req, res, next) => {
  const { name, place } = req.query;
  if (!String(name || '').trim() && !String(place || '').trim()) return res.json([]);
  try {
    const where = [IN_ROUTE_BRANCHES];
    const params = [req.params.tripCode];
    if (String(name || '').trim()) {
      where.push('(v.cuc_desc LIKE ? OR v.cuc_alias LIKE ?)');
      params.push(like(name), like(name));
    }
    // Place is often blank, so the address lines are searched too
    if (String(place || '').trim()) {
      where.push('(v.cuc_place LIKE ? OR v.cuc_add1 LIKE ? OR v.cuc_add2 LIKE ? OR v.cuc_add3 LIKE ? OR v.cuc_add4 LIKE ?)');
      params.push(...Array(5).fill(like(place)));
    }
    const [rows] = await pool.query(
      `SELECT ${CUSTOMER_FIELDS} FROM view_customer_list v WHERE ${where.join(' AND ')}
       ORDER BY v.cuc_desc LIMIT ${SEARCH_LIMIT}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Other customers in the route's branches with the same GST number as the picked one,
// or the same mobile number when it has no GST number: ?company_code=&ba_code=&cu_code=
router.get('/:tripCode/related', async (req, res, next) => {
  const { company_code: companyCode, ba_code: baCode, cu_code: cuCode } = req.query;
  try {
    const [[picked]] = await pool.query(
      'SELECT gst_number, cuc_mobile FROM customer WHERE company_code = ? AND ba_code = ? AND cu_code = ?',
      [companyCode, baCode, cuCode]
    );
    if (!picked) return res.status(404).json({ message: 'Customer not found' });
    const gst = String(picked.gst_number || '').trim();
    const mobile = String(picked.cuc_mobile || '').trim();
    const match = gst ? 'gst' : mobile ? 'mobile' : null;
    if (!match) return res.json({ match: null, value: null, customers: [] });
    const [rows] = await pool.query(
      `SELECT ${CUSTOMER_FIELDS} FROM view_customer_list v
       WHERE ${IN_ROUTE_BRANCHES} AND ${match === 'gst' ? 'v.gst_number' : 'v.cuc_mobile'} = ?
         AND NOT (v.company_code = ? AND v.ba_code = ? AND v.cu_code = ?)
       ORDER BY v.company_branch, v.cuc_desc`,
      [req.params.tripCode, match === 'gst' ? gst : mobile, companyCode, baCode, cuCode]
    );
    res.json({ match, value: match === 'gst' ? gst : mobile, customers: rows });
  } catch (err) {
    next(err);
  }
});

// Replaces the route's customer list, in order.
// Body: { customers: [{ company_code, ba_code, cu_code, main_sub, remarks }] }; remarks are kept for main customers only
router.put('/:tripCode', async (req, res, next) => {
  const list = Array.isArray(req.body.customers) ? req.body.customers : [];
  const customers = list.map((c) => {
    const mainSub = c.main_sub === 'Sub' ? 'Sub' : 'Main';
    return {
      company_code: String(c.company_code || '').trim(),
      ba_code: String(c.ba_code || '').trim(),
      cu_code: String(c.cu_code || '').trim(),
      main_sub: mainSub,
      remarks: (mainSub === 'Main' && String(c.remarks || '').trim().slice(0, 255)) || null,
    };
  });
  if (customers.some((c) => !c.company_code || !c.ba_code || !c.cu_code)) {
    return res.status(400).json({ message: 'Each customer needs company, branch and customer code' });
  }
  if (customers.length && customers[0].main_sub === 'Sub') {
    return res.status(400).json({ message: 'The first customer must be a main customer' });
  }
  const keys = customers.map((c) => `${c.company_code}|${c.ba_code}|${c.cu_code}`);
  if (new Set(keys).size !== keys.length) return res.status(400).json({ message: 'A customer is listed twice' });

  const conn = await pool.getConnection();
  try {
    const route = await findRoute(req.params.tripCode);
    if (!route) return res.status(404).json({ message: 'Route not found' });
    await conn.beginTransaction();
    await conn.query('DELETE FROM trip_route_customers WHERE trip_code = ?', [route.code]);
    if (customers.length) {
      await conn.query(
        'INSERT INTO trip_route_customers (trip_code, company_code, ba_code, cu_code, main_sub, sort_order, remarks) VALUES ?',
        [customers.map((c, i) => [route.code, c.company_code, c.ba_code, c.cu_code, c.main_sub, i + 1, c.remarks])]
      );
    }
    await conn.commit();
    res.json({ saved: customers.length });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
