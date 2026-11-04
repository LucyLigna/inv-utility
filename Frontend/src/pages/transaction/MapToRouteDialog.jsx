import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Radio, RadioGroup, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import api, { errorMessage } from '../../api';
import { useConfirm } from '../../components/ConfirmDialog';

const BORDER = '1px solid #d5d8e0';
const cell = { border: BORDER, px: 1.5, py: 0.75, fontSize: 14 };
const head = { ...cell, fontWeight: 700, bgcolor: '#f5f6fa', color: '#111' };
const keyOf = (c) => `${c.company_code}|${c.ba_code}|${c.cu_code}`;

// Map a customer that is not on the trip route to it, the same way a customer is added in Trip Route Wise
// Customers: it becomes a main customer and the ticked customers (same GST number / mobile, or found by search)
// go under it. If customers on the route already share its GST number, it can instead go under their main customer.
// customer: { company_code, ba_code, cu_code, name, company_branch } or null; tripCode: the route
export default function MapToRouteDialog({ customer, tripCode, onClose, onMapped }) {
  const [options, setOptions] = useState(null); // map-options: route, onRoute, mains
  const [related, setRelated] = useState(null); // { match, value, customers }
  const [picked, setPicked] = useState(new Map());
  const [place, setPlace] = useState('main'); // 'main' or the key of a main customer on the route
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    if (!customer) return;
    setOptions(null);
    setRelated(null);
    setPicked(new Map());
    setPlace('main');
    setSearch('');
    setResults([]);
    setError('');
    const params = { company_code: customer.company_code, ba_code: customer.ba_code, cu_code: customer.cu_code };
    Promise.all([
      api.get(`/trip-route-customers/${tripCode}/map-options`, { params }),
      api.get(`/trip-route-customers/${tripCode}/related`, { params }),
    ])
      .then(([o, r]) => {
        setOptions(o.data);
        setRelated(r.data);
        // When customers on the route share the GST number / mobile, default to going under their main customer
        if (o.data.mains.length) setPlace(keyOf(o.data.mains[0]));
      })
      .catch((err) => setError(errorMessage(err)));
  }, [customer, tripCode]);

  // Search inside the pop-up, for customers that don't share the GST number or mobile
  useEffect(() => {
    if (!customer || search.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      api.get(`/trip-route-customers/${tripCode}/search`, { params: { name: search } })
        .then(({ data }) => setResults(data.filter((c) => keyOf(c) !== keyOf(customer))))
        .catch((err) => setError(errorMessage(err)));
    }, 350);
    return () => clearTimeout(timer);
  }, [search, customer, tripCode]);

  const onRoute = new Set(options?.onRoute || []);
  const searching = search.trim().length >= 2;
  const list = searching ? results : related?.customers || [];
  const selectable = list.filter((c) => !onRoute.has(keyOf(c)));
  const underMain = options?.mains.find((m) => keyOf(m) === place);
  const matchLabel = related?.match === 'gst' ? 'GST number' : 'mobile number';

  const toggle = (c) => setPicked((m) => {
    const next = new Map(m);
    if (next.has(keyOf(c))) next.delete(keyOf(c));
    else next.set(keyOf(c), c);
    return next;
  });

  const add = async () => {
    const subs = [...picked.values()];
    if (!subs.length && !underMain && !(await confirm({
      title: 'No sub customer selected',
      message: <>Add <b>{customer.name}</b> to the route without any sub customers?</>,
      cancelLabel: 'No',
      confirmLabel: 'Yes, add',
    }))) return;
    setSaving(true);
    try {
      await api.post(`/trip-route-customers/${tripCode}/map`, {
        company_code: customer.company_code,
        ba_code: customer.ba_code,
        cu_code: customer.cu_code,
        subs: subs.map(({ company_code, ba_code, cu_code }) => ({ company_code, ba_code, cu_code })),
        under: underMain ? { company_code: underMain.company_code, ba_code: underMain.ba_code, cu_code: underMain.cu_code } : null,
      });
      const withSubs = subs.length ? ` with ${subs.length} sub customer${subs.length > 1 ? 's' : ''}` : '';
      onMapped(underMain ? `${customer.name}${withSubs} added under ${underMain.name}` : `${customer.name}${withSubs} added to the route`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(customer)} onClose={onClose} maxWidth="md" fullWidth>
      {customer && (
        <>
          <DialogTitle>Add {customer.name}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" mb={1.5}>
              <b>{customer.name}</b> ({customer.company_branch}) will be added to {options?.route.name || 'the route'}
              {underMain ? <> as a sub customer under <b>{underMain.name}</b></> : ' as the main customer'}.
              {' '}Tick the customers to list under it.
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
            {!options && !error && <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={28} /></Box>}
            {options?.alreadyOnRoute && <Alert severity="info">This customer is already on the route.</Alert>}

            {options && !options.alreadyOnRoute && (
              <>
                {options.mains.length > 0 && (
                  <Alert severity="warning" icon={false} sx={{ mb: 1.5 }}>
                    <Typography variant="body2" mb={0.5}>
                      Customers on this route already have the same {matchLabel}. Add it as:
                    </Typography>
                    <RadioGroup value={place} onChange={(e) => setPlace(e.target.value)}>
                      {options.mains.map((m) => (
                        <FormControlLabel
                          key={keyOf(m)}
                          value={keyOf(m)}
                          control={<Radio size="small" />}
                          label={<>Sub customer under <b>{m.name}</b> <Box component="span" sx={{ color: '#666', fontSize: 13 }}>(same {matchLabel} as {m.matched.join(', ')})</Box></>}
                        />
                      ))}
                      <FormControlLabel value="main" control={<Radio size="small" />} label="A new main customer (at the end of the route)" />
                    </RadioGroup>
                  </Alert>
                )}
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search other customers"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  sx={{ mb: 1.5 }}
                />
                <Typography variant="body2" color="text.secondary" mb={1}>
                  {searching
                    ? `${list.length} customers matching "${search.trim()}"`
                    : related?.match
                      ? `${list.length} customers with the same ${matchLabel} (${related.value})`
                      : 'This customer has no GST or mobile number to match on. Search above to find sub customers.'}
                  {picked.size > 0 && <b> · {picked.size} selected</b>}
                </Typography>
                <Table size="small" sx={{ borderCollapse: 'collapse' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ ...head, width: 48 }} padding="checkbox">
                        <Checkbox
                          size="small"
                          disabled={!selectable.length}
                          checked={selectable.length > 0 && selectable.every((c) => picked.has(keyOf(c)))}
                          onChange={(e) => setPicked((m) => {
                            const next = new Map(m);
                            selectable.forEach((c) => (e.target.checked ? next.set(keyOf(c), c) : next.delete(keyOf(c))));
                            return next;
                          })}
                        />
                      </TableCell>
                      <TableCell sx={head}>Name</TableCell>
                      <TableCell sx={head}>Place</TableCell>
                      <TableCell sx={head}>Company - Branch</TableCell>
                      <TableCell sx={head}>Route</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {list.map((c) => {
                      const added = onRoute.has(keyOf(c));
                      return (
                        <TableRow key={keyOf(c)} hover={!added} onClick={() => !added && toggle(c)} sx={{ cursor: added ? 'default' : 'pointer' }}>
                          <TableCell sx={cell} padding="checkbox">
                            <Checkbox size="small" disabled={added} checked={added || picked.has(keyOf(c))} />
                          </TableCell>
                          <TableCell sx={{ ...cell, color: added ? '#aaa' : 'inherit' }}>
                            {c.cuc_desc}
                            {added && <Chip size="small" label="Already on route" sx={{ ml: 1, height: 20 }} />}
                          </TableCell>
                          <TableCell sx={cell}>{c.cuc_place}</TableCell>
                          <TableCell sx={cell}>{c.company_branch}</TableCell>
                          <TableCell sx={cell}>{c.route_name}</TableCell>
                        </TableRow>
                      );
                    })}
                    {!list.length && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ ...cell, color: '#888' }}>No customers to show</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={add} disabled={!options || options.alreadyOnRoute || saving}>Add</Button>
          </DialogActions>
          {confirmDialog}
        </>
      )}
    </Dialog>
  );
}
