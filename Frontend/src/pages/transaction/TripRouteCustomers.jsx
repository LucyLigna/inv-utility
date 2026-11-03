import { useEffect, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Paper, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  DeleteOutline, DragIndicator, KeyboardArrowDown, KeyboardArrowRight, PersonAddAlt1, PlayArrow, Refresh, Save,
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
  // Sub-customer pop-up: { customer, gi, match, value, customers, picked: Map key -> customer, warning }
  const [related, setRelated] = useState(null);
  const [subSearch, setSubSearch] = useState('');
  const [subResults, setSubResults] = useState([]);
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

  // Customers with the same GST number (or mobile) as c, in the route's branches
  const fetchRelated = (c) => api.get(`/trip-route-customers/${loaded.route.code}/related`, {
    params: { company_code: c.company_code, ba_code: c.ba_code, cu_code: c.cu_code },
  }).then(({ data }) => data);

  // The sub-customer pop-up. gi is null when adding a new main customer, or the index of an existing group.
  const openSubPicker = (customer, gi, data) => {
    setRelated({ customer, gi, ...data, picked: new Map(), warning: '' });
    setSubSearch('');
    setSubResults([]);
  };

  // Picking a search result: offer customers with the same GST number (or mobile) to add under it
  const pick = async (c) => {
    if (inList.has(keyOf(c))) return;
    try {
      const data = await fetchRelated(c);
      if (!data.customers.length) {
        setGroups((g) => [...g, { main: c, subs: [] }]);
        return;
      }
      openSubPicker(c, null, data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // "Add sub customers" on a main customer already in the list
  const addSubsTo = async (gi) => {
    try {
      openSubPicker(groups[gi].main, gi, await fetchRelated(groups[gi].main));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // The pop-up's Add button. With nothing ticked, a new main customer is added on its own only after the
  // user confirms (confirmed = true); for an existing main customer there is nothing to add, so it just warns.
  const confirmSubs = (confirmed = false) => {
    const subs = [...related.picked.values()];
    if (!subs.length && related.gi !== null) {
      setRelated({ ...related, warning: 'No customer selected. Tick at least one customer to add as a sub customer.' });
      return;
    }
    if (!subs.length && !confirmed) {
      setRelated({ ...related, askConfirm: true });
      return;
    }
    if (related.gi === null) {
      setGroups((g) => [...g, { main: related.customer, subs }]);
    } else {
      setGroups((g) => g.map((grp, i) => (i === related.gi ? { ...grp, subs: [...grp.subs, ...subs] } : grp)));
    }
    if (subs.length) setExpanded((s) => new Set(s).add(keyOf(related.customer)));
    setRelated(null);
  };

  const togglePicked = (c) => {
    const picked = new Map(related.picked);
    if (picked.has(keyOf(c))) picked.delete(keyOf(c));
    else picked.set(keyOf(c), c);
    setRelated({ ...related, picked, warning: '', askConfirm: false });
  };

  // Search inside the pop-up, for sub customers that don't share the GST number or mobile
  useEffect(() => {
    if (!related || subSearch.trim().length < 2) {
      setSubResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/trip-route-customers/${loaded.route.code}/search`, { params: { name: subSearch } });
        setSubResults(data.filter((c) => keyOf(c) !== keyOf(related.customer)));
      } catch (err) {
        setError(errorMessage(err));
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [subSearch, related?.customer]);

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
        <TableCell sx={{ ...cell, py: 0, width: isSub ? 48 : 84, whiteSpace: 'nowrap' }} align="center">
          {!isSub && (
            <Tooltip title="Add sub customers">
              <IconButton size="small" aria-label="add sub customers" onClick={() => addSubsTo(gi)}>
                <PersonAddAlt1 fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
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

      {/* Sub customers: for a new main customer, or added to one already in the list */}
      <Dialog open={Boolean(related)} onClose={() => setRelated(null)} maxWidth="md" fullWidth>
        {related && (() => {
          const isNew = related.gi === null;
          const searching = subSearch.trim().length >= 2;
          const list = searching ? subResults : related.customers;
          const selectable = list.filter((c) => !inList.has(keyOf(c)));
          const count = related.picked.size;
          const matchLabel = related.match === 'gst' ? 'GST number' : 'mobile number';
          return (
            <>
              <DialogTitle>
                {isNew ? `Add ${related.customer.cuc_desc}` : `Add sub customers to ${related.customer.cuc_desc}`}
              </DialogTitle>
              <DialogContent>
                <Typography variant="body2" mb={1.5}>
                  {isNew
                    ? <><b>{related.customer.cuc_desc}</b> ({related.customer.company_branch}) will be added as the main customer. Tick the customers to list under it.</>
                    : <>Tick the customers to add under <b>{related.customer.cuc_desc}</b> ({related.customer.company_branch}).</>}
                </Typography>
                {related.warning && <Alert severity="warning" sx={{ mb: 1.5 }}>{related.warning}</Alert>}
                <TextField
                  size="small"
                  fullWidth
                  label="Search other customers"
                  placeholder="Type a name to find customers that don't share the GST number or mobile"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  sx={{ mb: 1.5 }}
                />
                <Typography variant="body2" color="text.secondary" mb={1}>
                  {searching
                    ? `${list.length} customers matching "${subSearch.trim()}"`
                    : related.match
                      ? `${list.length} customers with the same ${matchLabel} (${related.value})`
                      : 'This customer has no GST or mobile number to match on. Search above to find sub customers.'}
                  {count > 0 && <b> · {count} selected</b>}
                </Typography>
                <Table size="small" sx={{ borderCollapse: 'collapse' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ ...head, width: 48 }} padding="checkbox">
                        <Checkbox
                          size="small"
                          disabled={!selectable.length}
                          checked={selectable.length > 0 && selectable.every((c) => related.picked.has(keyOf(c)))}
                          onChange={(e) => {
                            const picked = new Map(related.picked);
                            selectable.forEach((c) => (e.target.checked ? picked.set(keyOf(c), c) : picked.delete(keyOf(c))));
                            setRelated({ ...related, picked, warning: '' });
                          }}
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
                    {!list.length && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ ...cell, color: '#888' }}>No customers to show</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setRelated(null)}>Cancel</Button>
                <Button variant="contained" onClick={() => confirmSubs()}>Add</Button>
              </DialogActions>

              {/* Nothing ticked for a new main customer: make sure the user means to add it on its own */}
              <Dialog open={Boolean(related.askConfirm)} onClose={() => setRelated({ ...related, askConfirm: false })}>
                <DialogTitle>No sub customer selected</DialogTitle>
                <DialogContent>
                  <Typography>
                    Add <b>{related.customer.cuc_desc}</b> without any sub customers?
                  </Typography>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setRelated({ ...related, askConfirm: false })}>No</Button>
                  <Button variant="contained" onClick={() => confirmSubs(true)}>Yes, add</Button>
                </DialogActions>
              </Dialog>
            </>
          );
        })()}
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
