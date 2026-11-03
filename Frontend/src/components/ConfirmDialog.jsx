import { useRef, useState } from 'react';
import { Box, Button, Dialog, IconButton, Typography } from '@mui/material';
import { Close, WarningAmberRounded } from '@mui/icons-material';

const CREAM = '#fdf0d5';
const AMBER = '#b85c0b';
const BROWN = '#6b4a1f';
const RED = '#b42318';

// "Are you sure?" box: cream background, amber warning icon, a plain button to back out and a red one to go ahead.
// open, title, message (text or JSX), confirmLabel ('Discard'), cancelLabel ('Keep editing'), onConfirm, onCancel
export default function ConfirmDialog({
  open, title = 'Are you sure?', message, confirmLabel = 'Yes', cancelLabel = 'No', onConfirm, onCancel,
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { bgcolor: CREAM, borderRadius: 3, boxShadow: '0 12px 32px rgba(70, 40, 0, 0.25)' } }}
    >
      <Box sx={{ position: 'relative', p: 3, pr: 5 }}>
        <IconButton aria-label="close" onClick={onCancel} sx={{ position: 'absolute', top: 10, right: 10, color: BROWN }}>
          <Close />
        </IconButton>
        <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>
          <Box
            sx={{
              flexShrink: 0, width: 56, height: 56, borderRadius: '50%', bgcolor: AMBER, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <WarningAmberRounded sx={{ fontSize: 30 }} />
          </Box>
          <Box sx={{ pt: 0.5 }}>
            <Typography sx={{ fontSize: 22, fontWeight: 700, color: '#1f1a14', mb: 1 }}>{title}</Typography>
            <Typography component="div" sx={{ fontSize: 15, color: BROWN, lineHeight: 1.6 }}>{message}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3, mr: -2 }}>
          <Button
            onClick={onCancel}
            sx={{
              bgcolor: '#fff', color: '#1f1a14', fontWeight: 700, fontSize: 16, textTransform: 'none',
              px: 3, py: 1, borderRadius: 2.5, border: '4px solid #d9c9ab',
              '&:hover': { bgcolor: '#fffaf0' },
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            autoFocus
            onClick={onConfirm}
            sx={{
              bgcolor: RED, color: '#fff', fontWeight: 700, fontSize: 16, textTransform: 'none',
              px: 3, py: 1, borderRadius: 2.5, border: '4px solid transparent',
              '&:hover': { bgcolor: '#931c13' },
            }}
          >
            {confirmLabel}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}

// Promise-style use: const [confirm, confirmDialog] = useConfirm();
//   if (await confirm({ message: '...', confirmLabel: 'Discard' })) { ... }   and render {confirmDialog}
export function useConfirm() {
  const [options, setOptions] = useState(null);
  const resolver = useRef(null);
  const confirm = (opts) => new Promise((resolve) => {
    resolver.current = resolve;
    setOptions(opts);
  });
  const finish = (answer) => {
    setOptions(null);
    resolver.current?.(answer);
  };
  const dialog = (
    <ConfirmDialog open={Boolean(options)} {...options} onConfirm={() => finish(true)} onCancel={() => finish(false)} />
  );
  return [confirm, dialog];
}
