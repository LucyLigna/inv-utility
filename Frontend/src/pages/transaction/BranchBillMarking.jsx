import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Backdrop, Box, Checkbox, CircularProgress, MenuItem, Paper, Snackbar, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { LockOutlined, Refresh, Save } from '@mui/icons-material';
import ActionBar from '../../components/ActionBar';
import { useConfirm } from '../../components/ConfirmDialog';
import api, { errorMessage } from '../../api';

const BORDER = '1px solid #d5d8e0';
const cell = { border: BORDER, px: 1.25, py: 0.5, fontSize: 14 };
const head = { ...cell, fontWeight: 700, bgcolor: '#f5f6fa', color: '#111', py: 0.75 };
const num = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };
const dateSx = { width: 165 };

const billKey = (b) => `${b.company_code}|${b.ba_code}|${b.sm_slno}`;
const branchKey = (b) => `${b.company_code}|${b.ba_code}`;
const money = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const showDate = (d) => (d ? d.split('-').reverse().join('-') : '');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Branch Wise Bill Marking: the bills of one of the user's branches for a bill date range. Tick a bill to put it on
// a trip sheet (the sheet of the customer's route in Trip Route Wise Customers is filled in); untick to take it off.
// The right side shows the marking: trip sheet > customer > bills. Save writes it to the trip sheets.
export default function BranchBillMarking() {
  const [branches, setBranches] = useState(null);
  const [branch, setBranch] = useState('');
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [search, setSearch] = useState('');
  const [bills, setBills] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [marks, setMarks] = useState({}); // bill key -> ts_code or null (what is on screen)
  const [saved, setSaved] = useState({}); // bill key -> ts_code or null (what is stored)
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [confirm, confirmDialog] = useConfirm();

  const run = async (message, work) => {
    setBusy(message);
    try {
      return await work();
    } finally {
      setBusy('');
    }
  };

  // The user's branches; the first is chosen
  useEffect(() => {
    api.get('/branch-bills/branches')
      .then(({ data }) => {
        setBranches(data);
        if (data.length) setBranch(branchKey(data[0]));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  // Bills and trip sheets of the branch and dates
  useEffect(() => {
    if (!branch || !fromDate || !toDate) return;
    const [company_code, ba_code] = branch.split('|');
    run('Loading the bills…', async () => {
      try {
        const [b, s] = await Promise.all([
          api.get('/branch-bills/bills', { params: { company_code, ba_code, from: fromDate, to: toDate } }),
          api.get('/branch-bills/sheets', { params: { company_code, ba_code } }),
        ]);
        const stored = Object.fromEntries(b.data.map((x) => [billKey(x), x.sheet_code || null]));
        setBills(b.data);
        setSheets(s.data);
        setSaved(stored);
        setMarks(stored);
        setError('');
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }, [branch, fromDate, toDate, reloadKey]);

  const changes = bills.filter((b) => (marks[billKey(b)] ?? null) !== (saved[billKey(b)] ?? null));
  const dirty = changes.length > 0;

  // Changing the branch or dates drops unsaved marking: ask first
  const guard = (apply) => async (value) => {
    if (dirty && !(await confirm({
      title: 'Discard unsaved marking?',
      message: `${changes.length} bill${changes.length > 1 ? 's are' : ' is'} marked but not saved. They will be lost.`,
      cancelLabel: 'Keep them',
      confirmLabel: 'Discard',
    }))) return;
    apply(value);
  };

  const sheetByCode = useMemo(() => new Map(sheets.map((s) => [s.code, s])), [sheets]);
  const sheetName = (code, b) => {
    const s = sheetByCode.get(code);
    if (s) return `${s.tsc_no} · ${s.route_name}`;
    return b && b.sheet_code === code ? `${b.sheet_no}` : `Sheet ${code}`;
  };

  // Ticking: the sheet of the customer's route (if it can take bills of this branch), else the user picks one
  const tick = (b, on) => setMarks((m) => {
    if (!on) return { ...m, [billKey(b)]: null };
    const suggested = b.suggested.find((code) => sheetByCode.has(code));
    return { ...m, [billKey(b)]: suggested || (b.sheet_code && sheetByCode.has(b.sheet_code) ? b.sheet_code : '') };
  });
  const pickSheet = (b, code) => setMarks((m) => ({ ...m, [billKey(b)]: code === '' ? '' : Number(code) }));

  const shown = bills.filter((b) => {
    const q = search.trim().toLowerCase();
    return !q || String(b.smc_no).toLowerCase().includes(q) || String(b.cuc_desc).toLowerCase().includes(q);
  });
  const selectable = shown.filter((b) => !b.locked);
  const allTicked = selectable.length > 0 && selectable.every((b) => marks[billKey(b)] != null);

  const save = async () => {
    const missing = changes.filter((b) => marks[billKey(b)] === '');
    if (missing.length) {
      setError(`Choose the trip sheet for bill ${missing.map((b) => b.smc_no).slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
      return;
    }
    try {
      const { data } = await run('Saving…', () => api.post('/branch-bills/save', {
        changes: changes.map((b) => ({ company_code: b.company_code, ba_code: b.ba_code, sm_slno: b.sm_slno, ts_code: marks[billKey(b)] || null })),
      }));
      setNotice(`Saved: ${data.added} bill${data.added === 1 ? '' : 's'} put on, ${data.removed} taken off (${data.sheets.join(', ')})`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // Right side: what is marked now, by trip sheet and customer
  const tree = useMemo(() => {
    const bySheet = new Map();
    bills.forEach((b) => {
      const code = marks[billKey(b)];
      if (code == null || code === '') return;
      if (!bySheet.has(code)) bySheet.set(code, { code, customers: new Map(), bills: 0, cases: 0, amount: 0 });
      const s = bySheet.get(code);
      const ck = `${b.company_code}|${b.cu_code}`;
      if (!s.customers.has(ck)) s.customers.set(ck, { name: b.cuc_desc, place: b.cuc_place, bills: [] });
      s.customers.get(ck).bills.push(b);
      s.bills += 1;
      s.cases += Number(b.pack_qty) || 0;
      s.amount += Number(b.net_amount) || 0;
    });
    return [...bySheet.values()];
  }, [bills, marks]);

  if (branches && !branches.length) {
    return (
      <Box sx={{ p: 2.5 }}>
        <Typography variant="h5" mb={2}>Branch Wise Bill Marking</Typography>
        <Alert severity="info">No branch is given to you. Ask an administrator to select your branches in Users.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <ActionBar
        left={[
          { label: busy === 'Saving…' ? 'Saving…' : 'Save', icon: <Save />, onClick: save, disabled: !dirty || Boolean(busy) },
          { label: 'Refresh', icon: <Refresh />, onClick: guard(() => setReloadKey((k) => k + 1)), disabled: !branch || Boolean(busy) },
        ]}
      />
      <Box sx={{ p: 2.5 }}>
        <Typography variant="h5" mb={2}>Branch Wise Bill Marking</Typography>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            type="date" size="small" label="From date" value={fromDate} sx={dateSx} InputLabelProps={{ shrink: true }}
            onChange={(e) => guard(setFromDate)(e.target.value)}
          />
          <TextField
            type="date" size="small" label="To date" value={toDate} sx={dateSx} InputLabelProps={{ shrink: true }}
            onChange={(e) => guard(setToDate)(e.target.value)}
          />
          <TextField select size="small" label="Branch" value={branch} sx={{ minWidth: 300 }} onChange={(e) => guard(setBranch)(e.target.value)}>
            {(branches || []).map((b) => (
              <MenuItem key={branchKey(b)} value={branchKey(b)}>{b.company_branch} ({b.company_branch_code})</MenuItem>
            ))}
          </TextField>
          <TextField size="small" placeholder="Bill no or customer" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
          <Typography variant="body2" color="text.secondary">
            {bills.length} bills{dirty && <Box component="span" sx={{ color: '#c77700', fontWeight: 600 }}> · {changes.length} not saved</Box>}
          </Typography>
        </Paper>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '7fr 4fr' }, gap: 2.5, alignItems: 'start' }}>
          {/* Left: the branch's bills */}
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)' }}>
              <Table stickyHeader size="small" sx={{ borderCollapse: 'collapse' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={head}>Bill #</TableCell>
                    <TableCell sx={head}>Customer</TableCell>
                    <TableCell sx={{ ...head, textAlign: 'right' }}>Amount</TableCell>
                    <TableCell sx={{ ...head, textAlign: 'right' }}>Number of cases</TableCell>
                    <TableCell sx={head}>Transporter</TableCell>
                    <TableCell sx={{ ...head, textAlign: 'center', width: 70 }} padding="checkbox">
                      <Tooltip title={allTicked ? 'Untick all shown' : 'Tick all shown'}>
                        <Checkbox
                          size="small" checked={allTicked} disabled={!selectable.length}
                          indeterminate={!allTicked && selectable.some((b) => marks[billKey(b)] != null)}
                          onChange={(e) => selectable.forEach((b) => tick(b, e.target.checked))}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ ...head, minWidth: 220 }}>Trip Sheet</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((b) => {
                    const k = billKey(b);
                    const code = marks[k];
                    const on = code != null;
                    const changed = (code ?? null) !== (saved[k] ?? null);
                    return (
                      <TableRow key={k} hover sx={{ bgcolor: changed ? '#fff8e1' : undefined }}>
                        <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>
                          <b>{b.smc_no}</b>
                          <Box sx={{ color: '#777', fontSize: 12 }}>{showDate(b.bill_date)}{b.is_manual ? ' · manual' : ''}</Box>
                        </TableCell>
                        <TableCell sx={cell}>
                          {b.cuc_desc}
                          {b.cuc_place && <Box sx={{ color: '#777', fontSize: 12 }}>{b.cuc_place}</Box>}
                        </TableCell>
                        <TableCell sx={num}>{money(b.net_amount)}</TableCell>
                        <TableCell sx={num}>{b.pack_qty}</TableCell>
                        <TableCell sx={cell}>
                          {b.tpc_desc}
                          {b.transporter_type && <Box sx={{ color: '#777', fontSize: 12 }}>{b.transporter_type}</Box>}
                        </TableCell>
                        <TableCell sx={{ ...cell, textAlign: 'center' }} padding="checkbox">
                          {b.locked ? (
                            <Tooltip title={`On ${b.sheet_no}, which is ${b.sheet_status === 'Active' ? 'bills-complete' : b.sheet_status.toLowerCase()}: it can't be changed here`}>
                              <LockOutlined fontSize="small" sx={{ color: '#9aa0ab' }} />
                            </Tooltip>
                          ) : (
                            <Checkbox size="small" checked={on} onChange={(e) => tick(b, e.target.checked)} />
                          )}
                        </TableCell>
                        <TableCell sx={cell}>
                          {b.locked ? (
                            <Typography variant="body2">{b.sheet_no}</Typography>
                          ) : on ? (
                            <TextField
                              select size="small" fullWidth value={code} onChange={(e) => pickSheet(b, e.target.value)}
                              error={code === ''} placeholder="Choose"
                              SelectProps={{ displayEmpty: true }}
                            >
                              <MenuItem value="" disabled><em>Choose the trip sheet</em></MenuItem>
                              {sheets.map((s) => (
                                <MenuItem key={s.code} value={s.code}>
                                  {s.tsc_no} · {s.route_name}{b.suggested.includes(s.code) ? ' ★' : ''}
                                </MenuItem>
                              ))}
                              {/* its current sheet, if it isn't one that can take bills now (kept so it shows) */}
                              {code && !sheetByCode.has(code) && <MenuItem value={code}>{sheetName(code, b)}</MenuItem>}
                            </TextField>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!shown.length && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ ...cell, color: '#888', py: 2 }}>
                        {busy ? 'Loading…' : 'No bills for this branch and these dates.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              ★ the trip sheet of a route the customer is on in Trip Route Wise Customers (filled in when you tick the bill).
            </Typography>
          </Paper>

          {/* Right: what is marked, by trip sheet and customer */}
          <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Trip sheets</Typography>
            {!tree.length && <Typography variant="body2" color="text.secondary">Tick bills on the left to put them on a trip sheet.</Typography>}
            {tree.map((s) => (
              <Box key={s.code} sx={{ mb: 2 }}>
                <Box sx={{ bgcolor: '#e8eefb', px: 1.25, py: 0.75, borderRadius: 1, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <b>{sheetName(s.code, bills.find((b) => b.sheet_code === s.code))}</b>
                  <Box component="span" sx={{ fontSize: 13, color: '#444', whiteSpace: 'nowrap' }}>{s.bills} bills · {s.cases} cases</Box>
                </Box>
                {[...s.customers.values()].map((c) => (
                  <Box key={c.name + c.place} sx={{ pl: 1.5, mt: 0.75 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                      {c.name}{c.place && <Box component="span" sx={{ color: '#777', fontWeight: 400 }}> · {c.place}</Box>}
                    </Typography>
                    <Table size="small" sx={{ borderCollapse: 'collapse', mt: 0.25 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ ...head, py: 0.25, fontSize: 12 }}>Bill #</TableCell>
                          <TableCell sx={{ ...head, py: 0.25, fontSize: 12, textAlign: 'right' }}>Amount</TableCell>
                          <TableCell sx={{ ...head, py: 0.25, fontSize: 12, textAlign: 'right' }}>Number of cases</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {c.bills.map((b) => (
                          <TableRow key={billKey(b)} sx={{ bgcolor: (marks[billKey(b)] ?? null) !== (saved[billKey(b)] ?? null) ? '#fff8e1' : undefined }}>
                            <TableCell sx={{ ...cell, py: 0.25, fontSize: 13 }}>{b.smc_no}</TableCell>
                            <TableCell sx={{ ...num, py: 0.25, fontSize: 13 }}>{money(b.net_amount)}</TableCell>
                            <TableCell sx={{ ...num, py: 0.25, fontSize: 13 }}>{b.pack_qty}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                ))}
              </Box>
            ))}
          </Paper>
        </Box>
      </Box>
      {confirmDialog}
      <Backdrop open={Boolean(busy)} sx={{ zIndex: (theme) => theme.zIndex.modal + 1, color: '#fff', flexDirection: 'column', gap: 2 }}>
        <CircularProgress color="inherit" />
        <Typography sx={{ fontWeight: 600 }}>{busy}</Typography>
      </Backdrop>
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice('')} message={notice} />
    </Box>
  );
}
