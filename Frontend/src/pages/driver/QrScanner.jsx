import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material';

// Full-screen camera that reads a QR code (jsQR on video frames) and calls onResult(text) once.
// The code printed under the QR can be typed instead, e.g. when the camera is not allowed. Phone browsers allow
// the camera only on https pages (or localhost).
export default function QrScanner({ open, onClose, onResult }) {
  const videoRef = useRef(null);
  const [cameraError, setCameraError] = useState('');
  const [typed, setTyped] = useState('');
  // The latest onResult, so a re-render of the page doesn't restart the camera
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    if (!open) return undefined;
    setTyped('');
    setCameraError('');
    let stream = null;
    let timer = null;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('The camera works only when this page is opened over https. Type the code printed under the QR instead.');
        return;
      }
      try {
        const [{ default: jsQR }, media] = await Promise.all([
          import('jsqr'),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }),
        ]);
        stream = media;
        if (stopped) return;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        const scan = () => {
          if (stopped) return;
          if (video.readyState >= 2 && video.videoWidth) {
            // Read a reduced frame: quicker, and plenty for a printed QR
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const found = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
            if (found?.data) {
              stopped = true;
              if (navigator.vibrate) navigator.vibrate(120);
              resultRef.current(found.data);
              return;
            }
          }
          timer = setTimeout(scan, 200);
        };
        scan();
      } catch (err) {
        setCameraError(err.name === 'NotAllowedError'
          ? 'Camera permission was refused. Allow the camera for this site, or type the code printed under the QR.'
          : `The camera could not be started (${err.message}). Type the code printed under the QR instead.`);
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <DialogTitle sx={{ pb: 1 }}>Scan the customer's QR code</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {cameraError ? <Alert severity="warning">{cameraError}</Alert> : (
          <Box sx={{ position: 'relative', bgcolor: '#000', borderRadius: 1, overflow: 'hidden', aspectRatio: '3 / 4', maxHeight: '60vh' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <Box sx={{ position: 'absolute', inset: '18%', border: '3px solid rgba(255,255,255,0.85)', borderRadius: 2 }} />
          </Box>
        )}
        <Box component="form" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) onResult(typed.trim()); }}>
          <Typography variant="body2" color="text.secondary" mb={1}>Or type the 8-character code printed under the QR:</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small" fullWidth value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())}
              inputProps={{ autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false, maxLength: 12, style: { letterSpacing: 3 } }}
            />
            <Button type="submit" variant="contained" disabled={!typed.trim()}>Mark</Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
