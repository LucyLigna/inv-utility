import { Box, Typography } from '@mui/material';

// Small grey section title with a line after it, and an optional hint below ("POLICY ———")
export default function FormSection({ title, hint, children }) {
  return (
    <Box sx={{ gridColumn: 'span 12' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, letterSpacing: 1, color: '#555', textTransform: 'uppercase' }}>
          {title}
        </Typography>
        <Box sx={{ flex: 1, borderTop: '1px solid #e3e5ea' }} />
      </Box>
      {hint && <Typography sx={{ fontSize: 14, color: '#555', mt: 2 }}>{hint}</Typography>}
      {children && <Box sx={{ mt: 1.5 }}>{children}</Box>}
    </Box>
  );
}
