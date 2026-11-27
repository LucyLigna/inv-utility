// Entry of the Android attendance app (AttendanceApp/, built with vite.kiosk.config.js): login + Attendance Kiosk
import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { AuthProvider } from './auth';
import KioskApp from './pages/attendance/KioskApp';

const theme = createTheme({ palette: { primary: { main: '#1a35b0' } } });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <KioskApp />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
