import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, List, ListItemButton, ListItemText, Paper, Snackbar, TextField, Typography,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import api, { errorMessage } from '../../api';
import EnrolFaceDialog from './EnrolFaceDialog';

// Enrol faces on the kiosk device (Android app): choose an employee, then the same Enrol Face dialog as on the web.
// New employees are added on the web (Attendance > Employee). Only active employees are listed.
export default function EnrolPicker({ onBack }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [enrolling, setEnrolling] = useState(null);
  const [notice, setNotice] = useState('');

  const load = () => api.get('/att-employees')
    .then(({ data }) => { setRows(data.filter((e) => e.status === 'Active')); setError(''); })
    .catch((err) => setError(errorMessage(err)));
  useEffect(() => { load(); }, []);

  const q = search.trim().toLowerCase();
  const shown = (rows || []).filter((e) => !q || [e.emp_no, e.name, e.department].some((v) => String(v || '').toLowerCase().includes(q)));

  return (
    <Box sx={{ p: 2.5, maxWidth: 720, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button startIcon={<ArrowBack />} onClick={onBack}>Back to kiosk</Button>
        <Typography variant="h6" sx={{ flex: 1, textAlign: 'right' }}>Enrol Face</Typography>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TextField
        fullWidth size="small" placeholder="Search number, name or department" value={search}
        onChange={(e) => setSearch(e.target.value)} sx={{ mb: 1.5, bgcolor: '#fff' }}
      />
      <Paper variant="outlined">
        {rows === null ? (
          <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
        ) : !shown.length ? (
          <Typography sx={{ p: 2, color: '#888', textAlign: 'center' }}>
            {rows.length ? 'No employee matches.' : 'No employees yet. Add them on the web: Attendance > Employee.'}
          </Typography>
        ) : (
          <List disablePadding>
            {shown.map((e) => (
              <ListItemButton key={e.code} divider onClick={() => setEnrolling(e)}>
                <ListItemText primary={e.name} secondary={[e.emp_no, e.department].filter(Boolean).join(' · ')} />
                {e.faces
                  ? <Chip size="small" color="success" label={`${e.faces} sample${e.faces > 1 ? 's' : ''}`} />
                  : <Chip size="small" variant="outlined" label="Not enrolled" />}
              </ListItemButton>
            ))}
          </List>
        )}
      </Paper>
      <EnrolFaceDialog
        employee={enrolling}
        onClose={(saved) => {
          if (saved) {
            setNotice(`Face samples saved for ${enrolling.name}`);
            load();
          }
          setEnrolling(null);
        }}
      />
      <Snackbar open={Boolean(notice)} autoHideDuration={3000} onClose={() => setNotice('')} message={notice} />
    </Box>
  );
}
