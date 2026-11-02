import { Box, Button, IconButton, Tooltip } from '@mui/material';

// Black toolbar across the top of a screen. Each action: { label, icon, onClick, disabled, tooltip }.
// An action without a label is drawn as an icon button with its tooltip.
function Action({ label, icon, onClick, disabled, tooltip }) {
  if (!label) {
    return (
      <Tooltip title={tooltip || ''}>
        <IconButton onClick={onClick} disabled={disabled} sx={{ color: '#fff' }}>{icon}</IconButton>
      </Tooltip>
    );
  }
  return (
    <Button
      startIcon={icon}
      onClick={onClick}
      disabled={disabled}
      sx={{
        color: '#fff',
        fontWeight: 700,
        fontSize: 15,
        px: 2,
        '& .MuiButton-startIcon > *:nth-of-type(1)': { fontSize: 24 },
        '&.Mui-disabled': { color: '#6b6b6b' },
      }}
    >
      {label}
    </Button>
  );
}

export default function ActionBar({ left = [], right = [] }) {
  return (
    <Box
      sx={{
        position: 'sticky', top: 0, zIndex: 2, height: 56, bgcolor: '#000',
        display: 'flex', alignItems: 'center', px: 1, gap: 0.5,
      }}
    >
      {left.map((a) => <Action key={a.label || a.tooltip} {...a} />)}
      <Box sx={{ flex: 1 }} />
      {right.map((a) => <Action key={a.label || a.tooltip} {...a} />)}
    </Box>
  );
}
