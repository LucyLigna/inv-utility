import { useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../../auth';
import { appServer } from '../../api';
import Login from '../Login';
import Kiosk from './Kiosk';
import { SAFE_BOTTOM, SAFE_TOP } from '../driver/safeArea';

// The Android attendance app (AttendanceApp/, built with vite.kiosk.config.js): log in once with a user who has the
// Attendance Kiosk right, then the kiosk stays on screen. Inside the app the camera works on a plain http server
// (the page runs from the phone itself). The server address is hidden: tap the footer 5 times to change it.
export default function KioskApp() {
  const { user, checking, canOpen, signOut } = useAuth();
  const [askLogout, setAskLogout] = useState(false);

  let page;
  if (checking) {
    page = <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>;
  } else if (!user) {
    page = (
      <>
        <Login />
        <ServerFooter />
      </>
    );
  } else if (!canOpen('/attendance/kiosk')) {
    page = (
      <Box sx={{ p: 3, maxWidth: 480, mx: 'auto' }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {user.username} does not have the right to the Attendance Kiosk. Ask an administrator to give it in Users, or log in as another user.
        </Alert>
        <Button variant="contained" onClick={signOut}>Log out</Button>
      </Box>
    );
  } else {
    page = <Kiosk onLogout={() => setAskLogout(true)} />;
  }

  return (
    <Box sx={{ minHeight: '100vh', pt: SAFE_TOP, pb: SAFE_BOTTOM, bgcolor: '#f4f6fb' }}>
      {page}
      <Dialog open={askLogout} onClose={() => setAskLogout(false)}>
        <DialogTitle>Log out of the kiosk?</DialogTitle>
        <DialogContent>Attendance can't be marked on this device until someone logs in again.</DialogContent>
        <DialogActions>
          <Button onClick={() => setAskLogout(false)}>Stay logged in</Button>
          <Button color="error" variant="contained" onClick={() => { setAskLogout(false); signOut(); }}>Log out</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// "Server: …" under the login; 5 taps open a box to change it (e.g. http://192.168.3.24:8080 on office Wi-Fi)
function ServerFooter() {
  const taps = useRef(0);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(appServer.get());
  return (
    <>
      <Typography
        variant="caption" color="text.secondary"
        sx={{ display: 'block', textAlign: 'center', mt: 2, userSelect: 'none' }}
        onClick={() => {
          taps.current += 1;
          if (taps.current >= 5) {
            taps.current = 0;
            setValue(appServer.get());
            setOpen(true);
          }
        }}
      >
        Inventory Attendance
      </Typography>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Server address</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth margin="dense" value={value} onChange={(e) => setValue(e.target.value)}
            helperText={`Empty: ${appServer.default}`}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => { appServer.set(value); setOpen(false); }}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
