import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { useAuth } from '../../auth';
import api, { appServer, errorMessage } from '../../api';
import Login from '../Login';
import Kiosk from './Kiosk';
import EnrolPicker from './EnrolPicker';
import { SAFE_BOTTOM, SAFE_TOP } from '../driver/safeArea';

// The Android attendance app (AttendanceApp/, built with vite.kiosk.config.js).
//  - Set up once: a user with the Attendance Kiosk right logs in; the device gets a kiosk key (it can only mark
//    attendance) and the user is logged out again.
//  - Then the kiosk runs with nobody logged in.
//  - Enrol Face asks for a login (a user with the Employee right) each time; Back logs out again.
// Inside the app the camera works on a plain http server (the page runs from the device itself).
// The server address is hidden: tap "Inventory Attendance" under the login 5 times.
const KEY_STORE = 'inv_kiosk_key';
const kioskKeyStore = {
  get: () => { try { return localStorage.getItem(KEY_STORE); } catch { return null; } },
  set: (v) => { try { if (v) localStorage.setItem(KEY_STORE, v); else localStorage.removeItem(KEY_STORE); } catch { /* not kept */ } },
};
const deviceName = () => `${navigator.userAgentData?.platform || navigator.platform || 'Android'} ${window.screen.width}x${window.screen.height}`.trim();

export default function KioskApp() {
  const { user, checking, canOpen, signOut } = useAuth();
  const [kioskKey, setKioskKey] = useState(kioskKeyStore.get());
  const [mode, setMode] = useState('kiosk'); // kiosk | enrol
  const [message, setMessage] = useState(''); // why the device needs setting up again
  const [settingUp, setSettingUp] = useState(false);

  // Nobody stays logged in on the kiosk (e.g. the app was closed while enrolling)
  useEffect(() => {
    if (kioskKey && mode === 'kiosk' && user) signOut();
  }, [kioskKey, mode, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Setting up: once a user with the right has logged in, get the device's kiosk key and log out
  useEffect(() => {
    if (kioskKey || !user || !canOpen('/attendance/kiosk')) return;
    setSettingUp(true);
    api.post('/attendance/kiosk-device', { device: deviceName() })
      .then(({ data }) => {
        kioskKeyStore.set(data.token);
        setKioskKey(data.token);
        setMessage('');
      })
      .catch((err) => setMessage(`The kiosk could not be set up: ${errorMessage(err)}`))
      .finally(() => {
        setSettingUp(false);
        signOut();
      });
  }, [kioskKey, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const backToKiosk = () => {
    setMode('kiosk');
    if (user) signOut();
  };

  let page;
  if (checking || settingUp) {
    page = <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>;
  } else if (!kioskKey) {
    // Set up this device
    page = user && !canOpen('/attendance/kiosk') ? (
      <NoRight text={`${user.username} does not have the right to the Attendance Kiosk, so can't set up this device.`} onDone={signOut} />
    ) : (
      <>
        <Box sx={{ maxWidth: 420, mx: 'auto', px: 2, pt: 3 }}>
          {message && <Alert severity="warning" sx={{ mb: 1 }}>{message}</Alert>}
          <Alert severity="info">
            <b>Set up this device as the attendance kiosk.</b> Log in once with a user who has the Attendance Kiosk
            right. After that the kiosk works with nobody logged in.
          </Alert>
        </Box>
        <Login />
        <ServerFooter />
      </>
    );
  } else if (mode === 'enrol') {
    // Enrol Face: needs a login with the Employee right
    if (!user) {
      page = (
        <>
          <Box sx={{ maxWidth: 420, mx: 'auto', px: 2, pt: 2 }}>
            <Button startIcon={<ArrowBack />} onClick={backToKiosk}>Back to kiosk</Button>
            <Alert severity="info" sx={{ mt: 1 }}>Log in to enrol faces (a user with the Employee right).</Alert>
          </Box>
          <Login />
          <ServerFooter />
        </>
      );
    } else if (!canOpen('/attendance/employee')) {
      page = <NoRight text={`${user.username} does not have the right to Employee, so can't enrol faces.`} onDone={backToKiosk} />;
    } else {
      // The kiosk (and its camera) is closed while enrolling: the front camera can't be used twice at once
      page = <EnrolPicker onBack={backToKiosk} />;
    }
  } else {
    page = (
      <Kiosk
        kioskKey={kioskKey}
        onEnrol={() => setMode('enrol')}
        onKeyRejected={(why) => {
          kioskKeyStore.set(null);
          setKioskKey(null);
          setMessage(why);
        }}
      />
    );
  }

  return <Box sx={{ minHeight: '100vh', pt: SAFE_TOP, pb: SAFE_BOTTOM, bgcolor: '#f4f6fb' }}>{page}</Box>;
}

function NoRight({ text, onDone }) {
  return (
    <Box sx={{ p: 3, maxWidth: 480, mx: 'auto' }}>
      <Alert severity="warning" sx={{ mb: 2 }}>{text} Ask an administrator to give the right in Users, or log in as another user.</Alert>
      <Button variant="contained" onClick={onDone}>OK</Button>
    </Box>
  );
}

// "Inventory Attendance" under the login; 5 taps open a box to change the server (e.g. http://192.168.3.24:8080)
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
