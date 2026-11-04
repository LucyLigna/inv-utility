import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert, AppBar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, IconButton, LinearProgress,
  Paper, TextField, Toolbar, Typography,
} from '@mui/material';
import { CheckCircle, ErrorOutline, Logout, QrCodeScanner, Refresh } from '@mui/icons-material';
import QrScanner from './QrScanner';

// Driver delivery page, opened on the phone at /driver. The driver logs in with the mobile number from Driver
// Master and the trip sheet's 4-digit driver code, sees the trip's customers in delivery order, and marks each
// one delivered by scanning the QR code on its box of the customer-wise print.
const TOKEN_KEY = 'inv_driver_token';
const store = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* not kept */ } },
};
const driverApi = axios.create({ baseURL: '/api/driver' });
driverApi.interceptors.request.use((config) => {
  const token = store.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
const message = (err) => err.response?.data?.message || (err.response ? err.message : 'No connection to the server. Check the mobile data and try again.');
const showDate = (d) => (d ? d.split('-').reverse().join('-') : '');
const time = (d) => (d ? d.slice(11, 16) : '');

// The phone's location for the delivery, if the driver allows it; never waits more than a few seconds
const locate = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  );
});

function Login({ onLogin }) {
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await driverApi.post('/login', { mobile, pin });
      store.set(data.token);
      onLogin();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#eef1f6', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Paper component="form" onSubmit={submit} sx={{ p: 3, width: '100%', maxWidth: 380 }}>
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <QrCodeScanner sx={{ fontSize: 44, color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>Delivery</Typography>
          <Typography variant="body2" color="text.secondary">Log in with your mobile number and the driver code for your trip</Typography>
        </Box>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          label="Mobile number" fullWidth autoFocus value={mobile} onChange={(e) => setMobile(e.target.value)}
          inputProps={{ inputMode: 'tel', autoComplete: 'tel' }} sx={{ mb: 2 }}
        />
        <TextField
          label="Driver code" fullWidth value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code', style: { letterSpacing: 8, fontSize: 22 } }} sx={{ mb: 2 }}
        />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={busy || !mobile || pin.length !== 4}>
          {busy ? <CircularProgress size={24} color="inherit" /> : 'Log in'}
        </Button>
      </Paper>
    </Box>
  );
}

function Trip({ onLogout }) {
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null); // { ok, title, text }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await driverApi.get('/trip');
      setTrip(data);
      setError('');
    } catch (err) {
      if (err.response?.status === 401) return onLogout(message(err));
      setError(message(err));
    }
  }, [onLogout]);
  useEffect(() => { load(); }, [load]);

  // A scanned QR (or a typed code): mark that customer delivered, with the location when there is one
  const deliver = async (text) => {
    setScanning(false);
    setBusy(true);
    try {
      const where = await locate();
      const { data } = await driverApi.post('/deliver', { text, ...(where || {}) });
      setResult(data.already
        ? { ok: true, title: 'Already delivered', text: `${data.name} was marked delivered at ${time(data.delivered_at)}.` }
        : { ok: true, title: 'Delivered', text: `${data.name} marked delivered at ${time(data.delivered_at)}.${where ? '' : ' (Location not available.)'}` });
      await load();
    } catch (err) {
      if (err.response?.status === 401) return onLogout(message(err));
      setResult({ ok: false, title: 'Not marked', text: message(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!trip) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        {error ? <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>{error}</Alert> : <CircularProgress />}
      </Box>
    );
  }

  const { sheet, stops } = trip;
  const done = stops.filter((s) => s.delivered).length;
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#eef1f6', pb: 12 }}>
      <AppBar position="sticky" elevation={1}>
        <Toolbar sx={{ gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={700} noWrap>{sheet.tsc_no} · {sheet.route_name}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }} noWrap>
              {sheet.driver_name} · Loading {showDate(sheet.loading_date)} · Code till {sheet.code_till}
            </Typography>
          </Box>
          <IconButton color="inherit" onClick={load} aria-label="refresh"><Refresh /></IconButton>
          <IconButton color="inherit" onClick={() => onLogout()} aria-label="log out"><Logout /></IconButton>
        </Toolbar>
        <LinearProgress variant="determinate" value={stops.length ? (done / stops.length) * 100 : 0} color="success" sx={{ height: 5 }} />
      </AppBar>

      <Box sx={{ p: 1.5, maxWidth: 560, mx: 'auto' }}>
        <Typography variant="body2" sx={{ mb: 1, color: '#444' }}>
          <b>{done}</b> of <b>{stops.length}</b> customers delivered · {stops.reduce((n, s) => n + s.bills.length, 0)} bills ·{' '}
          {stops.reduce((n, s) => n + s.cases, 0)} cases
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {stops.map((s, i) => (
          <Paper key={s.key} variant="outlined" sx={{ p: 1.5, mb: 1, display: 'flex', gap: 1.5, alignItems: 'center', opacity: s.delivered ? 0.75 : 1, borderColor: s.delivered ? '#a5d6a7' : undefined }}>
            <Box sx={{ width: 28, height: 28, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, bgcolor: s.delivered ? '#2e7d32' : '#dfe3ea', color: s.delivered ? '#fff' : '#333' }}>
              {s.delivered ? <CheckCircle sx={{ fontSize: 20 }} /> : i + 1}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={700} sx={{ fontSize: 15, lineHeight: 1.25 }}>{s.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {s.place || '—'} · {s.bills.length} bill{s.bills.length > 1 ? 's' : ''} · {s.cases} cases
              </Typography>
            </Box>
            {s.delivered && <Chip size="small" color="success" label={time(s.delivered.delivered_at)} />}
          </Paper>
        ))}
        {!stops.length && <Alert severity="info">There are no bills on this trip sheet yet.</Alert>}
      </Box>

      <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, p: 1.5, bgcolor: 'rgba(238,241,246,0.95)', borderTop: '1px solid #d5d8e0' }}>
        <Button
          variant="contained" size="large" fullWidth startIcon={busy ? <CircularProgress size={22} color="inherit" /> : <QrCodeScanner />}
          onClick={() => setScanning(true)} disabled={busy || !stops.length} sx={{ py: 1.5, fontSize: 17, maxWidth: 560, mx: 'auto', display: 'flex' }}
        >
          {busy ? 'Marking…' : 'Scan QR to mark delivered'}
        </Button>
      </Box>

      <QrScanner open={scanning} onClose={() => setScanning(false)} onResult={deliver} />

      <Dialog open={Boolean(result)} onClose={() => setResult(null)} fullWidth maxWidth="xs">
        {result && (
          <>
            <DialogContent sx={{ textAlign: 'center', pt: 3 }}>
              {result.ok
                ? <CheckCircle sx={{ fontSize: 64, color: '#2e7d32' }} />
                : <ErrorOutline sx={{ fontSize: 64, color: '#c62828' }} />}
              <Typography variant="h6" fontWeight={700}>{result.title}</Typography>
              <Typography>{result.text}</Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setResult(null)}>OK</Button>
              <Button variant="contained" onClick={() => { setResult(null); setScanning(true); }}>Scan next</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

export default function DriverApp() {
  const [loggedIn, setLoggedIn] = useState(Boolean(store.get()));
  const [notice, setNotice] = useState('');
  const logout = useCallback((why) => {
    store.set(null);
    setNotice(typeof why === 'string' ? why : '');
    setLoggedIn(false);
  }, []);

  useEffect(() => {
    document.title = 'INV Delivery';
  }, []);

  if (!loggedIn) {
    return (
      <>
        {notice && <Alert severity="info" onClose={() => setNotice('')} sx={{ borderRadius: 0 }}>{notice}</Alert>}
        <Login onLogin={() => { setNotice(''); setLoggedIn(true); }} />
      </>
    );
  }
  return <Trip onLogout={logout} />;
}
