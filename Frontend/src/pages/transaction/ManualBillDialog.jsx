import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography,
} from '@mui/material';
import api, { errorMessage } from '../../api';

const keyOf = (c) => `${c.company_code}|${c.ba_code}|${c.cu_code}`;
const branchKey = (b) => `${b.company_code}|${b.ba_code}`;

// A bill entered by hand (not in INV): for a main customer of the sheet's route (Trip Route Wise Customers),
// with its company - branch, bill #, date, number of cases and, optionally, the amount.
// sheet: the processed trip sheet (open when set); onAdded(bill) gets the new bill to put on the sheet.
// bill: a manual bill to edit instead (its fields are filled in); onSaved(result) gets the server's answer.
export default function ManualBillDialog({ sheet, open, bill = null, onClose, onAdded, onSaved }) {
  const [route, setRoute] = useState(null); // { customers (main only), branches }
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !sheet) return;
    setError('');
    setRoute(null);
    setForm(bill
      ? {
        customer: null,
        branch: `${bill.company_code}|${bill.ba_code}`,
        smc_no: bill.smc_no || '',
        bill_date: bill.bill_date || '',
        net_amount: bill.net_amount == null ? '' : String(Number(bill.net_amount)),
        pack_qty: String(bill.pack_qty ?? ''),
      }
      : { customer: null, branch: '', smc_no: '', bill_date: sheet.loading_date || '', net_amount: '', pack_qty: '' });
    api.get(`/trip-sheet-bills/${sheet.code}/manual-options`)
      .then(({ data }) => {
        setRoute(data);
        // Editing: select the bill's customer among the route's main customers
        if (bill) {
          const key = `${bill.cust_company_code}|${bill.cust_ba_code}|${bill.cu_code}`;
          setForm((f) => ({ ...f, customer: data.customers.find((c) => keyOf(c) === key) || null }));
        }
      })
      .catch((err) => setError(errorMessage(err)));
  }, [open, sheet, bill]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  // Picking the customer fills in its own company - branch when that is one of the route's branches
  const pickCustomer = (c) => setForm((f) => {
    const own = c && route.branches.find((b) => branchKey(b) === `${c.company_code}|${c.ba_code}`);
    return { ...f, customer: c, branch: own ? branchKey(own) : f.branch };
  });

  const save = async () => {
    if (!form.customer) return setError('Select the customer');
    if (!form.branch) return setError('Select the company - branch');
    if (!form.smc_no.trim()) return setError('Bill # is required');
    if (!form.bill_date) return setError('Date is required');
    if (!/^\d+$/.test(String(form.pack_qty)) || Number(form.pack_qty) < 1) return setError('Number of cases must be a whole number of 1 or more');
    if (String(form.net_amount).trim() && !(Number(form.net_amount) >= 0)) return setError('Amount must be a number of 0 or more');
    const [company_code, ba_code] = form.branch.split('|');
    setSaving(true);
    try {
      const body = {
        customer: { company_code: form.customer.company_code, ba_code: form.customer.ba_code, cu_code: form.customer.cu_code },
        company_code,
        ba_code,
        smc_no: form.smc_no.trim(),
        bill_date: form.bill_date,
        net_amount: String(form.net_amount).trim() === '' ? null : Number(form.net_amount),
        pack_qty: Number(form.pack_qty),
      };
      if (bill) {
        const { data } = await api.put(`/trip-sheet-bills/${sheet.code}/manual-bills/${bill.company_code}/${bill.ba_code}/${bill.sm_slno}`, body);
        onSaved(data);
      } else {
        const { data } = await api.post(`/trip-sheet-bills/${sheet.code}/manual-bills`, body);
        onAdded(data.bill);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{bill ? `Edit manual bill ${bill.smc_no}` : `Add manual bill · ${sheet?.tsc_no}`}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {bill
            ? 'Changes are saved straight away, also on the trip sheet the bill is on.'
            : 'For a bill that is not in INV. It goes on this trip sheet under the main customer chosen here; press Save to keep it.'}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!route && !error && <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={28} /></Box>}
        {route && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Autocomplete
              sx={{ gridColumn: '1 / -1' }}
              options={route.customers}
              value={form.customer}
              onChange={(e, c) => pickCustomer(c)}
              getOptionLabel={(c) => c.cuc_desc}
              isOptionEqualToValue={(a, b) => keyOf(a) === keyOf(b)}
              renderOption={(props, c) => (
                <li {...props} key={keyOf(c)}>
                  <Box>
                    <b>{c.cuc_desc}</b>
                    <Box sx={{ fontSize: 13, color: '#666' }}>{[c.cuc_place, c.company_branch].filter(Boolean).join(' · ')}</Box>
                  </Box>
                </li>
              )}
              noOptionsText="No main customers on this route; add them in Trip Route Wise Customers"
              renderInput={(params) => <TextField {...params} required label="Customer (main customer of the route)" />}
            />
            <TextField
              select required label="Company - Branch" value={form.branch} onChange={(e) => set('branch', e.target.value)}
              sx={{ gridColumn: '1 / -1' }}
            >
              {route.branches.map((b) => <MenuItem key={branchKey(b)} value={branchKey(b)}>{b.company_branch}</MenuItem>)}
            </TextField>
            <TextField required label="Bill #" value={form.smc_no} onChange={(e) => set('smc_no', e.target.value.toUpperCase())} inputProps={{ maxLength: 20 }} />
            <TextField required type="date" label="Date" value={form.bill_date} onChange={(e) => set('bill_date', e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField
              label="Amount (optional)" value={form.net_amount} inputProps={{ inputMode: 'decimal' }}
              onChange={(e) => set('net_amount', e.target.value.replace(/[^\d.]/g, ''))}
            />
            <TextField
              required label="Number of cases" value={form.pack_qty} inputProps={{ inputMode: 'numeric', maxLength: 5 }}
              onChange={(e) => set('pack_qty', e.target.value.replace(/\D/g, ''))}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!route || saving}>{bill ? 'Save changes' : 'Add bill'}</Button>
      </DialogActions>
    </Dialog>
  );
}
