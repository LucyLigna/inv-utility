import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, FormControlLabel, Typography,
} from '@mui/material';
import { LockReset } from '@mui/icons-material';
import MasterScreen from '../../components/MasterScreen';
import FormSection from '../../components/FormSection';
import { StatusCell } from '../../components/ListTable';
import api, { errorMessage } from '../../api';
import { useAuth } from '../../auth';

// '2026-11-04 10:15' -> '04-11-2026 10:15'
const showDateTime = (d) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)} ${d.slice(11)}` : '');

// Screen rights for a 'User', grouped by module; administrators have every right
function RightsPicker({ form, setForm, readOnly }) {
  const [programs, setPrograms] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/users/programs').then(({ data }) => setPrograms(data)).catch((err) => setError(errorMessage(err)));
  }, []);

  if (form.user_type === 'Administrator') {
    return (
      <FormSection title="Rights">
        <Alert severity="info">Administrators have every right, including user administration.</Alert>
      </FormSection>
    );
  }

  const modules = [...new Map(programs.map((p) => [p.menu_code, p.menu_name])).entries()];
  const has = (code) => form.rights.includes(code);
  const toggle = (code) => setForm({ ...form, rights: has(code) ? form.rights.filter((c) => c !== code) : [...form.rights, code] });
  const setModule = (codes, on) => setForm({
    ...form,
    rights: on ? [...new Set([...form.rights, ...codes])] : form.rights.filter((c) => !codes.includes(c)),
  });

  return (
    <FormSection title="Rights *" hint="Tick the screens this user may use (at least one for an active user). Untick a screen to hide it from the user.">
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {modules.map(([menuCode, menuName]) => {
          const list = programs.filter((p) => p.menu_code === menuCode);
          const codes = list.map((p) => p.program_code);
          const all = codes.every(has);
          return (
            <Box key={menuCode} sx={{ border: '1px solid #e3e5ea', borderRadius: 1.5, p: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontWeight: 700 }}>{menuName}</Typography>
                {!readOnly && (
                  <Button size="small" onClick={() => setModule(codes, !all)}>{all ? 'Clear all' : 'Select all'}</Button>
                )}
              </Box>
              {list.map((p) => (
                <FormControlLabel
                  key={p.program_code}
                  sx={{ display: 'flex' }}
                  disabled={readOnly}
                  label={p.name}
                  control={<Checkbox size="small" checked={has(p.program_code)} onChange={() => toggle(p.program_code)} />}
                />
              ))}
            </Box>
          );
        })}
      </Box>
    </FormSection>
  );
}

const makeConfig = (me) => ({
  title: 'Users',
  entity: 'User',
  apiPath: '/users',
  exportFile: 'users',
  searchFields: ['username', 'user_type', 'status'],
  searchPlaceholder: 'Search user name or type',
  columns: [
    { label: 'User Name', field: 'username' },
    { label: 'User Type', field: 'user_type', width: 150 },
    {
      label: 'Rights',
      field: 'rights',
      width: 110,
      align: 'center',
      render: (r) => (r.user_type === 'Administrator' ? 'All' : `${r.rights.length} screens`),
      exportValue: (r) => (r.user_type === 'Administrator' ? 'All' : r.rights.length),
    },
    {
      label: 'Password',
      field: 'has_password',
      width: 190,
      render: (r) => (r.has_password ? `Set ${showDateTime(r.password_set_at)}` : 'Not set (created at next login)'),
      exportValue: (r) => (r.has_password ? `Set ${showDateTime(r.password_set_at)}` : 'Not set'),
    },
    {
      label: 'Last Login', field: 'last_login_at', width: 150, align: 'center',
      render: (r) => showDateTime(r.last_login_at), exportValue: (r) => showDateTime(r.last_login_at),
    },
    { label: 'Status', field: 'status', width: 130, render: (r) => <StatusCell status={r.status} /> },
  ],
  description: 'User name, user type, status and screen rights. A new user creates a password at the first login.',
  fields: [
    { name: 'username', label: 'User Name', required: true, maxLength: 50, unique: true, cols: 5 },
    {
      name: 'user_type',
      label: 'User Type',
      type: 'select',
      required: true,
      cols: 3,
      choices: [
        { code: 'User', name: 'User', status: 'Active' },
        { code: 'Administrator', name: 'Administrator', status: 'Active' },
      ],
      optionLabel: (o) => o.name,
    },
  ],
  statusCols: 4,
  empty: { username: '', user_type: 'User', status: 'Active', rights: [] },
  toForm: (r) => ({ username: r.username, user_type: r.user_type, status: r.status, rights: r.rights || [] }),
  validate: (f) => {
    if (/\s/.test(f.username.trim())) return 'User name cannot contain spaces';
    if (f.user_type === 'User' && f.status === 'Active' && !f.rights.length) {
      return 'Give an active user the right to at least one screen (tick it under Rights)';
    }
    return null;
  },
  renderExtra: (props) => <RightsPicker {...props} />,
  actions: [{
    label: 'Expire Password',
    icon: <LockReset />,
    availableFor: (r) => r.has_password,
    blockedReason: (r) => (r.code === me.user_code ? 'Use Change password (your name at the bottom left) for your own password.' : null),
    confirm: (r) => ({
      title: `Expire the password of ${r.username}?`,
      message: `${r.username}'s password stops working now. At the next login ${r.username} creates a new password.`,
      cancelLabel: 'Cancel',
      confirmLabel: 'Expire password',
    }),
    request: (r) => api.post(`/users/${r.code}/expire-password`),
    done: (r) => `Password of ${r.username} expired; a new one is created at the next login`,
  }],
});

export default function Users() {
  const { user } = useAuth();
  return <MasterScreen config={makeConfig(user)} />;
}
