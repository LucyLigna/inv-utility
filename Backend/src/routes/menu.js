const express = require('express');
const pool = require('../config/db');

const router = express.Router();

// Main menus with the active programs the logged-in user may open nested underneath;
// menus with none of the user's programs are left out
router.get('/', async (req, res, next) => {
  try {
    const [menus] = await pool.query(
      "SELECT menu_code, name FROM sys_menufile WHERE status = 'Active' ORDER BY sort_order, menu_code"
    );
    const [programs] = await pool.query(
      "SELECT program_code, menu_code, name, route FROM sys_programfile WHERE status = 'Active' ORDER BY sort_order, program_code"
    );
    const allowed = programs.filter((p) => req.user.programs.has(p.program_code));
    res.json(menus
      .map((m) => ({ ...m, programs: allowed.filter((p) => p.menu_code === m.menu_code) }))
      .filter((m) => m.programs.length));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
