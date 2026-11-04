require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const express = require('express');
const cors = require('cors');
const { startScheduler } = require('./sync/scheduler');
const { requireAuth, requireRight, requireAdmin } = require('./auth/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Open without logging in
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));

// Everything else needs a logged-in user. Changes on a screen's API need the right to that screen
// (sys_programfile codes); administrators have every right.
app.use('/api', requireAuth);
app.use('/api/menu', require('./routes/menu'));
app.use('/api/vehicles', requireRight('P0101'), require('./routes/vehicle'));
app.use('/api/drivers', requireRight('P0102'), require('./routes/driver'));
app.use('/api/trip-routes', requireRight('P0103'), require('./routes/tripRoute'));
app.use('/api/trip-route-customers', requireRight('P0201'), require('./routes/tripRouteCustomers'));
app.use('/api/trip-sheets', requireRight('P0202'), require('./routes/tripSheet'));
app.use('/api/trip-sheet-bills', requireRight('P0203'), require('./routes/tripSheetBills'));
// "Get Latest Bills" on Trip Sheet - Bill Details runs syncs
app.use('/api/sync', requireRight('P0203'), require('./routes/sync'));
app.use('/api/users', requireAdmin, require('./routes/users'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

const port = process.env.PORT || 5050;
app.listen(port, () => {
  console.log(`InvUtility backend running on http://localhost:${port}`);
  startScheduler();
});
