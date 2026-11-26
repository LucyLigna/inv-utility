import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, List, ListItem, ListItemText, Paper, Typography,
} from '@mui/material';
import { Fullscreen, Login as InIcon, Logout as OutIcon, Replay, HelpOutline } from '@mui/icons-material';
import api, { errorMessage } from '../../api';
import { MIN_FACE_WIDTH, cameraErrorText, loadFaceApi, readFace, startCamera } from './faceEngine';

// Attendance Kiosk (sample): a shared phone or tablet, logged in once, left on this screen. An employee looks at the
// camera; the face is read on the device and sent to the server, which marks In (first scan of the day) or Out / In
// in turn. Only one face may be in view. Repeated scans within two minutes are not marked again.
const SCAN_EVERY_MS = 500;
const SHOW_RESULT_MS = 3500;
const SHOW_UNKNOWN_MS = 2000;
const STEADY_FRAMES = 2; // the same single face this many scans in a row before it is sent

const deviceName = () => `${navigator.userAgentData?.platform || navigator.platform || ''} ${window.screen.width}x${window.screen.height}`.trim();

const RESULT_STYLE = {
  In: { bg: '#2e7d32', icon: <InIcon sx={{ fontSize: 56 }} /> },
  Out: { bg: '#1a35b0', icon: <OutIcon sx={{ fontSize: 56 }} /> },
  repeat: { bg: '#8a6d00', icon: <Replay sx={{ fontSize: 56 }} /> },
  unknown: { bg: '#b3261e', icon: <HelpOutline sx={{ fontSize: 56 }} /> },
};

export default function Kiosk() {
  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const [hint, setHint] = useState('Starting…');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { kind, title, line }
  const [recent, setRecent] = useState([]); // scans marked on this device since the page opened
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let stop = null;
    let alive = true;
    let timer = null;
    let steady = 0;
    let frames = []; // descriptors of the steady frames; their average is sent (less noise than one frame)
    const wait = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });

    const show = async (res, ms) => {
      setResult(res);
      await wait(ms);
      if (alive) setResult(null);
    };

    (async () => {
      let faceapi;
      try {
        setHint('Loading face recognition…');
        faceapi = await loadFaceApi();
        setHint('Starting the camera…');
        stop = await startCamera(videoRef.current, 'user');
        if (!alive) { stop(); return; }
      } catch (err) {
        if (alive) setError(err?.name ? cameraErrorText(err) : `Face recognition could not be loaded: ${err.message}`);
        setHint('');
        return;
      }
      while (alive) {
        let face = null;
        try {
          face = await readFace(faceapi, videoRef.current);
        } catch {
          face = null;
        }
        if (!alive) break;
        if (!face) { steady = 0; setHint('Look at the camera'); }
        else if (face.many) { steady = 0; setHint('One person at a time, please'); }
        else if (face.box.width < MIN_FACE_WIDTH) { steady = 0; setHint('Come closer to the camera'); }
        else steady += 1;
        if (steady === 0) frames = [];
        else if (steady > 0 && face && !face.many) frames.push(face.descriptor);

        if (steady >= STEADY_FRAMES) {
          const descriptor = frames[0].map((_, i) => frames.reduce((sum, f) => sum + f[i], 0) / frames.length);
          steady = 0;
          frames = [];
          setHint('Checking…');
          try {
            const { data } = await api.post('/attendance/punch', { descriptor, device: deviceName() });
            if (!data.matched) {
              await show({ kind: 'unknown', title: 'Not recognised', line: data.unsure ? 'Please look straight at the camera and try again' : 'Ask the office to enrol your face' }, SHOW_UNKNOWN_MS);
            } else if (data.repeat) {
              await show({ kind: 'repeat', title: data.name, line: `Already marked ${data.type} at ${data.time}` }, SHOW_RESULT_MS);
            } else {
              setRecent((r) => [{ ...data, key: `${data.emp_no}-${Date.now()}` }, ...r].slice(0, 8));
              await show({ kind: data.type, title: data.name, line: `${data.type === 'In' ? 'Welcome! In' : 'Goodbye! Out'} at ${data.time}` }, SHOW_RESULT_MS);
            }
          } catch (err) {
            await show({ kind: 'unknown', title: 'Could not mark attendance', line: errorMessage(err) }, SHOW_RESULT_MS);
          }
        } else {
          await wait(SCAN_EVERY_MS);
        }
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      if (stop) stop();
    };
  }, []);

  const style = result && RESULT_STYLE[result.kind];
  return (
    <Box ref={boxRef} sx={{ p: 2.5, bgcolor: '#f4f6fb', minHeight: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">Attendance Kiosk</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography sx={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Typography>
          {document.fullscreenEnabled && (
            <Button size="small" startIcon={<Fullscreen />} onClick={() => boxRef.current?.requestFullscreen?.()}>Full screen</Button>
          )}
        </Box>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 1fr' }, gap: 2.5 }}>
        <Box sx={{ position: 'relative', bgcolor: '#111', borderRadius: 2, overflow: 'hidden', aspectRatio: '4 / 3', maxHeight: '72vh' }}>
          <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          {/* face guide */}
          <Box sx={{ position: 'absolute', left: '50%', top: '48%', width: '38%', aspectRatio: '3 / 4', transform: 'translate(-50%, -50%)', border: '3px dashed rgba(255,255,255,0.55)', borderRadius: '50%' }} />
          {!result && hint && (
            <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, p: 1.5, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', textAlign: 'center', fontSize: 20, display: 'flex', justifyContent: 'center', gap: 1.5, alignItems: 'center' }}>
              {/…/.test(hint) && <CircularProgress size={20} color="inherit" />}
              {hint}
            </Box>
          )}
          {result && (
            <Box sx={{ position: 'absolute', inset: 0, bgcolor: `${style.bg}e6`, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', p: 2 }}>
              {style.icon}
              <Typography sx={{ fontSize: { xs: 26, md: 36 }, fontWeight: 700, mt: 1 }}>{result.title}</Typography>
              <Typography sx={{ fontSize: { xs: 18, md: 24 } }}>{result.line}</Typography>
            </Box>
          )}
        </Box>
        <Paper variant="outlined" sx={{ p: 1.5, alignSelf: 'start' }}>
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Marked on this device</Typography>
          {!recent.length ? (
            <Typography variant="body2" color="text.secondary">Nobody yet.</Typography>
          ) : (
            <List dense disablePadding>
              {recent.map((r) => (
                <ListItem key={r.key} disableGutters>
                  <ListItemText
                    primary={r.name}
                    secondary={`${r.emp_no} · ${r.type} ${r.time}`}
                    secondaryTypographyProps={{ sx: { color: r.type === 'In' ? '#2e7d32' : '#1a35b0', fontWeight: 600 } }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
