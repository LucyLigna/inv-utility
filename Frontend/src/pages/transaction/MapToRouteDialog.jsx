import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio,
  RadioGroup, Typography,
} from '@mui/material';
import api, { errorMessage } from '../../api';

const keyOf = (c) => `${c.company_code}|${c.ba_code}|${c.cu_code}`;

// Map a customer that is not on the trip route to it (Trip Route Wise Customers). If customers on the route share
// its GST number (or mobile number), it can go under one of their main customers as a sub customer, or be added as
// a new main customer at the end of the route.
// customer: { company_code, ba_code, cu_code, name, company_branch } or null; tripCode: the route
export default function MapToRouteDialog({ customer, tripCode, onClose, onMapped }) {
  const [options, setOptions] = useState(null);
  const [choice, setChoice] = useState('main');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setOptions(null);
    setError('');
    api.get(`/trip-route-customers/${tripCode}/map-options`, {
      params: { company_code: customer.company_code, ba_code: customer.ba_code, cu_code: customer.cu_code },
    })
      .then(({ data }) => {
        setOptions(data);
        setChoice(data.mains.length ? keyOf(data.mains[0]) : 'main');
      })
      .catch((err) => setError(errorMessage(err)));
  }, [customer, tripCode]);

  const map = async () => {
    setSaving(true);
    try {
      const under = choice === 'main' ? null : options.mains.find((m) => keyOf(m) === choice);
      await api.post(`/trip-route-customers/${tripCode}/map`, {
        company_code: customer.company_code,
        ba_code: customer.ba_code,
        cu_code: customer.cu_code,
        under: under ? { company_code: under.company_code, ba_code: under.ba_code, cu_code: under.cu_code } : null,
      });
      onMapped(under ? `${customer.name} added under ${under.name}` : `${customer.name} added as a main customer`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const matchLabel = options?.match === 'gst' ? 'GST number' : 'mobile number';

  return (
    <Dialog open={Boolean(customer)} onClose={onClose} maxWidth="sm" fullWidth>
      {customer && (
        <>
          <DialogTitle>Map {customer.name} to {options?.route.name || 'the route'}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              {customer.company_branch}. It will be added to Trip Route Wise Customers for this route, so its bills
              are listed as route customers from now on.
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
            {!options && !error && <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={28} /></Box>}
            {options && options.alreadyOnRoute && (
              <Alert severity="info">This customer is already on the route. Refresh the screen to see it there.</Alert>
            )}
            {options && !options.alreadyOnRoute && (
              <>
                {options.mains.length > 0 ? (
                  <Alert severity="warning" sx={{ mb: 1.5 }}>
                    Customers on this route have the same {matchLabel} ({options.value}). Choose whether to add it under
                    one of them as a sub customer, or as a new main customer.
                  </Alert>
                ) : (
                  <Alert severity="info" sx={{ mb: 1.5 }}>
                    {options.match
                      ? `No customer on this route has the same ${matchLabel} (${options.value}).`
                      : 'This customer has no GST or mobile number to match on.'}
                    {' '}It will be added as a new main customer at the end of the route.
                  </Alert>
                )}
                <RadioGroup value={choice} onChange={(e) => setChoice(e.target.value)}>
                  {options.mains.map((m) => (
                    <FormControlLabel
                      key={keyOf(m)}
                      value={keyOf(m)}
                      control={<Radio />}
                      label={(
                        <Box>
                          <Box>Sub customer under <b>{m.name}</b></Box>
                          <Box sx={{ fontSize: 13, color: '#666' }}>
                            Same {matchLabel} as: {m.matched.join(', ')}
                          </Box>
                        </Box>
                      )}
                      sx={{ alignItems: 'flex-start', mb: 1, '& .MuiRadio-root': { pt: 0.5 } }}
                    />
                  ))}
                  <FormControlLabel value="main" control={<Radio />} label="New main customer (at the end of the route)" />
                </RadioGroup>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={map} disabled={!options || options.alreadyOnRoute || saving}>
              Map to route
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
