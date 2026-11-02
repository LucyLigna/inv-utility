import { useEffect, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Paper, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  DeleteOutline, DragIndicator, KeyboardArrowDown, KeyboardArrowRight, PlayArrow, Refresh, Save,
  SubdirectoryArrowRight, UnfoldLess, UnfoldMore,
} from '@mui/icons-material';
import ActionBar from '../../components/ActionBar';
import api, { errorMessage } from '../../api';

const BLUE = '#1a35b0';
const BORDER = '1px solid #d5d8e0';
const cell = { border: BORDER, px: 1.5, py: 0.75, fontSize: 14 };
const head = { ...cell, fontWeight: 700, bgcolor: '#f5f6fa', color: '#111' };

const keyOf = (c) => `${c.company_code}|${c.ba_code}|${c.cu_code}`;

// Saved rows (Main, Sub, Sub, Main, ...) -> [{ main, subs: [] }]
function toGroups(rows) {
  const groups = [];
  for (const { main_sub: kind, ...c } of rows) {
    if (kind === 'Sub' && groups.length) groups[groups.length - 1].subs.push(c);
    else groups.push({ main: c, subs: [] });
  }
  return groups;
}

// [{ main, subs }] -> rows in save order
const toRows = (groups) => groups.flatMap((g) => [
  { ...g.main, main_sub: 'Main' },
  ...g.subs.map((s) => ({ ...s, main_sub: 'Sub' })),
]);

// What gets saved, as a string, to tell whether anything changed since the last save
const snapshot = (groups) => JSON.stringify(toRows(groups).map((r) => [keyOf(r), r.main_sub, r.remarks || '']));

const move = (list, from, to) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export default function TripRouteCustomers() {
  const [routes, setRoutes] = useState([]);
  const [route, setRoute] = useState(null); // picked in the box
  const [loaded, setLoaded] = useState(null); // { route, branches } after Process
  const [groups, setGroups] = useState([]);
  const [savedKey, setSavedKey] = useState('');
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [expanded, setExpanded] = useState(new Set()); // main customers whose subs are shown
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [related, setRelated] = useState(null); // { customer, match, value, customers, picked: Set }
  const [details, setDetails] = useState(null); // customer shown in the details pop-up
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dragRef = useRef(null);

  useEffect(() => {
    api.get('/trip-routes')
      .then(({ data }) => setRoutes(data.filter((r) => r.status === 'Active')))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const inList = new Set(toRows(groups).map(keyOf));
  const dirty = Boolean(loaded) && snapshot(groups) !== savedKey;

  const confirmDiscard = () => !dirty || window.confirm('Discard the unsaved changes to this route?');

  const process = async (r = route) => {
    if (!r || !confirmDiscard()) return;
    try {
      const { data } = await api.get(`/trip-route-customers/${r.code}`);
      const g = toGroups(data.customers);
      setLoaded({ route: data.route, branches: data.branches });
      setGroups(g);
      setSavedKey(snapshot(g));
      setExpanded(new Set());
      setResults([]);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const save = async () => {
    try {
      const rows = toRows(groups);
      await api.put(`/trip-route-customers/${loaded.route.code}`, {
        customers: rows.map(({ company_code, ba_code, cu_code, main_sub, remarks }) => ({
          company_code, ba_code, cu_code, main_sub, remarks,
        })),
      });
      setSavedKey(snapshot(groups));
      setNotice(`Saved ${rows.length} customers for ${loaded.route.name}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // Search as the user types (after a short pause)
  useEffect(() => {
    if (!loaded || (name.trim().length < 2 && place.trim().length < 2)) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get(`/trip-route-customers/${loaded.route.code}/search`, { params: { name, place } });
        setResults(data);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [name, place, loaded]);

  // Picking a search result: offer customers with the same GST number (or mobile) to add under it
  const pick = async (c) => {
    if (inList.has(keyOf(c))) return;
    try {
      const { data } = await api.get(`/trip-route-customers/${loaded.route.code}/related`, {
        params: { company_code: c.company_code, ba_code: c.ba_code, cu_code: c.cu_code },
      });
      if (!data.customers.length) {
        setGroups((g) => [...g, { main: c, subs: [] }]);
        return;
      }
      setRelated({ customer: c, ...data, picked: new Set() });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const addWithSubs = () => {
    const subs = related.customers.filter((c) => related.picked.has(keyOf(c)));
    setGroups((g) => [...g, { main: related.customer, subs }]);
    setRelated(null);
  };

  const togglePicked = (c) => {
    const picked = new Set(related.picked);
    if (picked.has(keyOf(c))) picked.delete(keyOf(c));
    else picked.add(keyOf(c));
    setRelated({ ...related, picked });
  };

  const showDetails = async (c) => {
    try {
      const { data } = await api.get('/trip-route-customers/customer-details', {
        params: { company_code: c.company_code, ba_code: c.ba_code, cu_code: c.cu_code },
      });
      setDetails(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const removeMain = (gi) => setGroups((g) => g.filter((_, i) => i !== gi));
  const removeSub = (gi, si) => setGroups((g) => g.map((grp, i) => (
    i === gi ? { ...grp, subs: grp.subs.filter((_, j) => j !== si) } : grp
  )));

  // Drag a main customer to move it with its subs; drag a sub to reorder it under the same main
  const onDrop = (gi, si) => {
    const from = dragRef.current;
    dragRef.current = null;
    if (!from) return;
    if (from.si === null && si === null) setGroups((g) => move(g, from.gi, gi));
    if (from.si !== null && si !== null && from.gi === gi) {
      setGroups((g) => g.map((grp, i) => (i === gi ? { ...grp, subs: move(grp.subs, from.si, si) } : grp)));
    }
  };

  // Rows are dropped on; only the grip icon starts a drag, so the remarks box can still be typed in
  const dropProps = (gi, si) => ({
    onDragOver: (e) => e.preventDefault(),
    onDrop: () => onDrop(gi, si),
  });
  const gripProps = (gi, si) => ({
    draggable: true,
    onDragStart: (e) => {
      dragRef.current = { gi, si };
      e.dataTransfer.setDragImage(e.currentTarget.closest('tr'), 20, 20);
    },
  });

  const toggleExpanded = (key) => setExpanded((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const groupsWithSubs = groups.filter((g) => g.subs.length);
  const allExpanded = groupsWithSubs.length > 0 && groupsWithSubs.every((g) => expanded.has(keyOf(g.main)));

  const setRemarks = (gi, remarks) => setGroups((g) => g.map((grp, i) => (
    i === gi ? { ...grp, main: { ...grp.main, remarks } } : grp
  )));

  const selectedRow = (c, gi, si, subCount = 0) => {
    const isSub = si !== null;
    const open = expanded.has(keyOf(c));
    return (
      <TableRow
        key={keyOf(c)}
        hover
        {...dropProps(gi, si)}
        onClick={(e) => { if (!e.target.closest('button, input, [draggable="true"], .MuiChip-root')) showDetails(c); }}
        sx={{ bgcolor: isSub ? '#fafbfe' : 'inherit', cursor: 'pointer' }}
      >
        <TableCell sx={{ ...cell, fontWeight: isSub ? 400 : 700 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: isSub ? 5 : 0 }}>
            <Box {...gripProps(gi, si)} sx={{ display: 'flex', cursor: 'grab' }} title="Drag to move">
              <DragIndicator fontSize="small" sx={{ color: '#9aa0ab' }} />
            </Box>
            {isSub && <SubdirectoryArrowRight fontSize="small" sx={{ color: '#9aa0ab' }} />}
            {!isSub && (
              subCount ? (
                <IconButton size="small" onClick={() => toggleExpanded(keyOf(c))} sx={{ p: 0.25 }}
                  aria-label={open ? 'collapse' : 'expand'}>
                  {open ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
                </IconButton>
              ) : <Box sx={{ width: 24 }} />
            )}
            {c.cuc_desc}
            {!isSub && subCount > 0 && (
              <Chip size="small" label={`+${subCount}`} onClick={() => toggleExpanded(keyOf(c))}
                sx={{ height: 20, ml: 0.5, fontWeight: 600 }} />
            )}
          </Box>
        </TableCell>
        <TableCell sx={cell}>{c.company_branch}</TableCell>
        <TableCell sx={cell}>{c.cuc_place}</TableCell>
        <TableCell sx={{ ...cell, py: 0.25, minWidth: 160 }}>
          {!isSub && (
            <TextField
              variant="standard"
              fullWidth
              placeholder="Add remarks"
              value={c.remarks || ''}
              onChange={(e) => setRemarks(gi, e.target.value)}
              inputProps={{ maxLength: 255 }}
              InputProps={{ disableUnderline: !c.remarks, sx: { fontSize: 14 } }}
            />
          )}
        </TableCell>
        <TableCell sx={{ ...cell, py: 0, width: 48 }} align="center">
          <Tooltip title={isSub ? 'Remove' : 'Remove with its sub customers'}>
            <IconButton size="small" onClick={() => (isSub ? removeSub(gi, si) : removeMain(gi))}>
              <DeleteOutline fontSize="small" />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
    );
  };

  const customerCount = toRows(groups).length;

  return (
    <Box>
      <ActionBar
        left={[
          { label: 'Save', icon: <Save />, onClick: save, disabled: !dirty },
          { label: 'Refresh', icon: <Refresh />, onClick: () => process(loaded?.route), disabled: !loaded },
        ]}
      />
      <Box sx={{ p: 2.5 }}>
        <Typography variant="h5" mb={2}>Trip Route Wise Customers</Typography>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ mb: 2, display: 'flex', alignItems: 'stretch', gap: 2, flexWrap: { xs: 'wrap', lg: 'nowrap' } }}>
        <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <Autocomplete
            options={routes}
            value={route}
            onChange={(e, value) => setRoute(value)}
            getOptionLabel={(r) => `${r.name} (${r.short_code})`}
            isOptionEqualToValue={(a, b) => a.code === b.code}
            sx={{ width: 380 }}
            renderInput={(params) => <TextField {...params} label="Trip Route" placeholder="Select a route" />}
          />
          <Button variant="contained" size="large" startIcon={<PlayArrow />} disabled={!route} onClick={() => process()}>
            Process
          </Button>
        </Paper>
        {/* The processed route's branches, in their own box to the right */}
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 280 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, letterSpacing: 1, color: '#555', textTransform: 'uppercase', mb: 1 }}>
            Branches{loaded ? ` (${loaded.branches.length})` : ''}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {!loaded && <Typography variant="body2" color="text.secondary">Select a route and press Process.</Typography>}
            {loaded && (loaded.branches.length
              ? loaded.branches.map((b) => <Chip key={`${b.company_code}|${b.ba_code}`} size="small" label={b.company_branch} />)
              : <Typography variant="body2" color="error">No branches; add them in the Trip Route master.</Typography>)}
          </Box>
        </Paper>
        </Box>

        {loaded && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
            {/* Left: the route's customers in order */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 700 }}>
                  Selected Customer ({customerCount}){dirty && <Box component="span" sx={{ color: '#c77700', fontWeight: 400 }}> · not saved</Box>}
                </Typography>
                {groupsWithSubs.length > 0 && (
                  <Button
                    size="small"
                    startIcon={allExpanded ? <UnfoldLess /> : <UnfoldMore />}
                    onClick={() => setExpanded(allExpanded ? new Set() : new Set(groupsWithSubs.map((g) => keyOf(g.main))))}
                  >
                    {allExpanded ? 'Collapse all' : 'Expand all'}
                  </Button>
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Drag the grip to change the order; a main customer moves with its sub customers. Click the arrow to show sub customers.
              </Typography>
              <TableContainer sx={{ maxHeight: 'calc(100vh - 330px)' }}>
                <Table stickyHeader size="small" sx={{ borderCollapse: 'collapse' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ ...head, minWidth: 280 }}>Customer</TableCell>
                      <TableCell sx={{ ...head, minWidth: 150 }}>Company - Branch</TableCell>
                      <TableCell sx={head}>Place</TableCell>
                      <TableCell sx={head}>Remarks</TableCell>
                      <TableCell sx={head} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groups.map((g, gi) => [
                      selectedRow(g.main, gi, null, g.subs.length),
                      ...(expanded.has(keyOf(g.main)) ? g.subs.map((s, si) => selectedRow(s, gi, si)) : []),
                    ])}
                    {!groups.length && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ ...cell, color: '#888' }}>
                          No customers yet. Search on the right and click a customer to add it.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* Right: search the route's branches */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Search</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 1.5, mb: 1.5 }}>
                <TextField size="small" label="Enter Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <TextField size="small" label="Place" value={place} onChange={(e) => setPlace(e.target.value)} />
              </Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                {searching ? 'Searching…' : results.length >= 200 ? 'Showing the first 200 matches; type more to narrow down.'
                  : `${results.length} customers. Click one to add it.`}
              </Typography>
              <TableContainer sx={{ maxHeight: 'calc(100vh - 390px)' }}>
                <Table stickyHeader size="small" sx={{ borderCollapse: 'collapse' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={head}>Name</TableCell>
                      <TableCell sx={head}>Place</TableCell>
                      <TableCell sx={head}>Route</TableCell>
                      <TableCell sx={head}>Company - Branch</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.map((c) => {
                      const added = inList.has(keyOf(c));
                      return (
                        <TableRow
                          key={keyOf(c)}
                          hover={!added}
                          onClick={() => pick(c)}
                          sx={{ cursor: added ? 'default' : 'pointer', '& td': { color: added ? '#aaa' : '#333' } }}
                        >
                          <TableCell sx={cell}>
                            {c.cuc_desc}
                            {added && <Chip size="small" label="Added" sx={{ ml: 1, height: 20 }} />}
                          </TableCell>
                          <TableCell sx={cell}>{c.cuc_place}</TableCell>
                          <TableCell sx={cell}>{c.route_name}</TableCell>
                          <TableCell sx={cell}>{c.company_branch}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        )}
      </Box>

      {/* Customers with the same GST number / mobile as the picked one */}
      <Dialog open={Boolean(related)} onClose={() => setRelated(null)} maxWidth="md" fullWidth>
        {related && (
          <>
            <DialogTitle>
              Customers with the same {related.match === 'gst' ? 'GST number' : 'mobile number'} ({related.value})
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" mb={1.5}>
                <b>{related.customer.cuc_desc}</b> ({related.customer.company_branch}) will be added as the main customer.
                Tick the customers to list under it.
              </Typography>
              <Table size="small" sx={{ borderCollapse: 'collapse' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...head, width: 48 }} padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={related.customers.filter((c) => !inList.has(keyOf(c))).every((c) => related.picked.has(keyOf(c)))}
                        onChange={(e) => setRelated({
                          ...related,
                          picked: new Set(e.target.checked ? related.customers.filter((c) => !inList.has(keyOf(c))).map(keyOf) : []),
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
                  {related.customers.map((c) => {
                    const added = inList.has(keyOf(c));
                    return (
                      <TableRow key={keyOf(c)} hover={!added} onClick={() => !added && togglePicked(c)} sx={{ cursor: added ? 'default' : 'pointer' }}>
                        <TableCell sx={cell} padding="checkbox">
                          <Checkbox size="small" disabled={added} checked={added || related.picked.has(keyOf(c))} />
                        </TableCell>
                        <TableCell sx={{ ...cell, color: added ? '#aaa' : 'inherit' }}>
                          {c.cuc_desc}
                          {added && <Chip size="small" label="Already in list" sx={{ ml: 1, height: 20 }} />}
                        </TableCell>
                        <TableCell sx={cell}>{c.cuc_place}</TableCell>
                        <TableCell sx={cell}>{c.company_branch}</TableCell>
                        <TableCell sx={cell}>{c.route_name}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setRelated(null)}>Cancel</Button>
              <Button variant="contained" onClick={addWithSubs}>
                Add{related.picked.size ? ` with ${related.picked.size} sub customer${related.picked.size > 1 ? 's' : ''}` : ''}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Details of a customer clicked in the Selected Customer list */}
      <Dialog open={Boolean(details)} onClose={() => setDetails(null)} maxWidth="sm" fullWidth>
        {details && (
          <>
            <DialogTitle sx={{ pb: 1 }}>{details.cuc_desc}</DialogTitle>
            <DialogContent dividers>
              <Box sx={{ display: 'grid', gridTemplateColumns: '150px 1fr', rowGap: 1.25, columnGap: 2, fontSize: 15 }}>
                {[
                  ['Branch', details.company_branch],
                  ['Customer Name', details.cuc_desc],
                  ['Address', [details.cuc_add1, details.cuc_add2, details.cuc_add3, details.cuc_add4,
                    details.cuc_pincode && `PIN ${details.cuc_pincode}`].filter(Boolean).join('\n')],
                  ['Place', details.cuc_place],
                  ['Mobile Number', details.cuc_mobile],
                  ['GSTIN', details.gst_number],
                  ['Sales Executive', details.salesexecutive_name],
                  ['Territory', details.territory_name],
                  ['Route', details.route_name],
                ].map(([label, value]) => [
                  <Box key={`${label}-l`} sx={{ color: '#666', fontWeight: 600 }}>{label}</Box>,
                  <Box key={`${label}-v`} sx={{ whiteSpace: 'pre-line', color: value ? '#222' : '#aaa' }}>{value || '—'}</Box>,
                ])}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetails(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={Boolean(notice)} autoHideDuration={3000} onClose={() => setNotice('')} message={notice} />
    </Box>
  );
}
