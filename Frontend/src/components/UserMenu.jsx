import { useState } from 'react';
import {
  Alert, Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, ListItemIcon,
  Menu, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { Key, Logout } from '@mui/icons-material';
import api, { errorMessage } from '../api';
import { useAuth } from '../auth';

// The logged-in user's button in the blue rail: who is signed in, Change password, Log out
export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [anchor, setAnchor] = useState(null);
  const [changing, setChanging] = useState(false);
  const [form, setForm] = useState({ current: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const openChange = () => {
    setAnchor(null);
    setForm({ current: '', password: '', confirm: '' });
    setError('');
    setDone(false);
    setChanging(true);
  };

  const change = async () => {
    if (form.password !== form.confirm) {
      setError('The two new passwords do not match');
      return;
    }
    try {
      await api.post('/auth/change-password', { current: form.current, password: form.password });
      setDone(true);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const field = (name, label) => (
    <TextField
      label={label} type="password" fullWidth value={form[name]} disabled={done}
      onChange={(e) => setForm({ ...form, [name]: e.target.value })}
    />
  );

  return (
    <>
      <Tooltip title={`${user.username} (${user.user_type})`} placement="right">
        <IconButton aria-label="user menu" onClick={(e) => setAnchor(e.currentTarget)} sx={{ mb: 1 }}>
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#fff', color: '#1a35b0', fontSize: 16, fontWeight: 700 }}>
            {user.username.charAt(0).toUpperCase()}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>{user.username}</Typography>
          <Typography variant="body2" color="text.secondary">{user.user_type}</Typography>
        </Box>
        <Divider />
        <MenuItem onClick={openChange}><ListItemIcon><Key fontSize="small" /></ListItemIcon>Change password</MenuItem>
        <MenuItem onClick={() => { setAnchor(null); signOut(); }}><ListItemIcon><Logout fontSize="small" /></ListItemIcon>Log out</MenuItem>
      </Menu>

      <Dialog open={changing} onClose={() => setChanging(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change password</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {error && <Alert severity="error">{error}</Alert>}
            {done && <Alert severity="success">Your password has been changed.</Alert>}
            {field('current', 'Current password')}
            {field('password', 'New password (at least 6 characters)')}
            {field('confirm', 'Confirm new password')}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChanging(false)}>{done ? 'Close' : 'Cancel'}</Button>
          {!done && <Button variant="contained" onClick={change}>Change password</Button>}
        </DialogActions>
      </Dialog>
    </>
  );
}
