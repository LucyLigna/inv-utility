import { useEffect, useState } from 'react';
import {
  Alert, Box, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Download, Refresh } from '@mui/icons-material';
import ActionBar from '../../components/ActionBar';
import api, { errorMessage } from '../../api';

const BORDER = '1px solid #d5d8e0';
const cell = { border: BORDER, px: 1.25, py: 0.6, fontSize: 14 };
const head = { ...cell, fontWeight: 700, bgcolor: '#f5f6fa', color: '#111' };
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const showDate = (d) => (d ? d.split('-').reverse().join('-') : '');
const hours = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

// Attendance Report (sample): one row per employee per day, from the kiosk's scans
export default function AttendanceReport() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    api.get('/attendance/report', { params: { from, to } })
      .then(({ data }) => { setRows(data); setError(''); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [from, to, reload]);

  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => !q || [r.emp_no, r.name, r.department].some((v) => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));

  const exportExcel = async () => {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    const h = (value) => ({ value, fontWeight: 'bold' });
    await writeExcelFile([
      [h('Date'), h('Emp #'), h('Name'), h('Department'), h('In'), h('Out'), h('Worked'), h('Scans'), h('All scans')],
      ...shown.map((r) => [showDate(r.day), r.emp_no, r.name, r.department || '', r.first_in || '', r.last_out || '',
        hours(r.minutes), r.scans, r.punches.join(', ')].map((value) => ({ value, type: typeof value === 'number' ? Number : String }))),
    ], { columns: [{ width: 12 }, { width: 10 }, { width: 30 }, { width: 20 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 7 }, { width: 50 }] })
      .toFile(`attendance ${from} to ${to}.xlsx`);
  };

  return (
    <Box>
      <ActionBar
        left={[
          { label: 'Refresh', icon: <Refresh />, onClick: () => setReload((k) => k + 1), disabled: loading },
          { label: 'Export Excel', icon: <Download />, onClick: exportExcel, disabled: !shown.length },
        ]}
      />
      <Box sx={{ p: 2.5 }}>
        <Typography variant="h5" mb={2}>Attendance Report</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField type="date" size="small" label="From date" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField type="date" size="small" label="To date" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" placeholder="Search number, name or department" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
          <Typography variant="body2" color="text.secondary">{shown.length} rows</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <TableContainer sx={{ maxHeight: 'calc(100vh - 290px)' }}>
            <Table stickyHeader size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow>
                  {['Date', 'Emp #', 'Name', 'Department', 'In', 'Out', 'Worked', 'Scans'].map((l) => (
                    <TableCell key={l} sx={{ ...head, textAlign: ['In', 'Out', 'Worked', 'Scans'].includes(l) ? 'center' : 'left' }}>{l}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={`${r.emp_code}|${r.day}`} hover>
                    <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>{showDate(r.day)}</TableCell>
                    <TableCell sx={cell}>{r.emp_no}</TableCell>
                    <TableCell sx={{ ...cell, fontWeight: 600 }}>{r.name}</TableCell>
                    <TableCell sx={cell}>{r.department}</TableCell>
                    <TableCell sx={{ ...cell, textAlign: 'center' }}>{r.first_in || '—'}</TableCell>
                    <TableCell sx={{ ...cell, textAlign: 'center' }}>
                      {r.still_in ? <Chip size="small" color="success" variant="outlined" label="In now" /> : (r.last_out || '—')}
                    </TableCell>
                    <TableCell sx={{ ...cell, textAlign: 'center' }}>{hours(r.minutes)}</TableCell>
                    <TableCell sx={{ ...cell, textAlign: 'center' }}>
                      <Tooltip title={r.punches.join(' · ')}><span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>{r.scans}</span></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {!shown.length && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ ...cell, color: '#888', py: 2 }}>
                      {loading ? 'Loading…' : 'No attendance for these dates.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Worked = time between each In and the Out after it. "In now": the last scan of the day was In. Point at Scans to see every scan.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
