require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const express = require('express');
const cors = require('cors');
const { startScheduler } = require('./sync/scheduler');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/vehicles', require('./routes/vehicle'));
app.use('/api/drivers', require('./routes/driver'));
app.use('/api/trip-routes', require('./routes/tripRoute'));
app.use('/api/trip-sheets', require('./routes/tripSheet'));
app.use('/api/trip-sheet-bills', require('./routes/tripSheetBills'));
app.use('/api/trip-route-customers',require('./routes/tripRouteCustomers'));
app.use('/api/sync',require('./routes/sync'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

const port = process.env.PORT || 5050;
app.listen(port, () => {
  console.log(`InvUtility backend running on http://localhost:${port}`);
  startScheduler();
});
