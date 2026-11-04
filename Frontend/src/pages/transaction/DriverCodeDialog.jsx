import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material';
import api, { errorMessage } from '../../api';

// 'YYYY-MM-DDTHH:mm' in local time, as a datetime-local input wants it
const local = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const showDateTime = (d) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)} ${d.slice(11, 16)}` : '');

// The trip sheet's driver code: 4 digits the driver enters with the mobile number on the delivery page (/driver),
// active only from / till the times given here. Generating again replaces the old code.
// sheet: the Trip Sheet list row, or null; onClose(changed)
export default function DriverCodeDialog({ sheet, onClose }) {
  const [from, setFrom] = useState('');
  const [till, setTill] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sheet) return;
    // Default: from now till the end of the trip's end date (or the loading date)
    const now = new Date();
    now.setSeconds(0, 0);
    const lastDay = sheet.end_date || sheet.start_date || sheet.loading_date;
    let end = lastDay ? new Date(`${lastDay}T23:59`) : null;
    if (!end || end <= now) end = new Date(now.getTime() + 24 * 3600 * 1000);
    setFrom(sheet.driver_pin_from ? sheet.driver_pin_from.replace(' ', 'T') : local(now));
    setTill(sheet.driver_pin_till ? sheet.driver_pin_till.replace(' ', 'T') : local(end));
    if (sheet.driver_pin_till && new Date(sheet.driver_pin_till.replace(' ', 'T')) < now) {
      setFrom(local(now));
      setTill(local(end));
    }
    setResult(null);
    setError('');
  }, [sheet]);

  const generate = async () => {
    if (!from || !till) return setError('Enter both active from and active till');
    if (till <= from) return setError('Active till must be after active from');
    setSaving(true);
    try {
      const { data } = await api.post(`/trip-sheets/${sheet.code}/driver-code`, { from: from.replace('T', ' '), till: till.replace('T', ' ') });
      setResult(data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const current = result
    ? { pin: result.driver_pin, from: result.from, till: result.till }
    : sheet?.driver_pin && { pin: sheet.driver_pin, from: sheet.driver_pin_from, till: sheet.driver_pin_till };

  return (
    <Dialog open={Boolean(sheet)} onClose={() => onClose(Boolean(result))} maxWidth="xs" fullWidth>
      {sheet && (
        <>
          <DialogTitle>Driver code · {sheet.tsc_no}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" mb={2}>
              {sheet.driver_name} logs in to the delivery page with mobile number <b>{sheet.driver_mobile || 'not set'}</b> and
              this code, and scans the QR code on each customer of the customer-wise print.
            </Typography>
            {!sheet.driver_mobile && (
              <Alert severity="warning" sx={{ mb: 2 }}>Add the driver's mobile number in Driver Master first.</Alert>
            )}
            {current && (
              <Box sx={{ textAlign: 'center', mb: 2, p: 1.5, bgcolor: result ? '#e8f5e9' : '#f5f6fa', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">{result ? 'New driver code' : 'Current driver code'}</Typography>
                <Typography sx={{ fontSize: 36, fontWeight: 700, letterSpacing: 8, lineHeight: 1.2 }}>{current.pin}</Typography>
                <Typography variant="body2">Active {showDateTime(current.from)} till {showDateTime(current.till)}</Typography>
              </Box>
            )}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
              <TextField size="small" type="datetime-local" label="Active from" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField size="small" type="datetime-local" label="Active till" value={till} onChange={(e) => setTill(e.target.value)} InputLabelProps={{ shrink: true }} />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => onClose(Boolean(result))}>Close</Button>
            <Button variant="contained" onClick={generate} disabled={saving || !sheet.driver_mobile}>
              {current ? 'Generate new code' : 'Generate code'}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
