import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Typography,
} from '@mui/material';
import { CameraAlt, CheckCircle } from '@mui/icons-material';
import api, { errorMessage } from '../../api';
import { MIN_FACE_WIDTH, cameraErrorText, loadFaceApi, readFace, startCamera } from './faceEngine';

// Face samples are taken one at a time; a few with slightly different angles make the kiosk more reliable
const SAMPLES = 3;

// Enrol Face: camera, Take Sample (needs exactly one face, close enough), then Save. onClose(saved)
export default function EnrolFaceDialog({ employee, onClose }) {
  const videoRef = useRef(null);
  const faceapiRef = useRef(null);
  const [status, setStatus] = useState(''); // what the camera sees, while starting or taking a sample
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [samples, setSamples] = useState([]);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!employee) return undefined;
    let stop = null;
    let cancelled = false;
    setSamples([]);
    setReplace(Boolean(employee.faces));
    setError('');
    setReady(false);
    (async () => {
      try {
        setStatus('Loading face recognition…');
        faceapiRef.current = await loadFaceApi();
        if (cancelled) return;
        setStatus('Starting the camera…');
        stop = await startCamera(videoRef.current, 'user');
        if (cancelled) { stop(); return; }
        setStatus('');
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err?.name ? cameraErrorText(err) : `Face recognition could not be loaded: ${err.message}`);
        setStatus('');
      }
    })();
    return () => {
      cancelled = true;
      if (stop) stop();
    };
  }, [employee]);

  const takeSample = async () => {
    setBusy(true);
    setError('');
    try {
      const face = await readFace(faceapiRef.current, videoRef.current);
      if (!face) setError('No face found. Face the camera in good light.');
      else if (face.many) setError('More than one face is in view. Only the employee should face the camera.');
      else if (face.box.width < MIN_FACE_WIDTH) setError('The face is too far away. Come closer to the camera.');
      else setSamples((s) => [...s, face.descriptor]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/att-employees/${employee.code}/faces`, { descriptors: samples, replace });
      onClose(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const enough = samples.length >= SAMPLES;
  return (
    <Dialog open={Boolean(employee)} onClose={() => !busy && onClose(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Enrol Face · {employee?.name} ({employee?.emp_no})</DialogTitle>
      <DialogContent>
        <Box sx={{ position: 'relative', bgcolor: '#111', borderRadius: 1, overflow: 'hidden', aspectRatio: '4 / 3' }}>
          {/* mirrored, like a selfie camera */}
          <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          {status && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, color: '#fff' }}>
              <CircularProgress size={22} color="inherit" />
              {status}
            </Box>
          )}
        </Box>
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          Take {SAMPLES} samples: look straight at the camera, then turn the head slightly left and right. Good, even light helps.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
          {Array.from({ length: SAMPLES }, (_, i) => (
            <CheckCircle key={i} sx={{ color: i < samples.length ? '#2e7d32' : '#d0d4dc' }} />
          ))}
          <Typography variant="body2" color="text.secondary">{samples.length} of {SAMPLES} taken</Typography>
        </Box>
        {Boolean(employee?.faces) && (
          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Checkbox checked={replace} onChange={(e) => setReplace(e.target.checked)} />}
            label={`Replace the ${employee.faces} sample${employee.faces > 1 ? 's' : ''} taken before`}
          />
        )}
        {error && <Alert severity="warning" sx={{ mt: 1.5 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)} disabled={busy}>Cancel</Button>
        {samples.length > 0 && <Button onClick={() => setSamples([])} disabled={busy}>Start again</Button>}
        <Button variant="outlined" startIcon={<CameraAlt />} onClick={takeSample} disabled={!ready || busy || enough}>
          Take Sample
        </Button>
        <Button variant="contained" onClick={save} disabled={!enough || busy}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
