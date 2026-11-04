import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, IconButton, ListItemText, Menu, MenuItem, Paper, Snackbar, Table, TableBody, TableCell, TableContainer,
  TableFooter, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import {
  AddCircleOutline, AddLocationAlt, CheckCircle, LockOpenOutlined, TaskAlt, CloudDownload, DeleteOutline, Download, Print, DragIndicator, KeyboardArrowDown, KeyboardArrowRight, LocationOff, LocationOn, PlayArrow, PlaylistAdd, Refresh,
  Save, Sort, SubdirectoryArrowRight, UnfoldLess, UnfoldMore,
} from '@mui/icons-material';
import ActionBar from '../../components/ActionBar';
import { useConfirm } from '../../components/ConfirmDialog';
import TripSheetPrint, { exportSummaryExcel } from './TripSheetPrint';
import MapToRouteDialog from './MapToRouteDialog';
import { arrange, billKey, byCustomer, savedOrder } from './sheetGroups';
import { useAuth } from '../../auth';
import api, { errorMessage } from '../../api';

const BORDER = '1px solid #d5d8e0';
const cell = { border: BORDER, px: 1.5, py: 0.75, fontSize: 14 };
const head = { ...cell, fontWeight: 700, bgcolor: '#f5f6fa', color: '#111' };
const num = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };
const dateSx = { width: 160, '& input': { py: 1 } };

const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const showDate = (d) => (d ? d.split('-').reverse().join('-') : '');
const sheetLabel = (s) => `${s.tsc_no} · ${s.route_name} · ${showDate(s.loading_date)} (${(s.loading_day || '').slice(0, 3)})`;
// What would be saved (bills in delivery order), as a string, to tell whether anything changed
const snapshot = (selected, customOrder) => JSON.stringify(
  arrange(byCustomer([...selected.values()]), customOrder).flatMap((g) => g.bills.map(billKey))
);

export default function TripSheetBills() {
  const [sheets, setSheets] = useState([]);
  const [picked, setPicked] = useState(null); // sheet chosen in the box
  const [sheet, setSheet] = useState(null); // sheet loaded by Process
  const [selected, setSelected] = useState(new Map()); // bill key -> bill
  const [savedKey, setSavedKey] = useState('');
  const [expanded, setExpanded] = useState(new Set()); // customer groups whose bills are shown; none by default
  const [customOrder, setCustomOrder] = useState(null); // group keys in the user's order; null = route order
  const [dragKey, setDragKey] = useState(null);
  const [customers, setCustomers] = useState('route'); // route | all
  const [transport, setTransport] = useState('own'); // own | all
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [available, setAvailable] = useState([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to reload the bills list
  const [printMenu, setPrintMenu] = useState(null); // element the print-format menu opens from
  const [printFormat, setPrintFormat] = useState('branch');
  const [contacts, setContacts] = useState({}); // mobile and sales executive per customer, for printing
  const [qr, setQr] = useState({}); // delivery QR per customer, for the customer-wise print
  const [deliveries, setDeliveries] = useState({}); // customers the driver has scanned as delivered
  const [confirm, confirmDialog] = useConfirm();
  const [mapping, setMapping] = useState(null); // customer being mapped to the route
  const { user } = useAuth();
  // Mapping changes Trip Route Wise Customers, so it needs the right to that screen
  const canMap = user.isAdmin || user.programs.includes('P0201');

  const openMap = (bill, name) => setMapping({
    company_code: bill.company_code, ba_code: bill.ba_code, cu_code: bill.cu_code, name, company_branch: bill.company_branch,
  });

  // After mapping, the customer's bills now belong to the route (possibly under a main customer):
  // regroup the ticked bills and reload the bills list, keeping any unsaved ticks
  const afterMapped = async (message) => {
    setMapping(null);
    setNotice(message);
    try {
      const keys = [...selected.keys()];
      if (keys.length) {
        const { data } = await api.get(`/trip-sheet-bills/${sheet.code}/describe`, { params: { keys: keys.join(',') } });
        setSelected((m) => {
          const next = new Map(m);
          data.forEach((b) => { if (next.has(billKey(b))) next.set(billKey(b), b); });
          return next;
        });
      }
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const loadSheets = () => api.get('/trip-sheet-bills/sheets')
    .then(({ data }) => setSheets(data))
    .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    loadSheets();
  }, []);

  const dirty = Boolean(sheet) && snapshot(selected, customOrder) !== savedKey;
  // Bills marked complete: the sheet's bills can only be viewed, printed and exported
  const complete = Boolean(sheet?.bills_completed_at);

  const process = async (s = picked) => {
    if (!s) return;
    if (dirty && !(await confirm({
      message: "Any bills you've added or removed on this trip sheet will be lost. This can't be undone.",
      cancelLabel: 'Keep editing',
      confirmLabel: 'Discard',
    }))) return;
    try {
      const { data } = await api.get(`/trip-sheet-bills/${s.code}`);
      const map = new Map(data.bills.map((b) => [billKey(b), b]));
      // Bills come in their saved order; keep the customers in that order if it was saved
      const order = savedOrder(data.bills);
      setSheet(data.sheet);
      setDeliveries(data.deliveries || {});
      setSelected(map);
      setCustomOrder(order);
      setSavedKey(snapshot(map, order));
      setExpanded(new Set());
      // Bill dates default to the sheet's loading date
      setFromDate(data.sheet.loading_date || '');
      setToDate(data.sheet.loading_date || '');
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // Bills that can be added, reloaded when the sheet or a filter changes
  useEffect(() => {
    if (!sheet) return undefined;
    const timer = setTimeout(async () => {
      setLoadingBills(true);
      try {
        const { data } = await api.get(`/trip-sheet-bills/${sheet.code}/available`, {
          params: { customers, transport, search, from: fromDate, to: toDate },
        });
        setAvailable(data);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoadingBills(false);
      }
    }, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [sheet, customers, transport, search, fromDate, toDate, reloadKey]);

  // Runs the customer and salesdetails syncs now (instead of waiting for the half-hourly schedule),
  // then reloads the bills list
  const getLatestBills = async () => {
    setSyncing(true);
    setError('');
    const summary = [];
    try {
      for (const [job, label] of [['customer', 'customers'], ['salesdetails', 'bills']]) {
        const { data } = await api.post(`/sync/${job}/run`);
        if (data.skipped) summary.push(`${label}: already being fetched by the scheduler`);
        else if (data.status === 'Failed') summary.push(`${label}: failed (${data.message || 'see the sync log'})`);
        else summary.push(`${data.saved} ${label} received`);
      }
      setNotice(`Latest data fetched: ${summary.join(', ')}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(`Could not fetch the latest bills: ${errorMessage(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  // Bills already on this sheet are shown on the left only
  const pickable = available.filter((b) => !selected.has(billKey(b)));

  const addBills = (bills) => setSelected((m) => {
    const next = new Map(m);
    bills.forEach((b) => next.set(billKey(b), b));
    return next;
  });
  const removeBills = (bills) => setSelected((m) => {
    const next = new Map(m);
    bills.forEach((b) => next.delete(billKey(b)));
    return next;
  });

  const save = async () => {
    try {
      const bills = groups.flatMap((g) => g.bills).map(({ company_code, ba_code, sm_slno }) => ({ company_code, ba_code, sm_slno }));
      const { data } = await api.put(`/trip-sheet-bills/${sheet.code}`, { bills });
      setSavedKey(snapshot(selected, customOrder));
      setSheet({ ...sheet, total_bills: data.total_bills, total_pack_qty: data.total_pack_qty });
      setNotice(`Saved ${data.total_bills} bills (${data.total_pack_qty} cases) on ${sheet.tsc_no}`);
      loadSheets();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  // Mark complete: no bill can be added or removed afterwards. Unsaved changes are saved first.
  const markComplete = async () => {
    const ok = await confirm({
      title: `Mark ${sheet.tsc_no} complete?`,
      message: `${dirty ? 'Your changes will be saved first. ' : ''}After this, no bill can be added to or removed from this trip sheet. Printing, export and delivery scanning carry on as before.`,
      cancelLabel: 'Not yet',
      confirmLabel: 'Mark complete',
    });
    if (!ok || (dirty && !(await save()))) return;
    try {
      const { data } = await api.post(`/trip-sheet-bills/${sheet.code}/complete`);
      setSheet(data.sheet);
      setNotice(`${sheet.tsc_no} marked complete`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // Administrators can undo "complete" so the bills can be changed again
  const reopenBills = async () => {
    const ok = await confirm({
      title: `Reopen the bills of ${sheet.tsc_no}?`,
      message: 'Bills can then be added and removed again, until the sheet is marked complete again.',
      cancelLabel: 'Keep complete',
      confirmLabel: 'Reopen bills',
    });
    if (!ok) return;
    try {
      const { data } = await api.post(`/trip-sheet-bills/${sheet.code}/reopen-bills`);
      setSheet(data.sheet);
      setNotice(`Bills of ${sheet.tsc_no} reopened`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // Prints the sheet as on screen; unsaved changes are saved first so the paper matches what is stored
  // format: 'branch' (cases per company - branch) | 'customer' (each customer's bills, with mobile and sales executive)
  const print = async (format) => {
    setPrintMenu(null);
    if (dirty) {
      const ok = await confirm({
        title: 'Save before printing?',
        message: 'This trip sheet has changes that are not saved yet. They will be saved, then the sheet is printed.',
        cancelLabel: 'Cancel',
        confirmLabel: 'Save and print',
      });
      if (!ok || !(await save())) return;
    }
    if (format === 'customer') {
      try {
        const { data } = await api.get(`/trip-sheet-bills/${sheet.code}`);
        setContacts(data.customers || {});
        // qrcode is a CommonJS package: its functions come on the default export
        const qrcode = await import('qrcode');
        const { toDataURL } = qrcode.default || qrcode;
        const images = await Promise.all(Object.entries(data.codes || {}).map(async ([key, c]) => (
          [key, { code: c.code, image: await toDataURL(c.qr, { margin: 0, width: 240, errorCorrectionLevel: 'M' }) }]
        )));
        setQr(Object.fromEntries(images));
      } catch (err) {
        setError(errorMessage(err));
        return;
      }
    }
    setPrintFormat(format);
    setTimeout(() => window.print(), 150); // after the chosen layout has rendered
  };

  // Downloads the customer summary (cases per customer and company - branch) as Excel; saves changes first
  const exportExcel = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Save before exporting?',
        message: 'This trip sheet has changes that are not saved yet. They will be saved, then the summary is exported.',
        cancelLabel: 'Cancel',
        confirmLabel: 'Save and export',
      });
      if (!ok || !(await save())) return;
    }
    try {
      await exportSummaryExcel(sheet, groups);
    } catch (err) {
      setError(`Could not export: ${errorMessage(err)}`);
    }
  };

  const routeSorted = byCustomer([...selected.values()]);
  const groups = arrange(routeSorted, customOrder);
  const inRouteOrder = groups.every((g, i) => g.key === routeSorted[i].key);

  // Drop a customer row on another: it takes that row's place
  const moveGroup = (fromKey, toKey) => {
    if (!fromKey || fromKey === toKey) return;
    const keys = groups.map((g) => g.key);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    setCustomOrder(keys);
  };
  const totals = groups.reduce((t, g) => ({ bills: t.bills + g.bills.length, cases: t.cases + g.cases, amount: t.amount + g.amount }),
    { bills: 0, cases: 0, amount: 0 });
  const allExpanded = groups.length > 0 && groups.every((g) => expanded.has(g.key));
  const toggleGroup = (key) => setExpanded((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <Box>
      <ActionBar
        left={[
          { label: 'Save', icon: <Save />, onClick: save, disabled: !dirty || complete },
          complete
            ? { label: 'Reopen Bills', icon: <LockOpenOutlined />, onClick: reopenBills, disabled: !user.isAdmin }
            : { label: 'Mark Complete', icon: <TaskAlt />, onClick: markComplete, disabled: !sheet || !groups.length },
          { label: 'Refresh', icon: <Refresh />, onClick: () => process(sheet), disabled: !sheet },
          { label: 'Print', icon: <Print />, onClick: (e) => setPrintMenu(e.currentTarget), disabled: !sheet || !groups.length },
          {
            label: syncing ? 'Getting latest bills…' : 'Get Latest Bills',
            icon: <CloudDownload />,
            onClick: getLatestBills,
            disabled: syncing,
          },
        ]}
        right={[
          { label: 'Export Excel', icon: <Download />, onClick: exportExcel, disabled: !sheet || !groups.length },
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
                  ['Bills', complete ? `Complete ${showDate(sheet.bills_completed_at.slice(0, 10))} ${sheet.bills_completed_at.slice(11)}` : 'Open'],
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
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '6fr 6fr' }, gap: 2.5, alignItems: 'start' }}>
            {/* Left: bills on the sheet, under their (main) customer */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>
                  Selected Customer ({groups.length})
                  {dirty && <Box component="span" sx={{ color: '#c77700', fontWeight: 400 }}> · not saved</Box>}
                </Typography>
                <Box>
                  {!inRouteOrder && !complete && (
                    <Tooltip title="Put the customers back in the order of Trip Route Wise Customers">
                      <Button size="small" startIcon={<Sort />} onClick={() => setCustomOrder(null)}>Route order</Button>
                    </Tooltip>
                  )}
                  {groups.length > 0 && (
                    <Button
                      size="small"
                      startIcon={allExpanded ? <UnfoldLess /> : <UnfoldMore />}
                      onClick={() => setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.key)))}
                    >
                      {allExpanded ? 'Hide bills' : 'Show bills'}
                    </Button>
                  )}
                </Box>
              </Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                {complete
                  ? 'Bills are complete: they can be viewed, printed and exported, but not changed.'
                  : inRouteOrder
                    ? 'In the order of Trip Route Wise Customers. Drag the grip on a customer to change the order for this trip sheet.'
                    : 'In your order for this trip sheet. Drag the grip on a customer to change it.'}
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
                      <TableCell sx={{ ...head, width: 44 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groups.map((g) => {
                      const open = expanded.has(g.key);
                      return [
                        <TableRow
                          key={g.key}
                          hover
                          onDragOver={(e) => !complete && e.preventDefault()}
                          onDrop={() => { if (!complete) moveGroup(dragKey, g.key); setDragKey(null); }}
                          sx={{ bgcolor: dragKey === g.key ? '#e3e8f8' : '#f8f9fc' }}
                        >
                          <TableCell sx={{ ...cell, fontWeight: 700 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {!complete && (
                              <Box
                                draggable
                                onDragStart={(e) => { setDragKey(g.key); e.dataTransfer.setDragImage(e.currentTarget.closest('tr'), 20, 20); }}
                                onDragEnd={() => setDragKey(null)}
                                title="Drag to move"
                                sx={{ display: 'flex', cursor: 'grab' }}
                              >
                                <DragIndicator fontSize="small" sx={{ color: '#9aa0ab' }} />
                              </Box>
                              )}
                              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => toggleGroup(g.key)} aria-label={open ? 'hide bills' : 'show bills'}>
                                {open ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
                              </IconButton>
                              {g.name}
                              {!g.onRoute && <Chip size="small" label="Not on route" sx={{ ml: 0.5, height: 20, fontWeight: 400 }} />}
                              {deliveries[g.key] && (
                                <Tooltip title={`Scanned by ${deliveries[g.key].driver_name || 'the driver'}${deliveries[g.key].latitude ? ` at ${deliveries[g.key].latitude}, ${deliveries[g.key].longitude}` : ''}`}>
                                  <Chip
                                    size="small"
                                    color="success"
                                    icon={<CheckCircle />}
                                    label={`Delivered ${showDate(deliveries[g.key].delivered_at.slice(0, 10))} ${deliveries[g.key].delivered_at.slice(11)}`}
                                    sx={{ ml: 0.5, height: 20, fontWeight: 400 }}
                                  />
                                </Tooltip>
                              )}
                              {/* Where the driver scanned the QR, on Google Maps (the phone sends a location only over https) */}
                              {deliveries[g.key] && (deliveries[g.key].latitude != null ? (
                                <Tooltip title={`Show on map (accurate to about ${deliveries[g.key].accuracy_m ?? '?'} m)`}>
                                  <IconButton
                                    size="small"
                                    component="a"
                                    href={`https://www.google.com/maps/search/?api=1&query=${deliveries[g.key].latitude},${deliveries[g.key].longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="show delivery location on map"
                                    sx={{ p: 0.25, color: '#c62828' }}
                                  >
                                    <LocationOn fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Tooltip title="No location: the phone did not send one (location needs the https address, and the driver must allow it)">
                                  <LocationOff fontSize="small" sx={{ color: '#b0b4bd' }} />
                                </Tooltip>
                              ))}
                              {!g.onRoute && canMap && (
                                <Button size="small" startIcon={<AddLocationAlt />} onClick={() => openMap(g.bills[0], g.name)} sx={{ py: 0, minWidth: 0 }}>
                                  Map
                                </Button>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell sx={cell}>{g.company_branch}</TableCell>
                          <TableCell sx={cell}>{g.place}</TableCell>
                          <TableCell sx={{ ...num, fontWeight: 700 }}>{g.cases}</TableCell>
                          <TableCell sx={{ ...num, fontWeight: 700 }}>{g.bills.length}</TableCell>
                          <TableCell sx={{ ...cell, py: 0 }} align="center">
                            {!complete && (
                              <Tooltip title="Remove all bills of this customer">
                                <IconButton size="small" onClick={() => removeBills(g.bills)}><DeleteOutline fontSize="small" /></IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>,
                        ...(open ? g.bills.map((b) => (
                          <TableRow
                            key={billKey(b)}
                            hover
                            onDragOver={(e) => !complete && e.preventDefault()}
                            onDrop={() => { if (!complete) moveGroup(dragKey, g.key); setDragKey(null); }}
                          >
                            <TableCell sx={{ ...cell, pl: 7 }} colSpan={2}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <SubdirectoryArrowRight fontSize="small" sx={{ color: '#9aa0ab' }} />
                                <b>{b.smc_no}</b>
                                <Box component="span" sx={{ color: '#666', fontSize: 13 }}>{showDate(b.bill_date)}</Box>
                                {b.cuc_desc !== g.name && <Box component="span" sx={{ fontSize: 13 }}>· {b.cuc_desc}</Box>}
                                <Box component="span" sx={{ color: '#666', fontSize: 13 }}>({b.company_branch})</Box>
                              </Box>
                            </TableCell>
                            <TableCell sx={{ ...num, color: '#444' }}>₹ {money(b.net_amount)}</TableCell>
                            <TableCell sx={num}>{b.pack_qty}</TableCell>
                            <TableCell sx={num}>1</TableCell>
                            <TableCell sx={{ ...cell, py: 0 }} align="center">
                              {!complete && (
                                <Tooltip title="Remove this bill">
                                  <IconButton size="small" onClick={() => removeBills([b])}><DeleteOutline fontSize="small" /></IconButton>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        )) : []),
                      ];
                    })}
                    {!groups.length && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ ...cell, color: '#888' }}>
                          No bills on this trip sheet yet. Click bills on the right to add them.
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
                        <TableCell sx={{ ...head, position: 'sticky', bottom: 0 }} />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </TableContainer>
            </Paper>

            {/* Right: bills to add; ones already on the sheet are not shown. A completed sheet takes no more bills. */}
            {complete ? (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Alert severity="success" icon={<TaskAlt />}>
                  <b>Bills complete</b> since {showDate(sheet.bills_completed_at.slice(0, 10))} {sheet.bills_completed_at.slice(11)}
                  {sheet.bills_completed_by ? ` (by ${sheet.bills_completed_by})` : ''}. No bill can be added to or removed from this
                  trip sheet.{user.isAdmin ? ' Reopen Bills lets them be changed again.' : ' An administrator can reopen the bills.'}
                </Alert>
              </Paper>
            ) : (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
                <Typography sx={{ fontWeight: 700, mr: 'auto' }}>Bills</Typography>
                <TextField
                  type="date" size="small" label="Bill date from" value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={dateSx}
                />
                <TextField
                  type="date" size="small" label="Bill date to" value={toDate}
                  onChange={(e) => setToDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={dateSx}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
                <ToggleButtonGroup size="small" exclusive value={transport} onChange={(e, v) => v && setTransport(v)}>
                  <ToggleButton value="own">Own</ToggleButton>
                  <ToggleButton value="all">All</ToggleButton>
                </ToggleButtonGroup>
                <ToggleButtonGroup size="small" exclusive value={customers} onChange={(e, v) => v && setCustomers(v)}>
                  <ToggleButton value="route">Route customers</ToggleButton>
                  <ToggleButton value="all">All customers</ToggleButton>
                </ToggleButtonGroup>
                <TextField size="small" placeholder="Bill no or customer" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 160 }} />
                <Button size="small" startIcon={<PlaylistAdd />} disabled={!pickable.length} onClick={() => addBills(pickable)}>
                  Add all
                </Button>
              </Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                {loadingBills ? 'Loading…' : `${pickable.length} bills${transport === 'own' ? ' (own transport)' : ''} for ${
                  customers === 'route' ? 'customers on this route' : "all customers in the route's branches"}. Click a bill to add it.`}
              </Typography>
              <TableContainer sx={{ maxHeight: 'calc(100vh - 420px)' }}>
                <Table stickyHeader size="small" sx={{ borderCollapse: 'collapse' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ ...head, width: 44 }} />
                      <TableCell sx={head}>Bill #</TableCell>
                      <TableCell sx={head}>Customer</TableCell>
                      <TableCell sx={head}>Company - Branch</TableCell>
                      <TableCell sx={{ ...head, textAlign: 'right' }}>Amount</TableCell>
                      <TableCell sx={{ ...head, textAlign: 'right' }}>Number of cases</TableCell>
                      <TableCell sx={head}>Transporter</TableCell>
                      <TableCell sx={head}>Transporter Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pickable.map((b) => (
                      <TableRow key={billKey(b)} hover onClick={() => addBills([b])} sx={{ cursor: 'pointer' }}>
                        <TableCell sx={{ ...cell, py: 0 }} align="center">
                          <AddCircleOutline fontSize="small" sx={{ color: '#1a35b0', verticalAlign: 'middle' }} />
                        </TableCell>
                        <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>{b.smc_no}</TableCell>
                        <TableCell sx={cell}>
                          {b.cuc_desc}
                          {b.route_order == null && <Chip size="small" label="Not on route" sx={{ ml: 1, height: 20 }} />}
                          {b.route_order == null && canMap && (
                            <Button
                              size="small" startIcon={<AddLocationAlt />} sx={{ py: 0, ml: 0.5, minWidth: 0 }}
                              onClick={(e) => { e.stopPropagation(); openMap(b, b.cuc_desc); }}
                            >
                              Map
                            </Button>
                          )}
                        </TableCell>
                        <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>{b.company_branch}</TableCell>
                        <TableCell sx={num}>{money(b.net_amount)}</TableCell>
                        <TableCell sx={num}>{b.pack_qty}</TableCell>
                        <TableCell sx={cell}>{b.tpc_desc}</TableCell>
                        <TableCell sx={cell}>{b.transporter_type}</TableCell>
                      </TableRow>
                    ))}
                    {!pickable.length && !loadingBills && (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ ...cell, color: '#888' }}>
                          No bills to add. Try other dates, All transport or All customers.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
            )}
          </Box>
        )}
      </Box>
      {confirmDialog}
      {sheet && (
        <MapToRouteDialog customer={mapping} tripCode={sheet.trip_code} onClose={() => setMapping(null)} onMapped={afterMapped} />
      )}
      <Menu anchorEl={printMenu} open={Boolean(printMenu)} onClose={() => setPrintMenu(null)}>
        <MenuItem onClick={() => print('branch')}>
          <ListItemText primary="Summary by branch" secondary="Cases per customer and company - branch (landscape)" />
        </MenuItem>
        <MenuItem onClick={() => print('customer')}>
          <ListItemText primary="Customer-wise bills" secondary="Each customer's bills, with mobile and sales executive" />
        </MenuItem>
      </Menu>
      <TripSheetPrint sheet={sheet} groups={groups} format={printFormat} contacts={contacts} qr={qr} />
      <Snackbar open={Boolean(notice)} autoHideDuration={3000} onClose={() => setNotice('')} message={notice} />
    </Box>
  );
}
