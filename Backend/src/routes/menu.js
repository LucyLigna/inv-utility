const express = require('express');
const pool = require('../config/db');

const router = express.Router();

// Main menus with their active programs nested underneath
router.get('/', async (req, res, next) => {
  try {
    const [menus] = await pool.query(
      "SELECT menu_code, name FROM sys_menufile WHERE status = 'Active' ORDER BY sort_order, menu_code"
    );
    const [programs] = await pool.query(
      "SELECT program_code, menu_code, name, route FROM sys_programfile WHERE status = 'Active' ORDER BY sort_order, program_code"
    );
    res.json(menus.map((m) => ({ ...m, programs: programs.filter((p) => p.menu_code === m.menu_code) })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
