import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Table, TableBody,
  TableCell, TableContainer, TableFooter, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import {
  CheckCircle, KeyboardArrowDown, KeyboardArrowRight, LocationOff, LocationOn, SubdirectoryArrowRight, TaskAlt, UnfoldLess, UnfoldMore,
} from '@mui/icons-material';
import api, { errorMessage } from '../../api';
import { arrange, billKey, byCustomer, savedOrder } from './sheetGroups';

const BORDER = '1px solid #d5d8e0';
const cell = { border: BORDER, px: 1.5, py: 0.75, fontSize: 14 };
const head = { ...cell, fontWeight: 700, bgcolor: '#f5f6fa', color: '#111' };
const num = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };
const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const showDate = (d) => (d ? d.split('-').reverse().join('-') : '');
const showDateTime = (d) => (d ? `${showDate(d.slice(0, 10))} ${d.slice(11)}` : '');

// The trip sheet's customers and their bills, as on Trip Sheet - Bill Details (view only), with the deliveries
// the driver has scanned. sheet: the Trip Sheet list row, or null
export default function TripSheetCustomersDialog({ sheet, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    if (!sheet) return;
    setData(null);
    setError('');
    setExpanded(new Set());
    api.get(`/trip-sheet-bills/${sheet.code}`)
      .then(({ data: d }) => setData(d))
      .catch((err) => setError(errorMessage(err)));
  }, [sheet]);

  const groups = data ? arrange(byCustomer(data.bills), savedOrder(data.bills)) : [];
  const deliveries = data?.deliveries || {};
  const contacts = data?.customers || {};
  const totals = groups.reduce((t, g) => ({ bills: t.bills + g.bills.length, cases: t.cases + g.cases, amount: t.amount + g.amount }),
    { bills: 0, cases: 0, amount: 0 });
  const delivered = groups.filter((g) => deliveries[g.key]).length;
  const allExpanded = groups.length > 0 && groups.every((g) => expanded.has(g.key));
  const toggle = (key) => setExpanded((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <Dialog open={Boolean(sheet)} onClose={onClose} maxWidth="lg" fullWidth>
      {sheet && (
        <>
          <DialogTitle sx={{ pb: 1 }}>
            {sheet.tsc_no} · {sheet.route_name}
            <Typography variant="body2" color="text.secondary">
              Driver {sheet.driver_name} · Loading {showDate(sheet.loading_date)} · {sheet.status}
            </Typography>
          </DialogTitle>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
            {!data && !error && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>}
            {data && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                  <Typography variant="body2" sx={{ mr: 'auto' }}>
                    <b>{groups.length}</b> customers · <b>{totals.bills}</b> bills · <b>{totals.cases}</b> cases · ₹ <b>{money(totals.amount)}</b>
                    {' '}· <b>{delivered}</b> of {groups.length} delivered
                  </Typography>
                  {data.sheet.bills_completed_at && (
                    <Chip size="small" color="success" icon={<TaskAlt />} label={`Bills complete ${showDateTime(data.sheet.bills_completed_at)}`} />
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
                <TableContainer sx={{ maxHeight: '62vh' }}>
                  <Table stickyHeader size="small" sx={{ borderCollapse: 'collapse' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ ...head, width: 44 }}>#</TableCell>
                        <TableCell sx={head}>Customer</TableCell>
                        <TableCell sx={head}>Company - Branch</TableCell>
                        <TableCell sx={head}>Place</TableCell>
                        <TableCell sx={head}>Mobile</TableCell>
                        <TableCell sx={{ ...head, textAlign: 'right' }}>Number of cases</TableCell>
                        <TableCell sx={{ ...head, textAlign: 'right' }}>Number of bills</TableCell>
                        <TableCell sx={head}>Delivery</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {groups.map((g, i) => {
                        const open = expanded.has(g.key);
                        const d = deliveries[g.key];
                        return [
                          <TableRow key={g.key} hover sx={{ bgcolor: '#f8f9fc' }}>
                            <TableCell sx={{ ...cell, textAlign: 'center' }}>{i + 1}</TableCell>
                            <TableCell sx={{ ...cell, fontWeight: 700 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => toggle(g.key)} aria-label={open ? 'hide bills' : 'show bills'}>
                                  {open ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
                                </IconButton>
                                {g.name}
                                {!g.onRoute && <Chip size="small" label="Not on route" sx={{ ml: 0.5, height: 20, fontWeight: 400 }} />}
                              </Box>
                            </TableCell>
                            <TableCell sx={cell}>{g.company_branch}</TableCell>
                            <TableCell sx={cell}>{g.place}</TableCell>
                            <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>{contacts[g.key]?.mobile || ''}</TableCell>
                            <TableCell sx={{ ...num, fontWeight: 700 }}>{g.cases}</TableCell>
                            <TableCell sx={{ ...num, fontWeight: 700 }}>{g.bills.length}</TableCell>
                            <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>
                              {d ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Tooltip title={`${d.method === 'Manual' ? 'Marked without scanning' : 'QR scanned'} by ${d.driver_name || 'the driver'}`}>
                                    <Chip size="small" color="success" icon={<CheckCircle />} label={`${showDateTime(d.delivered_at)}${d.method === 'Manual' ? ' · manual' : ''}`} sx={{ height: 22 }} />
                                  </Tooltip>
                                  {d.latitude != null ? (
                                    <Tooltip title={`Show on map (accurate to about ${d.accuracy_m ?? '?'} m)`}>
                                      <IconButton
                                        size="small" component="a" target="_blank" rel="noopener noreferrer" sx={{ p: 0.25, color: '#c62828' }}
                                        href={`https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`}
                                        aria-label="show delivery location on map"
                                      >
                                        <LocationOn fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  ) : (
                                    <Tooltip title="No location was sent with this delivery">
                                      <LocationOff fontSize="small" sx={{ color: '#b0b4bd' }} />
                                    </Tooltip>
                                  )}
                                </Box>
                              ) : <Box component="span" sx={{ color: '#999' }}>Pending</Box>}
                            </TableCell>
                          </TableRow>,
                          ...(open ? g.bills.map((b) => (
                            <TableRow key={billKey(b)}>
                              <TableCell sx={cell} />
                              <TableCell sx={{ ...cell, pl: 5 }} colSpan={4}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                  <SubdirectoryArrowRight fontSize="small" sx={{ color: '#9aa0ab' }} />
                                  <b>{b.smc_no}</b>
                                  <Box component="span" sx={{ color: '#666', fontSize: 13 }}>{showDate(b.bill_date)}</Box>
                                  {b.cuc_desc !== g.name && <Box component="span" sx={{ fontSize: 13 }}>· {b.cuc_desc}</Box>}
                                  <Box component="span" sx={{ color: '#666', fontSize: 13 }}>({b.company_branch})</Box>
                                  {b.eway_billno && <Box component="span" sx={{ color: '#666', fontSize: 13 }}>E-way {b.eway_billno}</Box>}
                                  <Box component="span" sx={{ ml: 'auto', color: '#444' }}>{b.net_amount == null ? '—' : `₹ ${money(b.net_amount)}`}</Box>
                                </Box>
                              </TableCell>
                              <TableCell sx={num}>{b.pack_qty}</TableCell>
                              <TableCell sx={num}>1</TableCell>
                              <TableCell sx={cell} />
                            </TableRow>
                          )) : []),
                        ];
                      })}
                      {!groups.length && (
                        <TableRow>
                          <TableCell colSpan={8} align="center" sx={{ ...cell, color: '#888' }}>
                            No bills on this trip sheet yet. Add them in Trip Sheet - Bill Details.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    {groups.length > 0 && (
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={5} sx={{ ...head, position: 'sticky', bottom: 0 }}>Total (amount ₹ {money(totals.amount)})</TableCell>
                          <TableCell sx={{ ...head, ...num, fontWeight: 700, position: 'sticky', bottom: 0 }}>{totals.cases}</TableCell>
                          <TableCell sx={{ ...head, ...num, fontWeight: 700, position: 'sticky', bottom: 0 }}>{totals.bills}</TableCell>
                          <TableCell sx={{ ...head, position: 'sticky', bottom: 0 }} />
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </TableContainer>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Close</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
