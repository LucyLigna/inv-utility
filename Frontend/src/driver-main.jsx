// Entry of the Android driver app (DriverApp/, built with vite.driver.config.js): only the driver delivery page
import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import DriverApp from './pages/driver/DriverApp';

const theme = createTheme({ palette: { primary: { main: '#1e4f91' } } });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DriverApp />
    </ThemeProvider>
  </React.StrictMode>
);
