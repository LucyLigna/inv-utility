import { Box, Typography } from '@mui/material';

export default function Home() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>Welcome to INV Utility</Typography>
      <Typography color="text.secondary">Open the menu with the button at the top left to choose a screen.</Typography>
    </Box>
  );
}
