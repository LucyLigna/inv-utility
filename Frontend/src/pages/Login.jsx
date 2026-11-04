import { useState } from 'react';
import {
  Alert, Box, Button, IconButton, InputAdornment, Paper, TextField, Typography,
} from '@mui/material';
import { LockOutlined, Visibility, VisibilityOff } from '@mui/icons-material';
import api, { errorMessage } from '../api';
import { useAuth } from '../auth';

const BLUE = '#1a35b0';

// Login. A user without a password (first login, or after an administrator expired it) creates one here.
export default function Login() {
  const { signIn } = useAuth();
  const [step, setStep] = useState('login'); // login | create
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (step === 'create' && password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const { data } = step === 'login'
        ? await api.post('/auth/login', { username, password })
        : await api.post('/auth/set-password', { username, password });
      if (data.needsPassword) {
        setUsername(data.username);
        setPassword('');
        setStep('create');
      } else {
        signIn(data);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const passwordAdornment = (
    <InputAdornment position="end">
      <IconButton aria-label={show ? 'hide password' : 'show password'} onClick={() => setShow((s) => !s)} edge="end">
        {show ? <VisibilityOff /> : <Visibility />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#eef1f8', p: 2 }}>
      <Paper component="form" onSubmit={submit} sx={{ width: 380, maxWidth: '100%', p: 4, borderRadius: 3 }} elevation={3}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: BLUE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LockOutlined />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: BLUE }}>INV Utility</Typography>
            <Typography variant="body2" color="text.secondary">
              {step === 'login' ? 'Sign in to continue' : `Create a password for ${username}`}
            </Typography>
          </Box>
        </Box>

        {step === 'create' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This is your first login, or your password was reset. Choose a password of at least 6 characters.
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {step === 'login' && (
          <TextField
            label="User name" fullWidth autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
            sx={{ mb: 2 }} autoComplete="username"
          />
        )}
        <TextField
          label={step === 'login' ? 'Password' : 'New password'} type={show ? 'text' : 'password'} fullWidth
          autoFocus={step === 'create'} value={password} onChange={(e) => setPassword(e.target.value)} sx={{ mb: 2 }}
          autoComplete={step === 'login' ? 'current-password' : 'new-password'} InputProps={{ endAdornment: passwordAdornment }}
          helperText={step === 'login' ? 'New users: leave empty and sign in to create your password' : ''}
        />
        {step === 'create' && (
          <TextField
            label="Confirm new password" type={show ? 'text' : 'password'} fullWidth value={confirm}
            onChange={(e) => setConfirm(e.target.value)} sx={{ mb: 2 }} autoComplete="new-password"
          />
        )}

        <Button type="submit" variant="contained" fullWidth size="large" disabled={busy || !username.trim()} sx={{ bgcolor: BLUE }}>
          {step === 'login' ? 'Sign in' : 'Save password and sign in'}
        </Button>
        {step === 'create' && (
          <Button fullWidth sx={{ mt: 1 }} onClick={() => { setStep('login'); setPassword(''); setConfirm(''); setError(''); }}>
            Back
          </Button>
        )}
      </Paper>
    </Box>
  );
}
