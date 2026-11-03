import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Paper, Snackbar, Table, TableBody, TableCell, TableContainer,
  TableFooter, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { PlayArrow, Refresh, Save } from '@mui/icons-material';
import ActionBar from '../../components/ActionBar';
import { useConfirm } from '../../components/ConfirmDialog';
import api, { errorMessage } from '../../api';

const BORDER = '1px solid #d5d8e0';
const cell = { border: BORDER, px: 1.5, py: 0.75, fontSize: 14 };
const head = { ...cell, fontWeight: 700, bgcolor: '#f5f6fa', color: '#111' };
const num = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };

const billKey = (b) => `${b.company_code}|${b.ba_code}|${b.sm_slno}`;
const customerKey = (b) => `${b.company_code}|${b.ba_code}|${b.cu_code}`;
const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const showDate = (d) => (d ? d.split('-').reverse().join('-') : '');
const sheetLabel = (s) => `${s.tsc_no} · ${s.route_name} · ${showDate(s.loading_date)} (${(s.loading_day || '').slice(0, 3)})`;
const snapshot = (map) => JSON.stringify([...map.keys()].sort());

// Selected bills grouped per customer, in the route's visiting order (customers not on the route last)
function byCustomer(bills) {
  const groups = new Map();
  for (const b of bills) {
    const k = customerKey(b);
    if (!groups.has(k)) {
      groups.set(k, {
        key: k, cuc_desc: b.cuc_desc, company_branch: b.company_branch, cuc_place: b.cuc_place,
        route_order: b.route_order, cases: 0, bills: 0, amount: 0,
      });
    }
    const g = groups.get(k);
    g.cases += Number(b.pack_qty) || 0;
    g.bills += 1;
    g.amount += Number(b.net_amount) || 0;
  }
  return [...groups.values()].sort((a, b) => (a.route_order ?? 1e9) - (b.route_order ?? 1e9)
    || String(a.cuc_desc).localeCompare(String(b.cuc_desc)));
}

export default function TripSheetBills() {
  const [sheets, setSheets] = useState([]);
  const [picked, setPicked] = useState(null); // sheet chosen in the box
  const [sheet, setSheet] = useState(null); // sheet loaded by Process
  const [selected, setSelected] = useState(new Map()); // bill key -> bill
  const [savedKey, setSavedKey] = useState('');
  const [customers, setCustomers] = useState('route'); // route | all
  const [transport, setTransport] = useState('own'); // own | all
  const [search, setSearch] = useState('');
  const [available, setAvailable] = useState([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const loadSheets = () => api.get('/trip-sheet-bills/sheets')
    .then(({ data }) => setSheets(data))
    .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    loadSheets();
  }, []);

  const dirty = Boolean(sheet) && snapshot(selected) !== savedKey;

  const process = async (s = picked) => {
    if (!s) return;
    if (dirty && !(await confirm({
      message: "Any bills you've ticked or unticked on this trip sheet will be lost. This can't be undone.",
      cancelLabel: 'Keep editing',
      confirmLabel: 'Discard',
    }))) return;
    try {
      const { data } = await api.get(`/trip-sheet-bills/${s.code}`);
      const map = new Map(data.bills.map((b) => [billKey(b), b]));
      setSheet(data.sheet);
      setSelected(map);
      setSavedKey(snapshot(map));
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // Bills that can be picked, reloaded when the sheet or a filter changes
  useEffect(() => {
    if (!sheet) return undefined;
    const timer = setTimeout(async () => {
      setLoadingBills(true);
      try {
        const { data } = await api.get(`/trip-sheet-bills/${sheet.code}/available`, {
          params: { customers, transport, search },
        });
        setAvailable(data);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoadingBills(false);
      }
    }, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [sheet, customers, transport, search]);

  const toggle = (b) => setSelected((m) => {
    const next = new Map(m);
    if (next.has(billKey(b))) next.delete(billKey(b));
    else next.set(billKey(b), b);
    return next;
  });
  const allTicked = available.length > 0 && available.every((b) => selected.has(billKey(b)));
  const toggleAll = () => setSelected((m) => {
    const next = new Map(m);
    available.forEach((b) => (allTicked ? next.delete(billKey(b)) : next.set(billKey(b), b)));
    return next;
  });

  const save = async () => {
    try {
      const bills = [...selected.values()].map(({ company_code, ba_code, sm_slno }) => ({ company_code, ba_code, sm_slno }));
      const { data } = await api.put(`/trip-sheet-bills/${sheet.code}`, { bills });
      setSavedKey(snapshot(selected));
      setSheet({ ...sheet, total_bills: data.total_bills, total_pack_qty: data.total_pack_qty });
      setNotice(`Saved ${data.total_bills} bills (${data.total_pack_qty} cases) on ${sheet.tsc_no}`);
      loadSheets();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const groups = byCustomer([...selected.values()]);
  const totals = groups.reduce((t, g) => ({ bills: t.bills + g.bills, cases: t.cases + g.cases, amount: t.amount + g.amount }),
    { bills: 0, cases: 0, amount: 0 });

  return (
    <Box>
      <ActionBar
        left={[
          { label: 'Save', icon: <Save />, onClick: save, disabled: !dirty },
          { label: 'Refresh', icon: <Refresh />, onClick: () => process(sheet), disabled: !sheet },
        ]}
      />
      <Box sx={{ p: 2.5 }}>
        <Typography variant="h5" mb={2}>Trip Sheet - Bill Details</Typography>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ mb: 2, display: 'flex', alignItems: 'stretch', gap: 2, flexWrap: { xs: 'wrap', lg: 'nowrap' } }}>
          <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <Autocomplete
              options={sheets}
              value={picked}
              onChange={(e, value) => setPicked(value)}
              getOptionLabel={sheetLabel}
              isOptionEqualToValue={(a, b) => a.code === b.code}
              sx={{ width: 460 }}
              renderInput={(params) => <TextField {...params} label="Trip Sheet" placeholder="Select a trip sheet" />}
            />
            <Button variant="contained" size="large" startIcon={<PlayArrow />} disabled={!picked} onClick={() => process()}>
              Process
            </Button>
          </Paper>
          {/* The processed sheet and its saved totals */}
          <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 280 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, letterSpacing: 1, color: '#555', textTransform: 'uppercase', mb: 1 }}>
              Trip Sheet
            </Typography>
            {sheet ? (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', fontSize: 14 }}>
                {[
                  ['Sheet No', sheet.tsc_no],
                  ['Route', sheet.route_name],
                  ['Loading', `${showDate(sheet.loading_date)} (${sheet.loading_day})`],
                  ['Driver', sheet.driver_name],
                  ['Saved', `${sheet.total_bills} bills · ${sheet.total_pack_qty} cases`],
                ].map(([label, value]) => (
                  <Box key={label}>
                    <Box sx={{ color: '#666', fontSize: 12 }}>{label}</Box>
                    <Box sx={{ fontWeight: 700 }}>{value}</Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">Select a trip sheet and press Process.</Typography>
            )}
          </Paper>
        </Box>

        {sheet && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' }, gap: 2.5, alignItems: 'start' }}>
            {/* Left: the ticked bills, totalled per customer */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>
                Selected Customer ({groups.length})
                {dirty && <Box component="span" sx={{ color: '#c77700', fontWeight: 400 }}> · not saved</Box>}
              </Typography>
              <TableContainer sx={{ maxHeight: 'calc(100vh - 340px)' }}>
                <Table stickyHeader size="small" sx={{ borderCollapse: 'collapse' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={head}>Customer</TableCell>
                      <TableCell sx={head}>Company - Branch</TableCell>
                      <TableCell sx={head}>Place</TableCell>
                      <TableCell sx={{ ...head, textAlign: 'right' }}>Number of cases</TableCell>
                      <TableCell sx={{ ...head, textAlign: 'right' }}>Number of bills</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groups.map((g) => (
                      <TableRow key={g.key} hover>
                        <TableCell sx={{ ...cell, fontWeight: 600 }}>
                          {g.cuc_desc}
                          {g.route_order == null && <Chip size="small" label="Not on route" sx={{ ml: 1, height: 20 }} />}
                        </TableCell>
                        <TableCell sx={cell}>{g.company_branch}</TableCell>
                        <TableCell sx={cell}>{g.cuc_place}</TableCell>
                        <TableCell sx={num}>{g.cases}</TableCell>
                        <TableCell sx={num}>{g.bills}</TableCell>
                      </TableRow>
                    ))}
                    {!groups.length && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ ...cell, color: '#888' }}>
                          No bills selected. Tick bills on the right.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {groups.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} sx={{ ...head, position: 'sticky', bottom: 0 }}>
                          Total (amount ₹ {money(totals.amount)})
                        </TableCell>
                        <TableCell sx={{ ...head, ...num, fontWeight: 700, position: 'sticky', bottom: 0 }}>{totals.cases}</TableCell>
                        <TableCell sx={{ ...head, ...num, fontWeight: 700, position: 'sticky', bottom: 0 }}>{totals.bills}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </TableContainer>
            </Paper>

            {/* Right: bills to pick from */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
                <Typography sx={{ fontWeight: 700, mr: 'auto' }}>Bills</Typography>
                <ToggleButtonGroup size="small" exclusive value={transport} onChange={(e, v) => v && setTransport(v)}>
                  <ToggleButton value="own">Own</ToggleButton>
                  <ToggleButton value="all">All</ToggleButton>
                </ToggleButtonGroup>
                <ToggleButtonGroup size="small" exclusive value={customers} onChange={(e, v) => v && setCustomers(v)}>
                  <ToggleButton value="route">Route customers</ToggleButton>
                  <ToggleButton value="all">All customers</ToggleButton>
                </ToggleButtonGroup>
                <TextField size="small" placeholder="Bill no or customer" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 200 }} />
              </Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                {loadingBills ? 'Loading…' : `${available.length} bills ${transport === 'own' ? '(own transport)' : ''} for ${
                  customers === 'route' ? 'customers on this route' : "all customers in the route's branches"}. Bills already on another trip sheet are not listed.`}
              </Typography>
              <TableContainer sx={{ maxHeight: 'calc(100vh - 380px)' }}>
                <Table stickyHeader size="small" sx={{ borderCollapse: 'collapse' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ ...head, width: 44 }} padding="checkbox">
                        <Checkbox size="small" checked={allTicked} disabled={!available.length} onChange={toggleAll} />
                      </TableCell>
                      <TableCell sx={head}>Bill #</TableCell>
                      <TableCell sx={head}>Customer</TableCell>
                      <TableCell sx={{ ...head, textAlign: 'right' }}>Amount</TableCell>
                      <TableCell sx={{ ...head, textAlign: 'right' }}>Number of cases</TableCell>
                      <TableCell sx={head}>Transporter</TableCell>
                      <TableCell sx={head}>Transporter Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {available.map((b) => {
                      const on = selected.has(billKey(b));
                      return (
                        <TableRow key={billKey(b)} hover onClick={() => toggle(b)} sx={{ cursor: 'pointer', bgcolor: on ? '#eef2fd' : 'inherit' }}>
                          <TableCell sx={cell} padding="checkbox"><Checkbox size="small" checked={on} /></TableCell>
                          <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>{b.smc_no}</TableCell>
                          <TableCell sx={cell}>
                            {b.cuc_desc}
                            {b.route_order == null && <Chip size="small" label="Not on route" sx={{ ml: 1, height: 20 }} />}
                          </TableCell>
                          <TableCell sx={num}>{money(b.net_amount)}</TableCell>
                          <TableCell sx={num}>{b.pack_qty}</TableCell>
                          <TableCell sx={cell}>{b.tpc_desc}</TableCell>
                          <TableCell sx={cell}>{b.transporter_type}</TableCell>
                        </TableRow>
                      );
                    })}
                    {!available.length && !loadingBills && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ ...cell, color: '#888' }}>
                          No bills found. Try All transport or All customers.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        )}
      </Box>
      {confirmDialog}
      <Snackbar open={Boolean(notice)} autoHideDuration={3000} onClose={() => setNotice('')} message={notice} />
    </Box>
  );
}
