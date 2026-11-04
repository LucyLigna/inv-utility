require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const express = require('express');
const cors = require('cors');
const { startScheduler } = require('./sync/scheduler');
const { requireAuth, requireRight, requireAdmin } = require('./auth/auth');
const { logActivity } = require('./auth/activity');

// A screen's API: changes need the right to the screen (program code), and are written to the user log
const screen = (programCode, name) => [requireRight(programCode), logActivity(programCode, name)];

const app = express();
app.use(cors());
app.use(express.json());

// Open without logging in
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
// Driver delivery page: its own login (mobile number + the trip sheet's driver code)
app.use('/api/driver', require('./routes/driverApp'));

// Everything else needs a logged-in user. Changes on a screen's API need the right to that screen
// (sys_programfile codes); administrators have every right.
app.use('/api', requireAuth);
app.use('/api/menu', require('./routes/menu'));
app.use('/api/vehicles', screen('P0101', 'Vehicle'), require('./routes/vehicle'));
app.use('/api/drivers', screen('P0102', 'Driver'), require('./routes/driver'));
app.use('/api/trip-routes', screen('P0103', 'Trip Route'), require('./routes/tripRoute'));
app.use('/api/trip-route-customers', screen('P0201', 'Trip Route Wise Customers'), require('./routes/tripRouteCustomers'));
app.use('/api/trip-sheets', screen('P0202', 'Trip Sheet'), require('./routes/tripSheet'));
app.use('/api/trip-sheet-bills', screen('P0203', 'Trip Sheet - Bill Details'), require('./routes/tripSheetBills'));
// "Get Latest Bills" on Trip Sheet - Bill Details runs syncs
app.use('/api/sync', screen('P0203', 'Trip Sheet - Bill Details'), require('./routes/sync'));
app.use('/api/users', requireAdmin, logActivity('P0301', 'Users'), require('./routes/users'));
app.use('/api/user-log', requireAdmin, require('./routes/userLog'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

const port = process.env.PORT || 5050;
app.listen(port, () => {
  console.log(`InvUtility backend running on http://localhost:${port}`);
  startScheduler();
});
