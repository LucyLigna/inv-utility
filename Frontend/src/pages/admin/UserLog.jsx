import { useEffect, useState } from 'react';
import {
  Alert, Box, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { Download, Refresh } from '@mui/icons-material';
import ActionBar from '../../components/ActionBar';
import api, { errorMessage } from '../../api';

const BORDER = '1px solid #d5d8e0';
const cell = { border: BORDER, px: 1.25, py: 0.6, fontSize: 13, verticalAlign: 'top' };
const head = { ...cell, fontWeight: 700, bgcolor: '#f5f6fa', color: '#111' };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// '2026-11-04 10:15:30' -> '04-11-2026 10:15:30'
const showTime = (t) => (t ? `${t.slice(8, 10)}-${t.slice(5, 7)}-${t.slice(0, 4)} ${t.slice(11)}` : '');
const ACTION_COLORS = { 'Login failed': '#b3261e', Delete: '#b3261e', 'Expire password': '#c77700' };

// Who did what, and when: logins, password changes and every change made on a screen (sys_user_log)
export default function UserLog() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ users: [], actions: [] });
  const [rows, setRows] = useState([]);
  const [limited, setLimited] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api.get('/user-log/filters').then(({ data }) => setFilters(data)).catch((err) => setError(errorMessage(err)));
  }, [reload]);

  useEffect(() => {
    const timer = setTimeout(() => {
      api.get('/user-log', { params: { from, to, user, action, search } })
        .then(({ data }) => { setRows(data.rows); setLimited(data.limited); setError(''); })
        .catch((err) => setError(errorMessage(err)));
    }, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [from, to, user, action, search, reload]);

  const exportExcel = async () => {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    const bold = (value) => ({ value, fontWeight: 'bold' });
    await writeExcelFile([
      ['Time', 'User', 'Action', 'Screen', 'Record', 'Details', 'IP address'].map(bold),
      ...rows.map((r) => [showTime(r.log_time), r.username, r.action, r.module, r.record_ref, r.details, r.ip_address]),
    ], { sheet: 'User log', columns: [{ width: 20 }, { width: 14 }, { width: 18 }, { width: 26 }, { width: 20 }, { width: 60 }, { width: 16 }] })
      .toFile(`user log ${from} to ${to}.xlsx`);
  };

  return (
    <Box>
      <ActionBar
        left={[{ label: 'Refresh', icon: <Refresh />, onClick: () => setReload((n) => n + 1) }]}
        right={[{ label: 'Export Excel', icon: <Download />, onClick: exportExcel, disabled: !rows.length }]}
      />
      <Box sx={{ p: 2.5 }}>
        <Typography variant="h5" mb={2}>User Log</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField type="date" size="small" label="From" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField type="date" size="small" label="To" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField select size="small" label="User" value={user} onChange={(e) => setUser(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">All users</MenuItem>
            {filters.users.map((u) => <MenuItem key={u.user_code} value={u.user_code}>{u.username}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Action" value={action} onChange={(e) => setAction(e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="">All actions</MenuItem>
            {filters.actions.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
          </TextField>
          <TextField size="small" placeholder="Search screen, record, details" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
        </Paper>
        <Typography variant="body2" color="text.secondary" mb={1}>
          {rows.length} entries{limited ? ' (the latest 2000; narrow the dates to see older ones)' : ''}, newest first.
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 290px)' }}>
          <Table stickyHeader size="small" sx={{ borderCollapse: 'collapse' }}>
            <TableHead>
              <TableRow>
                {['Time', 'User', 'Action', 'Screen', 'Record', 'Details', 'IP address'].map((h) => <TableCell key={h} sx={head}>{h}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.log_id} hover>
                  <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>{showTime(r.log_time)}</TableCell>
                  <TableCell sx={{ ...cell, fontWeight: 600 }}>{r.username}</TableCell>
                  <TableCell sx={{ ...cell, whiteSpace: 'nowrap', color: ACTION_COLORS[r.action] || 'inherit', fontWeight: 600 }}>{r.action}</TableCell>
                  <TableCell sx={cell}>{r.module}</TableCell>
                  <TableCell sx={cell}>{r.record_ref}</TableCell>
                  <TableCell sx={{ ...cell, color: '#555', wordBreak: 'break-word', maxWidth: 420 }}>{r.details}</TableCell>
                  <TableCell sx={{ ...cell, whiteSpace: 'nowrap', color: '#777' }}>{r.ip_address}</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ ...cell, color: '#888' }}>No activity for these filters</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}
